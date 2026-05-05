// src/services/execution/positions.ts
// v2.1 — Position Manager with Risk Engine integration
//
// Exit logic:
// 1. Chart shape → DUMP/DISTRIBUTION = emergency exit
// 2. Ladder targets → sell in stages, not all at once
// 3. Dead position → exit if no movement after 30 min
// 4. Trailing stop → tightens in FOMO/DISTRIBUTION
// 5. Record outcome → feeds risk engine consecutive loss tracker

import { supabase }           from "../../db/supabase";
import { buyToken, sellToken } from "./jupiter";
import { STRATEGY, TRADE_AMOUNT_USD } from "../../core/config";
import { usdToSol }           from "./parity";
import { analyzeChartShape }  from "../scoring/chart-reader";
import { recordTradeOutcome, getLadderTargets, isDeadPosition } from "./risk-engine";
import { emit } from "../events/event-bus";
import { outcomeLogger } from "../learning/outcome-logger";
import { v4 as uuidv4 } from "uuid";

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
  opened_at:      string;
  ladder_stage:   number;   // 0 = none, 1 = first target hit, 2 = second hit
}

// ─── Open position ────────────────────────────────────────────────────────────

export async function openPosition(
  pairId:       string,
  tokenMint:    string,
  chain:        string,
  strategy:     string,
  entryPrice:   number,
  positionSize?: number,  // override from risk engine
): Promise<void> {
  try {
    const tradeAmount = positionSize ?? TRADE_AMOUNT_USD;

    const trade = await buyToken(tokenMint);
    if (!trade.success) {
      console.error("❌ Buy failed:", trade.error);
      return;
    }

    const solAmount = await usdToSol(tradeAmount);

    const { error } = await supabase.from("trades").insert({
      pair_id:        pairId,
      chain,
      strategy,
      entry_price:    entryPrice,
      amount_usd:     tradeAmount,
      amount_native:  solAmount.toFixed(9),
      status:         "open",
      moonbag_active: false,
      peak_price:     entryPrice,
      ladder_stage:   0,
    });

    if (error) console.error("❌ DB insert error:", error.message);
    else {
      console.log(`✅ Position opened — $${tradeAmount} at $${entryPrice}`);

      // Emit TRADE_EXECUTED event
      await emit({
        type: 'TRADE_EXECUTED',
        token: tokenMint,
        walletId: '', // TODO: Get from context
        entryPrice,
        positionSize: tradeAmount,
        leverage: 1.0,
        timestamp: Date.now(),
      });
    }

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

    if (error || !positions || positions.length === 0) return;

    console.log(`\n👁️  Monitoring ${positions.length} open position(s)...`);

    for (const pos of positions) {
      const tokenAddress = pos.pairs?.address;
      if (!tokenAddress) continue;

      const pairData = await getCurrentPairData(tokenAddress);
      if (!pairData) continue;

      const currentPrice = parseFloat(pairData.priceUsd ?? "0");
      if (!currentPrice) continue;

      const entryPrice  = pos.entry_price;
      const peakPrice   = Math.max(pos.peak_price ?? entryPrice, currentPrice);
      const pnlPct      = ((currentPrice - entryPrice) / entryPrice) * 100;
      const pnlUsd      = (currentPrice - entryPrice) / entryPrice * (pos.amount_usd ?? 0);

      console.log(`📊 ${tokenAddress.slice(0, 8)}... | PnL: ${pnlPct.toFixed(1)}% ($${pnlUsd.toFixed(2)}) | Peak: $${peakPrice.toFixed(8)}`);

      // Update peak
      if (currentPrice > (pos.peak_price ?? 0)) {
        await supabase.from("trades").update({ peak_price: currentPrice }).eq("id", pos.id);
      }

      // ── Chart shape exit signals ───────────────────────────────────────────
      const chart = analyzeChartShape(pairData);
      console.log(`   📊 Exit chart: ${chart.shape} | Exit signal: ${chart.exitSignal}`);

      // Emergency exit on DUMP
      if (chart.shape === "DUMP") {
        console.log(`💀 DUMP — emergency exit`);
        await closePosition(pos, tokenAddress, currentPrice, pnlUsd, "chart_dump");
        continue;
      }

      // Exit on DISTRIBUTION if in profit
      if (chart.shape === "DISTRIBUTION" && pnlPct > 0) {
        console.log(`🔴 DISTRIBUTION — exiting in profit`);
        await closePosition(pos, tokenAddress, currentPrice, pnlUsd, "chart_distribution");
        continue;
      }

      // ── Dead position check ────────────────────────────────────────────────
      if (isDeadPosition(entryPrice, currentPrice, pos.opened_at)) {
        console.log(`💤 Dead position — no movement in 30min, exiting`);
        await closePosition(pos, tokenAddress, currentPrice, pnlUsd, "dead_position");
        continue;
      }

      // ── Ladder profit taking ───────────────────────────────────────────────
      const ladderTargets = getLadderTargets(pos.strategy);
      const ladderStage   = pos.ladder_stage ?? 0;

      let hitLadder = false;
      for (let i = ladderStage; i < ladderTargets.length; i++) {
        const target = ladderTargets[i];
        if (pnlPct >= (target.multiplier - 1) * 100 && target.sellPct > 0) {
          console.log(`💰 ${target.action}`);

          if (target.sellPct >= 1.0) {
            // Full exit
            await closePosition(pos, tokenAddress, currentPrice, pnlUsd, `ladder_${i + 1}`);
          } else {
            // Partial exit
            await partialExit(pos, tokenAddress, currentPrice, target.sellPct, i + 1);
          }
          hitLadder = true;
          break;
        }
      }

      if (hitLadder) continue;

      // ── Outlier moonbag ───────────────────────────────────────────────────
      if (pos.strategy === "outlier" && !pos.moonbag_active && pnlPct >= 100) {
        console.log(`🌙 Moonbag triggered — selling 50%`);
        await triggerMoonbag(pos, tokenAddress, currentPrice);
        await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd / 2, "🌙 Moonbag — 50% sold at 2x");
        continue;
      }

      // ── Trailing stop on moonbag ───────────────────────────────────────────
      if (pos.moonbag_active) {
        const dropFromPeak = ((peakPrice - currentPrice) / peakPrice) * 100;
        const trailingStop = (chart.shape === "FOMO" || chart.shape === "DISTRIBUTION")
          ? STRATEGY.moonbag.trailingStopPercent * 0.6
          : STRATEGY.moonbag.trailingStopPercent;

        if (dropFromPeak >= trailingStop) {
          console.log(`🛑 Trailing stop hit — ${dropFromPeak.toFixed(1)}% from peak`);
          await closePosition(pos, tokenAddress, currentPrice, pnlUsd, "tsl");
          continue;
        }
      }

      // ── Hard stop loss ────────────────────────────────────────────────────
      const stopLoss = chart.shape === "FOMO"
        ? STRATEGY.standard.stopLossPercent * 0.5
        : STRATEGY.standard.stopLossPercent;

      if (pnlPct <= -stopLoss && !pos.moonbag_active) {
        console.log(`🛑 Stop loss hit (${stopLoss}%)`);
        await closePosition(pos, tokenAddress, currentPrice, pnlUsd, "sl");
      }
    }
  } catch (err: any) {
    console.error("❌ monitorPositions error:", err.message);
  }
}

