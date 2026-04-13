import { supabase } from "../../db/supabase";
import { buyToken, sellToken } from "./jupiter";
import { STRATEGY, TRADE_AMOUNT_USD } from "../../core/config";
import { usdToSol } from "./parity";

export interface Position {
  id: string;
  pair_id: string;
  chain: string;
  strategy: string;
  entry_price: number;
  amount_usd: number;
  amount_native: string;
  status: string;
  moonbag_active: boolean;
  peak_price: number;
}

export async function openPosition(
  pairId: string,
  tokenMint: string,
  chain: string,
  strategy: string,
  entryPrice: number
): Promise<void> {
  try {
    // Execute buy
    const trade = await buyToken(tokenMint);
    if (!trade.success) {
      console.error("❌ Buy failed:", trade.error);
      return;
    }

    // Calculate native amount
    const solAmount = await usdToSol(TRADE_AMOUNT_USD);

    // Store position in Supabase
    const { error } = await supabase.from("trades").insert({
      pair_id: pairId,
      chain,
      strategy,
      entry_price: entryPrice,
      amount_usd: TRADE_AMOUNT_USD,
      amount_native: solAmount.toFixed(9),
      status: "open",
      moonbag_active: false,
      peak_price: entryPrice,
    });

    if (error) console.error("❌ DB insert error:", error.message);
    else console.log(`✅ Position opened — $${TRADE_AMOUNT_USD} at $${entryPrice}`);

  } catch (err: any) {
    console.error("❌ openPosition error:", err.message);
  }
}

export async function monitorPositions(): Promise<void> {
  try {
    // Get all open positions
    const { data: positions, error } = await supabase
      .from("trades")
      .select("*, pairs(address, chain)")
      .eq("status", "open");

    if (error || !positions) return;

    for (const pos of positions) {
      const tokenAddress = pos.pairs?.address;
      if (!tokenAddress) continue;

      // Get current price from DexScreener
      const currentPrice = await getCurrentPrice(tokenAddress);
      if (!currentPrice) continue;

      const entryPrice = pos.entry_price;
      const peakPrice = Math.max(pos.peak_price, currentPrice);
      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

      console.log(`📊 ${tokenAddress.slice(0, 8)}... | Entry: $${entryPrice} | Now: $${currentPrice} | PnL: ${pnlPercent.toFixed(1)}%`);

      // Update peak price
      if (currentPrice > pos.peak_price) {
        await supabase.from("trades").update({ peak_price: currentPrice }).eq("id", pos.id);
      }

      // ── Standard Strategy ─────────────────────────────
      if (pos.strategy === "standard") {
        // Take profit at 2x
        if (pnlPercent >= (STRATEGY.standard.takeProfitMultiplier - 1) * 100) {
          console.log(`🎯 TP hit — selling full position`);
          await closePosition(pos, tokenAddress, "tp");
          continue;
        }
        // Stop loss at -30%
        if (pnlPercent <= -STRATEGY.standard.stopLossPercent) {
          console.log(`🛑 SL hit — selling full position`);
          await closePosition(pos, tokenAddress, "sl");
          continue;
        }
      }

      // ── Outlier / Moonbag Strategy ────────────────────
      if (pos.strategy === "outlier") {
        // First trigger — sell 50% at 2x
        if (!pos.moonbag_active && pnlPercent >= 100) {
          console.log(`🌙 Moonbag triggered — selling 50%`);
          await triggerMoonbag(pos, tokenAddress, currentPrice);
          continue;
        }

        // Trailing stop on remaining 50%
        if (pos.moonbag_active) {
          const dropFromPeak = ((peakPrice - currentPrice) / peakPrice) * 100;
          if (dropFromPeak >= STRATEGY.moonbag.trailingStopPercent) {
            console.log(`🛑 Trailing stop hit — selling moonbag`);
            await closePosition(pos, tokenAddress, "tsl");
            continue;
          }
        }

        // Hard stop loss before moonbag
        if (!pos.moonbag_active && pnlPercent <= -STRATEGY.standard.stopLossPercent) {
          console.log(`🛑 SL hit on outlier — selling full`);
          await closePosition(pos, tokenAddress, "sl");
        }
      }
    }
  } catch (err: any) {
    console.error("❌ monitorPositions error:", err.message);
  }
}

async function triggerMoonbag(
  pos: Position,
  tokenAddress: string,
  currentPrice: number
): Promise<void> {
  // Sell 50% of position
  const totalNative = BigInt(Math.floor(parseFloat(pos.amount_native) * 1e9));
  const halfNative = totalNative / BigInt(2);

  // Precision check — don't moonbag tiny amounts
  if (halfNative < BigInt(STRATEGY.moonbag.minSolLamports)) {
    console.log("⚠️ Amount too small for moonbag — selling full");
    await closePosition(pos, tokenAddress, "tp");
    return;
  }

  await sellToken(tokenAddress, halfNative.toString());

  // Update position to moonbag mode
  await supabase.from("trades").update({
    moonbag_active: true,
    amount_native: halfNative.toString(),
    peak_price: currentPrice,
  }).eq("id", pos.id);

  console.log(`✅ Moonbag active — holding ${halfNative} native tokens`);
}

async function closePosition(
  pos: Position,
  tokenAddress: string,
  reason: string
): Promise<void> {
  const currentPrice = await getCurrentPrice(tokenAddress);
  const pnlUsd = currentPrice
    ? (currentPrice - pos.entry_price) / pos.entry_price * pos.amount_usd
    : 0;

  await sellToken(tokenAddress, pos.amount_native);

  await supabase.from("trades").update({
    status: "closed",
    exit_price: currentPrice,
    pnl_usd: pnlUsd,
    closed_at: new Date().toISOString(),
  }).eq("id", pos.id);

  console.log(`✅ Position closed — reason: ${reason} | PnL: $${pnlUsd.toFixed(2)}`);
}

async function getCurrentPrice(tokenAddress: string): Promise<number | null> {
  try {
    const axios = (await import("axios")).default;
    const res = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`
    );
    const pairs = res.data ?? [];
    if (pairs.length === 0) return null;
    return parseFloat(pairs[0].priceUsd ?? "0");
  } catch {
    return null;
  }
}