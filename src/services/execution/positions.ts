// src/services/execution/positions.ts
// Catalyst Apex Trader v2.1 — Position Manager
//
// Exit logic uses chart shape reading on every monitoring cycle:
// - ACCUMULATION / BREAKOUT / STAIRCASE → hold
// - DISTRIBUTION → reduce position (smart money leaving)
// - FOMO → hold but tighten trailing stop
// - DUMP → emergency exit immediately
//
// This replaces fixed time-based exits with dynamic chart-driven exits.

import { supabase }        from "../../db/supabase";
import { buyToken, sellToken } from "./jupiter";
import { STRATEGY, TRADE_AMOUNT_USD } from "../../core/config";
import { usdToSol }        from "./parity";
import { analyzeChartShape } from "../scoring/chart-reader";

export interface Position {
  id:             string;
  pair_id:        string;
  chain:          string;
  strategy:       string;
  entry_price:    number;
  amount_usd:     number;
  amount_native:  string;
  status:         string;
  moonbag_active: boolean;
  peak_price:     number;
}

// ─── Open position ────────────────────────────────────────────────────────────

export async function openPosition(
  pairId:     string,
  tokenMint:  string,
  chain:      string,
  strategy:   string,
  entryPrice: number,
): Promise<void> {
  try {
    const trade = await buyToken(tokenMint);
    if (!trade.success) {
      console.error("❌ Buy failed:", trade.error);
      return;
    }

    const solAmount = await usdToSol(TRADE_AMOUNT_USD);

    const { error } = await supabase.from("trades").insert({
      pair_id:       pairId,
      chain,
      strategy,
      entry_price:   entryPrice,
      amount_usd:    TRADE_AMOUNT_USD,
      amount_native: solAmount.toFixed(9),
      status:        "open",
      moonbag_active: false,
      peak_price:    entryPrice,
    });

    if (error) console.error("❌ DB insert error:", error.message);
    else console.log(`✅ Position opened — $${TRADE_AMOUNT_USD} at $${entryPrice}`);

  } catch (err: any) {
    console.error("❌ openPosition error:", err.message);
  }
}

// ─── Monitor positions ────────────────────────────────────────────────────────

export async function monitorPositions(): Promise<void> {
  try {
    const { data: positions, error } = await supabase
      .from("trades")
      .select("*, pairs(address, chain)")
      .eq("status", "open");

    if (error || !positions) return;
    if (positions.length === 0) return;

    console.log(`\n👁️  Monitoring ${positions.length} open position(s)...`);

    for (const pos of positions) {
      const tokenAddress = pos.pairs?.address;
      if (!tokenAddress) continue;

      // Get current price + full pair data for chart reading
      const pairData = await getCurrentPairData(tokenAddress);
      if (!pairData) continue;

      const currentPrice = parseFloat(pairData.priceUsd ?? "0");
      if (!currentPrice) continue;

      const entryPrice  = pos.entry_price;
      const peakPrice   = Math.max(pos.peak_price, currentPrice);
      const pnlPercent  = ((currentPrice - entryPrice) / entryPrice) * 100;
      const pnlUsd      = (currentPrice - entryPrice) / entryPrice * pos.amount_usd;

      console.log(`📊 ${tokenAddress.slice(0, 8)}... | Entry: $${entryPrice.toFixed(8)} | Now: $${currentPrice.toFixed(8)} | PnL: ${pnlPercent.toFixed(1)}% ($${pnlUsd.toFixed(2)})`);

      // Update peak price
      if (currentPrice > pos.peak_price) {
        await supabase.from("trades").update({ peak_price: currentPrice }).eq("id", pos.id);
      }

      // ── Chart shape analysis for exit decision ─────────────────────────────
      const chart = analyzeChartShape(pairData);
      console.log(`   📊 Exit chart: ${chart.shape} | Exit signal: ${chart.exitSignal}`);

      // EMERGENCY EXIT — chart says dump, get out regardless of strategy
      if (chart.shape === "DUMP") {
        console.log(`💀 DUMP detected — emergency exit`);
        await closePosition(pos, tokenAddress, currentPrice, "chart_dump");
        await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd, "🚨 Emergency exit — DUMP pattern detected");
        continue;
      }

      // DISTRIBUTION EXIT — smart money leaving, exit before crowd does
      if (chart.shape === "DISTRIBUTION" && pnlPercent > 0) {
        console.log(`🔴 DISTRIBUTION detected — exiting in profit`);
        await closePosition(pos, tokenAddress, currentPrice, "chart_distribution");
        await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd, "🔴 Exit — DISTRIBUTION pattern (smart money leaving)");
        continue;
      }

      // ── Standard Strategy ──────────────────────────────────────────────────
      if (pos.strategy === "standard") {
        // Take profit at 2x
        if (pnlPercent >= (STRATEGY.standard.takeProfitMultiplier - 1) * 100) {
          console.log(`🎯 TP hit — selling full position`);
          await closePosition(pos, tokenAddress, currentPrice, "tp");
          await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd, "🎯 Take profit hit — 2x achieved");
          continue;
        }

        // Tighten stop loss if FOMO detected (price ran too hard, likely to reverse)
        const stopLoss = chart.shape === "FOMO"
          ? STRATEGY.standard.stopLossPercent * 0.5  // tighten to 15% in FOMO
          : STRATEGY.standard.stopLossPercent;        // normal 30%

        if (pnlPercent <= -stopLoss) {
          console.log(`🛑 SL hit — selling full position (stop: ${stopLoss}%)`);
          await closePosition(pos, tokenAddress, currentPrice, "sl");
          await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd, `🛑 Stop loss hit (${stopLoss.toFixed(0)}%)`);
          continue;
        }
      }

      // ── Outlier / Moonbag Strategy ─────────────────────────────────────────
      if (pos.strategy === "outlier") {
        // First trigger — sell 50% at 2x
        if (!pos.moonbag_active && pnlPercent >= 100) {
          console.log(`🌙 Moonbag triggered — selling 50%`);
          await triggerMoonbag(pos, tokenAddress, currentPrice);
          await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd / 2, "🌙 Moonbag activated — 50% sold at 2x, running remainder free");
          continue;
        }

        // Trailing stop on moonbag
        if (pos.moonbag_active) {
          const dropFromPeak = ((peakPrice - currentPrice) / peakPrice) * 100;

          // Tighten trailing stop in FOMO or DISTRIBUTION
          const trailingStop = (chart.shape === "FOMO" || chart.shape === "DISTRIBUTION")
            ? STRATEGY.moonbag.trailingStopPercent * 0.6  // tighten to 15%
            : STRATEGY.moonbag.trailingStopPercent;        // normal 25%

          if (dropFromPeak >= trailingStop) {
            console.log(`🛑 Trailing stop hit — selling moonbag (drop: ${dropFromPeak.toFixed(1)}%)`);
            await closePosition(pos, tokenAddress, currentPrice, "tsl");
            await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd, `🛑 Trailing stop hit (${dropFromPeak.toFixed(1)}% from peak)`);
            continue;
          }
        }

        // Hard stop before moonbag activates
        if (!pos.moonbag_active && pnlPercent <= -STRATEGY.standard.stopLossPercent) {
          console.log(`🛑 SL hit on outlier — selling full`);
          await closePosition(pos, tokenAddress, currentPrice, "sl");
          await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd, "🛑 Stop loss hit on outlier position");
        }
      }
    }
  } catch (err: any) {
    console.error("❌ monitorPositions error:", err.message);
  }
}

