// src/services/telegram/bot.ts

import { fetchNewSolanaPairs }  from "../scanner/dexscreener";
import { runSecurityCheck }     from "../security";
import { routePair }            from "../scoring/router";
import { analyzeWithHaiku }     from "../scoring/haiku";
import { sendSignalAlert }      from "./alerts";
import { openPosition, monitorPositions } from "../execution/positions";
import { supabase }             from "../../db/supabase";
import { MODE, STRATEGY }       from "../../core/config";

const scannedAddresses = new Set<string>();
let AUTO_TRADE = false;

// Daily trade counter — resets at midnight UTC
// Expert guide: concentrated conviction wins, spreading thin kills returns
let dailyTradeCount = 0;
let lastTradeDate   = new Date().toDateString();

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

// ─── Scan cycle ───────────────────────────────────────────────────────────────
async function scanCycle(): Promise<void> {
  console.log(`\n🔄 Scan cycle: ${new Date().toLocaleTimeString()}`);
  resetDailyCounterIfNeeded();

  const pairs = await fetchNewSolanaPairs();
  console.log(`📡 Found ${pairs.length} new pairs after pre-filter`);

  for (const pair of pairs) {
    const address = pair.baseToken.address;
    if (scannedAddresses.has(address)) continue;
    scannedAddresses.add(address);

    console.log(`\n🪙 ${pair.baseToken.name} (${pair.baseToken.symbol})`);

    // Pass pairCreatedAt (convert ms → seconds) and deployer into security check
    // so bundle detector and deployer checker have the data they need
    const poolCreatedAt = pair.pairCreatedAt
      ? Math.floor(pair.pairCreatedAt / 1000)
      : undefined;

    const security = await runSecurityCheck(
      address,
      "solana",
      poolCreatedAt,
      pair.deployer,
    );

    if (!security.passed) {
      console.log(`❌ SECURITY FAILED: ${security.reason}`);
      continue;
    }

    const result = routePair(pair, security);
    console.log(`📊 Score: ${result.score.total}/100 → ${result.strategy.toUpperCase()}`);

    if (result.strategy === "skip") {
      console.log(`⏭️  Skipped: ${result.reason}`);
      continue;
    }

    const ai = await analyzeWithHaiku(pair, result.score, result.strategy);
    console.log(`🎯 Signal: ${ai.signal}`);

    if (ai.signal !== "BUY") continue;

    // Daily trade cap check — don't spread thin across too many coins
    if (isDailyLimitReached()) {
      console.log(`⛔ Daily trade limit reached (${STRATEGY.scanner.maxDailyTrades}) — skipping signal for ${pair.baseToken.symbol}`);
      continue;
    }

    const { data: pairData } = await supabase
      .from("pairs")
      .insert({
        address,
        chain:     "solana",
        name:      pair.baseToken.name,
        ticker:    pair.baseToken.symbol,
        strategy:  result.strategy,
        score:     result.score.total,
        narrative: ai.narrative,
      })
      .select()
      .single();

    await sendSignalAlert(pair, result.score, ai, result.strategy);

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
      console.log(`📈 Daily trades today: ${dailyTradeCount}/${STRATEGY.scanner.maxDailyTrades}`);
    } else {
      console.log(`📨 Alert sent — manual trade mode`);
    }
  }

  await monitorPositions();
}

// ─── Start ────────────────────────────────────────────────────────────────────
export async function startBot(): Promise<void> {
  console.log(`🤖 CATALYST APEX TRADER started — scanning every 30s`);
  console.log(`⚙️  Mode: ${MODE.toUpperCase()} | Auto-trade: ${AUTO_TRADE ? "ON" : "OFF"}`);

  await scanCycle();

  setInterval(async () => {
    try {
      await scanCycle();
    } catch (err: any) {
      console.error("❌ Scan cycle error:", err.message);
    }
  }, 30_000);
}