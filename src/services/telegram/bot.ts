// src/services/telegram/bot.ts
// Catalyst Apex Trader v2.1 — Main Bot
//
// Supports two modes controlled by feature flags:
// - HELIUS mode:     webhook fires instantly on new pair → security → score → signal
// - DEXSCREENER mode: polls every 30s (fallback if Helius not active)
//
// Also runs Pump.fun graduation monitor every 60s when enabled.

import { createWebhookServer, registerHeliusWebhook, enrichPairFromDexScreener } from "../scanner/helius-webhook";
import { checkPumpFunGraduations, fetchBondingCurveData }                         from "../scanner/pumpfun-monitor";
import { fetchNewSolanaPairs }    from "../scanner/dexscreener";
import { runSecurityCheck }       from "../security";
import { routePair }              from "../scoring/router";
import { analyzeWithHaiku }       from "../scoring/haiku";
import { OutlierV2Result, runOutlierV2 } from "../scoring/outlier-v2";
import { sendSignalAlert }        from "./alerts";
import { openPosition, monitorPositions } from "../execution/positions";
import { supabase }               from "../../db/supabase";
import { MODE, STRATEGY, FEATURE_FLAGS, SERVER } from "../../core/config";

// ─── State ────────────────────────────────────────────────────────────────────

const scannedAddresses = new Set<string>();
let AUTO_TRADE = false;

// Daily trade counter — resets at midnight UTC
let dailyTradeCount = 0;
let lastTradeDate   = new Date().toDateString();

// Recent pairs cache — used by Outlier V2 narrative detection
const recentPairsCache: any[] = [];
const MAX_RECENT_CACHE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetDailyCounterIfNeeded(): void {
  const today = new Date().toDateString();
  if (today !== lastTradeDate) {
    dailyTradeCount = 0;
    lastTradeDate   = today;
    console.log(`🔄 Daily trade counter reset`);
  }
}

function isDailyLimitReached(): boolean {
  return dailyTradeCount >= STRATEGY.scanner.maxDailyTrades;
}

export function setAutoTrade(value: boolean): void {
  AUTO_TRADE = value;
  console.log(`⚙️  Auto-trade: ${AUTO_TRADE ? "ON" : "OFF"}`);
}

// ─── Core pipeline ────────────────────────────────────────────────────────────
// This runs for every new pair regardless of source (Helius or DexScreener).

async function processPair(pair: any, poolCreatedAt?: number, deployer?: string): Promise<void> {
  const address = pair.baseToken?.address ?? pair.tokenAddress;
  if (!address)                          return;
  if (scannedAddresses.has(address))     return;
  scannedAddresses.add(address);

  console.log(`\n🪙 ${pair.baseToken?.name ?? address} (${pair.baseToken?.symbol ?? "?"})`);

  // Security checks
  const security = await runSecurityCheck(address, "solana", poolCreatedAt, deployer);
  if (!security.passed) {
    console.log(`❌ SECURITY FAILED: ${security.reason}`);
    return;
  }

  // Standard routing
  const result = routePair(pair, security);
  console.log(`📊 Score: ${result.score.total}/100 → ${result.strategy.toUpperCase()}`);

  // Outlier V2 check if enabled
  let outlierV2Result: OutlierV2Result | null = null;
  if (FEATURE_FLAGS.useOutlierV2 && result.strategy !== "skip") {
    outlierV2Result = await runOutlierV2(pair, recentPairsCache, supabase);
    if (outlierV2Result && outlierV2Result.signal !== "NONE") {
      console.log(`💡 Outlier V2: ${outlierV2Result.signal} (confidence: ${outlierV2Result.confidence}%)`);
    }
  }

  // Cache for narrative detection
  recentPairsCache.push(pair);
  if (recentPairsCache.length > MAX_RECENT_CACHE) recentPairsCache.shift();

  if (result.strategy === "skip" && !outlierV2Result?.signal) {
    console.log(`⏭️  Skipped: ${result.reason}`);
    return;
  }

  const ai = await analyzeWithHaiku(pair, result.score, result.strategy);
  console.log(`🎯 Signal: ${ai.signal}`);

  if (ai.signal !== "BUY") return;

  // Daily cap
  if (isDailyLimitReached()) {
    console.log(`⛔ Daily limit reached (${STRATEGY.scanner.maxDailyTrades}) — skipping ${pair.baseToken?.symbol}`);
    return;
  }

  const { data: pairData } = await supabase
    .from("pairs")
    .insert({
      address,
      chain:     "solana",
      name:      pair.baseToken?.name      ?? address,
      ticker:    pair.baseToken?.symbol    ?? "?",
      strategy:  result.strategy,
      score:     result.score.total,
      narrative: ai.narrative,
    })
    .select()
    .single();

  await sendSignalAlert(pair, result.score, ai, result.strategy, outlierV2Result);

  if (AUTO_TRADE && pairData) {
    console.log(`🤖 Auto-trade ON — executing buy...`);
    await openPosition(
      pairData.id,
      address,
      "solana",
      result.strategy,
      parseFloat(pair.priceUsd),
    );
    dailyTradeCount++;
    console.log(`📈 Daily trades: ${dailyTradeCount}/${STRATEGY.scanner.maxDailyTrades}`);
  } else {
    console.log(`📨 Alert sent — manual trade mode`);
  }
}