// ─── Partial exit ─────────────────────────────────────────────────────────────

async function partialExit(
  pos:          Position,
  tokenAddress: string,
  currentPrice: number,
  sellPct:      number,
  ladderStage:  number,
): Promise<void> {
  const totalNative = BigInt(Math.floor(parseFloat(pos.amount_native) * 1e9));
  const sellNative  = BigInt(Math.floor(Number(totalNative) * sellPct));
  const remaining   = totalNative - sellNative;

  await sellToken(tokenAddress, sellNative.toString());

  const partialPnl = (currentPrice - pos.entry_price) / pos.entry_price * pos.amount_usd * sellPct;

  await supabase.from("trades").update({
    amount_native: remaining.toString(),
    amount_usd:    pos.amount_usd * (1 - sellPct),
    ladder_stage:  ladderStage,
  }).eq("id", pos.id);

  await sendExitAlert(tokenAddress, pos, currentPrice, partialPnl, `💰 Ladder ${ladderStage} — ${(sellPct * 100).toFixed(0)}% sold`);

  console.log(`✅ Ladder ${ladderStage} — sold ${(sellPct * 100).toFixed(0)}%, PnL: $${partialPnl.toFixed(2)}`);
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
    await closePosition(pos, tokenAddress, currentPrice, 0, "tp_small");
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
  pnlUsd:       number,
  reason:       string,
): Promise<void> {
  await sellToken(tokenAddress, pos.amount_native);

  await supabase.from("trades").update({
    status:     "closed",
    exit_price: currentPrice,
    pnl_usd:    pnlUsd,
    closed_at:  new Date().toISOString(),
  }).eq("id", pos.id);

  // Emit TRADE_CLOSED event
  await emit({
    type: 'TRADE_CLOSED',
    tradeId: pos.id,
    token: tokenAddress,
    walletId: '', // TODO: Get from pos
    entryPrice: pos.entry_price,
    exitPrice: currentPrice,
    pnl: pnlUsd,
    pnlPercent: ((currentPrice - pos.entry_price) / pos.entry_price) * 100,
    reason: reason,
    timestamp: Date.now(),
  });

  // Record outcome in risk engine
  recordTradeOutcome({
    tokenAddress: tokenAddress,
    entryPrice: pos.entry_price,
    exitPrice: currentPrice,
    pnlPercent: ((currentPrice - pos.entry_price) / pos.entry_price) * 100,
    pnlUsd: pnlUsd,
    reason: reason
  });

  // Log outcome for learning
  const holdTime = Math.floor((Date.now() - new Date(pos.opened_at).getTime()) / 1000); // seconds
  const pnlPercent = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
  
  // Get token symbol from database
  const { data: tokenData } = await supabase
    .from('tokens')
    .select('symbol')
    .eq('address', tokenAddress)
    .single();
  
  const tokenSymbol = tokenData?.symbol || tokenAddress.slice(0, 4);
  const walletId = 'default'; // TODO: Get actual wallet ID from position
  
  await outcomeLogger.logOutcome({
    id: uuidv4(),
    walletId: walletId,
    token: tokenAddress,
    entryPrice: pos.entry_price,
    entryConviction: 70, // TODO: Get from position/trade data
    entryMode: 'AGGRESSIVE', // TODO: Determine from strategy
    entrySignals: [], // TODO: Get from position/trade data
    emotionState: 'CALM',
    marketRegime: 'HEALTHY',
    narrativeContext: '',
    abnormalityScore: 0,
    exitPrice: currentPrice,
    exitReason: reason,
    pnl: pnlUsd,
    pnlPercent: pnlPercent,
    holdTime: holdTime,
    outcome: pnlUsd > 0 ? 'WIN' : pnlUsd < 0 ? 'LOSS' : 'BREAK_EVEN',
    confidence: 70, // TODO: Get from position/trade data
    expectedValue: 0, // TODO: Calculate expected value
    falseLiquiditySignal: false,
    fakeSocialSignal: false,
    whaleExitDetected: false,
    manipulationDetected: false,
    timestamp: new Date(pos.opened_at).getTime(),
    completedAt: Date.now(),
  });

  await sendExitAlert(tokenAddress, pos, currentPrice, pnlUsd, reason);
  console.log(`✅ Position closed — ${reason} | PnL: $${pnlUsd.toFixed(2)}`);
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
    const axios       = (await import("axios")).default;
    const { TELEGRAM } = await import("../../core/config");
    const pnlEmoji    = pnlUsd >= 0 ? "✅" : "🔴";

    const message = `
${pnlEmoji} *POSITION UPDATE*

📍 \`${tokenAddress.slice(0, 20)}...\`
💰 PnL: ${pnlUsd >= 0 ? "+" : ""}$${pnlUsd.toFixed(2)}
📊 Entry: $${pos.entry_price?.toFixed(8)}
📊 Exit:  $${currentPrice.toFixed(8)}
📝 ${reason}
    `.trim();

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,
      { chat_id: TELEGRAM.chatId, text: message, parse_mode: "Markdown" }
    );
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCurrentPairData(tokenAddress: string): Promise<any | null> {
  try {
    const axios = (await import("axios")).default;
    const res   = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`,
      { timeout: 8000 }
    );
    return (res.data ?? [])[0] ?? null;
  } catch {
    return null;
  }
}