import { fetchNewSolanaPairs } from "../scanner/dexscreener";
import { runSecurityCheck } from "../security";
import { routePair } from "../scoring/router";
import { analyzeWithHaiku } from "../scoring/haiku";
import { sendSignalAlert } from "./alerts";
import { openPosition, monitorPositions } from "../execution/positions";
import { supabase } from "../../db/supabase";
import { MODE } from "../../core/config";

const scannedAddresses = new Set<string>();

// Toggle — set to true for auto-trade, false for alert only
let AUTO_TRADE = false;

export function setAutoTrade(value: boolean): void {
  AUTO_TRADE = value;
  console.log(`⚙️ Auto-trade: ${AUTO_TRADE ? "ON" : "OFF"}`);
}

async function scanCycle(): Promise<void> {
  console.log(`\n🔄 Scan cycle: ${new Date().toLocaleTimeString()}`);

  const pairs = await fetchNewSolanaPairs();
  console.log(`📡 Found ${pairs.length} new pairs`);

  for (const pair of pairs) {
    const address = pair.baseToken.address;
    if (scannedAddresses.has(address)) continue;
    scannedAddresses.add(address);

    console.log(`\n🪙 ${pair.baseToken.name} (${pair.baseToken.symbol})`);

    // Security check
    const security = await runSecurityCheck(address, "solana");
    if (!security.passed) {
      console.log(`❌ SECURITY FAILED: ${security.reason}`);
      continue;
    }

    // Score and route
    const result = routePair(pair, security);
    console.log(`📊 Score: ${result.score.total}/100 → ${result.strategy.toUpperCase()}`);
    if (result.strategy === "skip") continue;

    // AI analysis
    const ai = await analyzeWithHaiku(pair, result.score, result.strategy);
    console.log(`🎯 Signal: ${ai.signal}`);
    if (ai.signal !== "BUY") continue;

    // Save pair to DB
    const { data: pairData } = await supabase
      .from("pairs")
      .insert({
        address,
        chain: "solana",
        name: pair.baseToken.name,
        ticker: pair.baseToken.symbol,
        strategy: result.strategy,
        score: result.score.total,
        narrative: ai.narrative,
      })
      .select()
      .single();

    // Send Telegram alert
    await sendSignalAlert(pair, result.score, ai, result.strategy);

    // Auto-trade or alert only
    if (AUTO_TRADE && pairData) {
      console.log(`🤖 Auto-trade ON — executing buy...`);
      await openPosition(
        pairData.id,
        address,
        "solana",
        result.strategy,
        parseFloat(pair.priceUsd)
      );
    } else {
      console.log(`📨 Alert sent — manual trade mode`);
    }
  }

  // Monitor open positions
  await monitorPositions();
}

export async function startBot(): Promise<void> {
  console.log(`🤖 APEX bot started — scanning every 30s`);
  console.log(`⚙️ Mode: ${MODE.toUpperCase()} | Auto-trade: ${AUTO_TRADE ? "ON" : "OFF"}`);

  await scanCycle();

  setInterval(async () => {
    try {
      await scanCycle();
    } catch (err: any) {
      console.error("❌ Scan cycle error:", err.message);
    }
  }, 30_000);
}