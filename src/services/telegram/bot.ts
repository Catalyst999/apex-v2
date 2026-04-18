// src/services/telegram/bot.ts

import { createWebhookServer, registerHeliusWebhook, enrichPairFromDexScreener } from "../scanner/helius-webhook";
import { fetchNewSolanaPairs }    from "../scanner/dexscreener";
import { runSecurityCheck }       from "../security";
import { routePair }              from "../scoring/router";
import { analyzeWithHaiku }       from "../scoring/haiku";
import { runOutlierV2, OutlierV2Result }           from "../scoring/outlier-v2";
import { sendSignalAlert }        from "./alerts";
import { openPosition, monitorPositions } from "../execution/positions";
import { supabase }               from "../../db/supabase";
import { MODE, STRATEGY, FEATURE_FLAGS, SERVER } from "../../core/config";

// ─── State ────────────────────────────────────────────────────────────────────

const scannedAddresses = new Set<string>();
let AUTO_TRADE = false;

let dailyTradeCount = 0;
let lastTradeDate   = new Date().toDateString();

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
// Runs for every new pair regardless of source (Helius or DexScreener)

async function processPair(pair: any, poolCreatedAt?: number, deployer?: string): Promise<void> {
  const address = pair.baseToken?.address ?? pair.tokenAddress;
  if (!address)                       return;
  if (scannedAddresses.has(address))  return;
  scannedAddresses.add(address);

  console.log(`\n🪙 ${pair.baseToken?.name ?? address} (${pair.baseToken?.symbol ?? "?"})`);

  const security = await runSecurityCheck(address, "solana", poolCreatedAt, deployer);
  if (!security.passed) {
    console.log(`❌ SECURITY FAILED: ${security.reason}`);
    return;
  }

  const result = routePair(pair, security);
  console.log(`📊 Score: ${result.score.total}/100 → ${result.strategy.toUpperCase()}`);

  // Outlier V2
  let outlierV2Result: OutlierV2Result | null = null;
  if (FEATURE_FLAGS.useOutlierV2 && result.strategy !== "skip") {
    outlierV2Result = await runOutlierV2(pair, recentPairsCache, supabase);
    if (outlierV2Result.signal !== "NONE") {
      console.log(`💡 Outlier V2: ${outlierV2Result.signal} (confidence: ${outlierV2Result.confidence}%)`);
    }
  }

  // Cache for narrative detection
  recentPairsCache.push(pair);
  if (recentPairsCache.length > MAX_RECENT_CACHE) recentPairsCache.shift();

  if (result.strategy === "skip") {
    console.log(`⏭️  Skipped: ${result.reason}`);
    return;
  }

  const ai = await analyzeWithHaiku(pair, result.score, result.strategy);
  console.log(`🎯 Signal: ${ai.signal}`);

  if (ai.signal !== "BUY") return;

  if (isDailyLimitReached()) {
    console.log(`⛔ Daily limit reached (${STRATEGY.scanner.maxDailyTrades}) — skipping ${pair.baseToken?.symbol}`);
    return;
  }

  const { data: pairData } = await supabase
    .from("pairs")
    .insert({
      address,
      chain:     "solana",
      name:      pair.baseToken?.name   ?? address,
      ticker:    pair.baseToken?.symbol ?? "?",
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

// ─── DexScreener scan cycle ───────────────────────────────────────────────────

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

// ─── Start ────────────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  console.log(`🤖 CATALYST APEX TRADER started`);
  console.log(`⚙️  Mode: ${MODE.toUpperCase()} | Auto-trade: ${AUTO_TRADE ? "ON" : "OFF"}`);
  console.log(`⚙️  Helius webhooks: ${FEATURE_FLAGS.useHeliusWebhooks ? "ON" : "OFF"}`);
  console.log(`⚙️  Outlier V2: ${FEATURE_FLAGS.useOutlierV2 ? "ON" : "OFF"}`);

  if (FEATURE_FLAGS.useHeliusWebhooks) {
    // ── HELIUS MODE ───────────────────────────────────────────────────────────
    // Webhook server receives real-time pair events from Helius
    // DexScreener runs every 60s as supplement to fill any gaps

    const app = createWebhookServer(async (webhookPair) => {
      console.log(`\n⚡ Helius webhook fired: ${webhookPair.tokenAddress}`);
      console.log(`   Deployer: ${webhookPair.deployer}`);
      console.log(`   Initial SOL: ${webhookPair.initialSol.toFixed(2)}`);

      // Wait 3s then enrich with DexScreener market data
      const pair = await enrichPairFromDexScreener(webhookPair.tokenAddress);
      if (!pair) {
        console.log(`⚠️  Could not enrich ${webhookPair.tokenAddress} — token not indexed yet`);
        return;
      }

      // Inject Helius data into pair object
      pair.deployer      = webhookPair.deployer;
      pair.pairCreatedAt = webhookPair.poolCreatedAt * 1000;

      await processPair(pair, webhookPair.poolCreatedAt, webhookPair.deployer);
    });

    // Start webhook server with error handling
    const server = app.listen(SERVER.webhookPort, () => {
      console.log(`🌐 Webhook server listening on port ${SERVER.webhookPort}`);
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${SERVER.webhookPort} already in use. Retrying in 5 seconds...`);
        setTimeout(() => {
          server.listen(SERVER.webhookPort, () => {
            console.log(`🌐 Webhook server listening on port ${SERVER.webhookPort} (retry)`);
          });
        }, 5000);
      } else {
        throw err;
      }
    });

    // Register with Helius API — tells Helius where to send events
    await registerHeliusWebhook();

    // DexScreener as supplement — catches anything Helius misses
    console.log(`🔄 DexScreener supplement: every 60s`);
    await dexScreenerScanCycle();
    setInterval(dexScreenerScanCycle, 60_000);

  } else {
    // ── DEXSCREENER MODE (default) ────────────────────────────────────────────
    // Polls every 60s — no webhook server started
    console.log(`🔄 DexScreener polling: every 60s`);
    await dexScreenerScanCycle();
    setInterval(dexScreenerScanCycle, 60_000);
  }

  // Position monitor always runs every 30s
  setInterval(async () => {
    try { await monitorPositions(); }
    catch (err: any) { console.error("❌ Position monitor error:", err.message); }
  }, 30_000);
}