// ─── DexScreener scan cycle (fallback / supplement) ──────────────────────────

async function dexScreenerScanCycle(): Promise<void> {
  console.log(`\n🔄 DexScreener scan: ${new Date().toLocaleTimeString()}`);
  resetDailyCounterIfNeeded();

  const pairs = await fetchNewSolanaPairs();
  console.log(`📡 Found ${pairs.length} new pairs after pre-filter`);

  for (const pair of pairs) {
    const poolCreatedAt = pair.pairCreatedAt
      ? Math.floor(pair.pairCreatedAt / 1000)
      : undefined;
    await processPair(pair, poolCreatedAt, pair.deployer);
  }

  await monitorPositions();
}

// ─── Pump.fun graduation cycle ────────────────────────────────────────────────

async function pumpFunCycle(): Promise<void> {
  try {
    const graduated = await checkPumpFunGraduations();

    for (const token of graduated) {
      if (scannedAddresses.has(token.tokenAddress)) continue;

      console.log(`\n🎓 Pump.fun graduation: ${token.tokenAddress}`);

      // Enrich with bonding curve data
      const curveData = await fetchBondingCurveData(token.tokenAddress);
      console.log(`📊 Bonding curve: ${curveData.holderCount} holders, $${curveData.volumeOnCurve.toFixed(0)} vol, ${curveData.ageMinutes.toFixed(0)}m old`);

      // Wait for DexScreener to index then get market data
      const pair = await enrichPairFromDexScreener(token.tokenAddress);
      if (!pair) {
        console.log(`⚠️  Could not enrich ${token.tokenAddress} from DexScreener yet`);
        continue;
      }

      await processPair(pair, token.graduatedAt, token.deployer);
    }
  } catch (err: any) {
    console.error("❌ Pump.fun cycle error:", err.message);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  console.log(`🤖 CATALYST APEX TRADER started`);
  console.log(`⚙️  Mode: ${MODE.toUpperCase()} | Auto-trade: ${AUTO_TRADE ? "ON" : "OFF"}`);
  console.log(`⚙️  Helius webhooks: ${FEATURE_FLAGS.useHeliusWebhooks ? "ON" : "OFF"}`);
  console.log(`⚙️  Pump.fun monitor: ${FEATURE_FLAGS.usePumpFunMonitor ? "ON" : "OFF"}`);
  console.log(`⚙️  Outlier V2: ${FEATURE_FLAGS.useOutlierV2 ? "ON" : "OFF"}`);

  // ── Mode 1: Helius webhook server ─────────────────────────────────────────
  if (FEATURE_FLAGS.useHeliusWebhooks) {
    const app = createWebhookServer(async (webhookPair) => {
      // Enrich with market data from DexScreener
      const pair = await enrichPairFromDexScreener(webhookPair.tokenAddress);
      if (!pair) return;

      // Merge deployer from Helius into pair object
      pair.deployer      = webhookPair.deployer;
      pair.pairCreatedAt = webhookPair.poolCreatedAt * 1000;

      await processPair(pair, webhookPair.poolCreatedAt, webhookPair.deployer);
    });

    app.listen(SERVER.webhookPort, () => {
      console.log(`🌐 Webhook server listening on port ${SERVER.webhookPort}`);
    });

    // Register webhook with Helius
    await registerHeliusWebhook();

    // Still run DexScreener every 60s as supplement — catches anything Helius misses
    console.log(`🔄 DexScreener supplement: every 60s`);
    setInterval(dexScreenerScanCycle, 60_000);

  } else {
    // ── Mode 2: DexScreener polling (default) ───────────────────────────────
    console.log(`🔄 DexScreener polling: every 30s`);
    await dexScreenerScanCycle();
    setInterval(dexScreenerScanCycle, 30_000);
  }

  // ── Pump.fun monitor ──────────────────────────────────────────────────────
  if (FEATURE_FLAGS.usePumpFunMonitor) {
    console.log(`🎓 Pump.fun monitor: every 60s`);
    await pumpFunCycle();
    setInterval(pumpFunCycle, 60_000);
  }

  // ── Position monitor always runs ──────────────────────────────────────────
  setInterval(async () => {
    try { await monitorPositions(); }
    catch (err: any) { console.error("❌ Position monitor error:", err.message); }
  }, 30_000);
}