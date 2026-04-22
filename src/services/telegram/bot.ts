// src/services/telegram/bot.ts
// v2.1 — Full AI pipeline: On-chain + DexScreener + X social + Claude AI brain

import { fetchNewSolanaPairs }              from "../scanner/dexscreener";
import { scanOnChain, cleanProcessedPools } from "../scanner/onchain-scanner";
import { enrichPairFromDexScreener }        from "../scanner/helius-webhook";
import { runSecurityCheck }                 from "../security";
import { routePair }                        from "../scoring/router";
import { analyzeWithHaiku }                 from "../scoring/haiku";
import { runOutlierV2, OutlierV2Result }    from "../scoring/outlier-v2";
import { detectCrimePump, CrimePumpResult } from "../scoring/crime-pump";
import { scanXForToken }                    from "../social/x-scanner";
import { sendSignalAlert }                  from "./alerts";
import { openPosition, monitorPositions }   from "../execution/positions";
import { supabase }                         from "../../db/supabase";
import { MODE, STRATEGY, FEATURE_FLAGS, TELEGRAM } from "../../core/config";
import axios from "axios";

// ─── State ────────────────────────────────────────────────────────────────────

const scannedAddresses = new Set<string>();
let AUTO_TRADE = false;

let dailyTradeCount = 0;
let lastTradeDate   = new Date().toDateString();

const recentPairsCache: any[] = [];
const MAX_RECENT_CACHE = 100;

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