// ─── Moonbag trigger ──────────────────────────────────────────────────────────

async function triggerMoonbag(
  pos:          Position,
  tokenAddress: string,
  currentPrice: number,
): Promise<void> {
  const totalNative = BigInt(Math.floor(parseFloat(pos.amount_native) * 1e9));
  const halfNative  = totalNative / BigInt(2);

  if (halfNative < BigInt(STRATEGY.moonbag.minSolLamports)) {
    console.log("⚠️ Amount too small for moonbag — selling full");
    await closePosition(pos, tokenAddress, currentPrice, "tp");
    return;
  }

  await sellToken(tokenAddress, halfNative.toString());

  await supabase.from("trades").update({
    moonbag_active: true,
    amount_native:  halfNative.toString(),
    peak_price:     currentPrice,
  }).eq("id", pos.id);

  console.log(`✅ Moonbag active — holding ${halfNative} lamports`);
}

// ─── Close position ───────────────────────────────────────────────────────────

async function closePosition(
  pos:          Position,
  tokenAddress: string,
  currentPrice: number,
  reason:       string,
): Promise<void> {
  const pnlUsd = (currentPrice - pos.entry_price) / pos.entry_price * pos.amount_usd;

  await sellToken(tokenAddress, pos.amount_native);

  await supabase.from("trades").update({
    status:     "closed",
    exit_price: currentPrice,
    pnl_usd:    pnlUsd,
    closed_at:  new Date().toISOString(),
  }).eq("id", pos.id);

  console.log(`✅ Position closed — reason: ${reason} | PnL: $${pnlUsd.toFixed(2)}`);
}

// ─── Exit alert ───────────────────────────────────────────────────────────────

async function sendExitAlert(
  tokenAddress: string,
  pos:          Position,
  currentPrice: number,
  pnlUsd:       number,
  reason:       string,
): Promise<void> {
  try {
    const axios    = (await import("axios")).default;
    const { TELEGRAM } = await import("../../core/config");

    const pnlEmoji = pnlUsd >= 0 ? "✅" : "🔴";
    const message  = `
${pnlEmoji} *POSITION CLOSED*

📍 \`${tokenAddress}\`
💰 PnL: ${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)}
📊 Entry: $${pos.entry_price.toFixed(8)}
📊 Exit:  $${currentPrice.toFixed(8)}
📝 ${reason}
    `.trim();

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,
      { chat_id: TELEGRAM.chatId, text: message, parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("❌ Exit alert error:", err.message);
  }
}

// ─── Get current pair data ────────────────────────────────────────────────────

async function getCurrentPairData(tokenAddress: string): Promise<any | null> {
  try {
    const axios = (await import("axios")).default;
    const res = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`,
      { timeout: 8000 }
    );
    const pairs = res.data ?? [];
    return pairs[0] ?? null;
  } catch {
    return null;
  }
}

// Keep backward compatibility
async function getCurrentPrice(tokenAddress: string): Promise<number | null> {
  const pair = await getCurrentPairData(tokenAddress);
  return pair ? parseFloat(pair.priceUsd ?? "0") : null;
}