async function processPair(
  pair:           any,
  poolCreatedAt?: number,
  deployer?:      string,
  onChainSignal?: string,
): Promise<void> {
  const address = pair.baseToken?.address ?? pair.tokenAddress;
  if (!address)                       return;
  if (scannedAddresses.has(address))  return;
  scannedAddresses.add(address);

  const source = onChainSignal ? `⛓️  [${onChainSignal}]` : `📡`;
  console.log(`\n${source} 🪙 ${pair.baseToken?.name ?? address} (${pair.baseToken?.symbol ?? "?"})`);

  // Security checks
  const security = await runSecurityCheck(address, "solana", poolCreatedAt, deployer);
  if (!security.passed) {
    console.log(`❌ SECURITY FAILED: ${security.reason}`);
    return;
  }

  // Route and score
  const result = routePair(pair, security);
  console.log(`📊 Score: ${result.score.total}/100 → ${result.strategy.toUpperCase()}`);

  // Crime pump detection
  const crimePump = detectCrimePump(pair, recentPairsCache);
  if (crimePump.detected) {
    console.log(`🚨 CRIME PUMP: ${crimePump.type} (${crimePump.confidence}%)`);
    await sendCrimePumpAlert(pair, crimePump);
  }

  // Outlier V2
  let outlierV2Result: OutlierV2Result | null = null;
  if (FEATURE_FLAGS.useOutlierV2 && result.strategy !== "skip") {
    outlierV2Result = await runOutlierV2(pair, recentPairsCache, supabase);
    if (outlierV2Result.signal !== "NONE") {
      console.log(`💡 Outlier V2: ${outlierV2Result.signal} (${outlierV2Result.confidence}%)`);
    }
  }

  recentPairsCache.push(pair);
  if (recentPairsCache.length > MAX_RECENT_CACHE) recentPairsCache.shift();

  if (result.strategy === "skip") {
    console.log(`⏭️  Skipped: ${result.reason}`);
    return;
  }

  // X social scan — runs in parallel with AI analysis
  const xSignal = await scanXForToken(
    address,
    pair.baseToken?.name   ?? "",
    pair.baseToken?.symbol ?? "",
  );

  // Claude AI analysis — passes everything including social context
  const ai = await analyzeWithHaiku(pair, result.score, result.strategy, xSignal);
  console.log(`🎯 Signal: ${ai.signal} | Rug risk: ${ai.rugRisk}%`);

  if (ai.signal !== "BUY") return;

  if (isDailyLimitReached()) {
    console.log(`⛔ Daily limit reached — skipping ${pair.baseToken?.symbol}`);
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

// ─── DexScreener scan ─────────────────────────────────────────────────────────

async function dexScreenerScanCycle(): Promise<void> {
  console.log(`\n🔄 DexScreener scan: ${new Date().toLocaleTimeString()}`);
  resetDailyCounterIfNeeded();

  const pairs = await fetchNewSolanaPairs();
  console.log(`📡 Found ${pairs.length} pairs after filter`);

  for (const pair of pairs) {
    const poolCreatedAt = pair.pairCreatedAt
      ? Math.floor(pair.pairCreatedAt / 1000)
      : undefined;
    await processPair(pair, poolCreatedAt, pair.deployer);
  }

  await monitorPositions();
}

// ─── On-chain scan ────────────────────────────────────────────────────────────

async function onChainScanCycle(): Promise<void> {
  console.log(`\n⛓️  On-chain scan: ${new Date().toLocaleTimeString()}`);

  const signals = await scanOnChain();

  for (const signal of signals) {
    const pair = await enrichPairFromDexScreener(signal.tokenAddress);

    if (!pair) {
      // Token not on DexScreener yet — build minimal pair from on-chain data
      const rawPair = {
        baseToken:    { address: signal.tokenAddress, name: signal.tokenAddress.slice(0, 8), symbol: "NEW" },
        quoteToken:   { symbol: "SOL" },
        priceUsd:     "0",
        marketCap:    0,
        fdv:          0,
        priceChange:  { m5: 0, h1: 0, h6: 0, h24: 0 },
        txns:         { m5: { buys: signal.uniqueBuyers, sells: 0 }, h1: { buys: signal.uniqueBuyers, sells: 0 }, h6: { buys: 0, sells: 0 }, h24: { buys: 0, sells: 0 } },
        volume:       { m5: signal.avgBuySize * signal.uniqueBuyers, h1: 0, h6: 0, h24: 0 },
        liquidity:    { usd: signal.initialSolLiq * 150 },
        pairCreatedAt: signal.poolCreatedAt * 1000,
        chainId:      "solana",
        pairAddress:  signal.tokenAddress,
        deployer:     signal.deployer,
      };
      await processPair(rawPair, signal.poolCreatedAt, signal.deployer, signal.signalType);
      continue;
    }

    pair.deployer      = signal.deployer;
    pair.pairCreatedAt = signal.poolCreatedAt * 1000;
    await processPair(pair, signal.poolCreatedAt, signal.deployer, signal.signalType);
  }

  cleanProcessedPools();
}

// ─── Crime pump alert ─────────────────────────────────────────────────────────

async function sendCrimePumpAlert(pair: any, crime: CrimePumpResult): Promise<void> {
  try {
    const mcap    = pair.marketCap ?? pair.fdv ?? 0;
    const mcapStr = mcap >= 1_000_000
      ? `$${(mcap / 1_000_000).toFixed(2)}M`
      : `$${(mcap / 1_000).toFixed(1)}K`;

    const message = `
🚨 *POTENTIAL CRIME PUMP DETECTED*

🪙 *${pair.baseToken?.name}* (${pair.baseToken?.symbol})
📊 Type: ${crime.type}
🎯 Confidence: ${crime.confidence}%
💎 MCap: ${mcapStr}
📍 Position: ${crime.positioning}
${crime.canonical ? "✅ Canonical coin for this narrative" : "⚠️ Not the volume leader"}

📝 ${crime.reason}

📍 \`${pair.baseToken?.address}\`
🔗 [DexScreener](https://dexscreener.com/solana/${pair.baseToken?.address})
    `.trim();

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,
      { chat_id: TELEGRAM.chatId, text: message, parse_mode: "Markdown", disable_web_page_preview: true }
    );
  } catch (err: any) {
    console.error("❌ Crime pump alert error:", err.message);
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  console.log(`🤖 CATALYST APEX TRADER started`);
  console.log(`⚙️  Mode: ${MODE.toUpperCase()} | Auto-trade: ${AUTO_TRADE ? "ON" : "OFF"}`);
  console.log(`⚙️  Outlier V2: ${FEATURE_FLAGS.useOutlierV2 ? "ON" : "OFF"}`);
  console.log(`⚙️  DexScreener: every 60s`);
  console.log(`⚙️  On-chain (Helius): every 2 min`);
  console.log(`⚙️  X social: per token scan`);
  console.log(`⚙️  AI brain: Claude Haiku + extended thinking`);

  // DexScreener scan every 60s
  await dexScreenerScanCycle();
  setInterval(dexScreenerScanCycle, 60_000);

  // On-chain scan every 2 min (offset 30s)
  setTimeout(async () => {
    await onChainScanCycle();
    setInterval(onChainScanCycle, 120_000);
  }, 30_000);

  // Position monitor every 30s
  setInterval(async () => {
    try { await monitorPositions(); }
    catch (err: any) { console.error("❌ Position monitor error:", err.message); }
  }, 30_000);
}