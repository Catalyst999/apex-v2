// src/services/execution/martingale.ts
// Catalyst Apex Trader v2.1 — Martingale Execution Module
//
// From the playbook:
// "Buy into every red candle. When your initial doubles (2x), sell.
//  When another red candle forms, go in again with DOUBLE the amount
//  you gained and sell again at 2x. Rinse and repeat."
//
// Rules from the playbook:
// 1. Only works on mid/high cap tokens with volume and price action
// 2. Token must have trading history + repetitive chart patterns
// 3. WON'T work on lowcaps — no market makers, no predictability
// 4. Check Telegram hype, Twitter trending — social momentum matters
// 5. Jeeting strategy can run alongside (different wallet/holding)
//
// This module tracks Martingale state per token in Supabase and
// calculates position sizes for each level.

import { supabase } from "../../db/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MartingaleState {
  id:               string;
  token_address:    string;
  chain:            string;
  level:            number;      // 0 = not started, 1 = first entry, 2 = doubled, etc.
  base_amount_usd:  number;      // initial entry size
  current_amount_usd: number;   // current level size (doubled on loss)
  total_invested:   number;      // total USD in across all levels
  total_recovered:  number;      // total USD recovered from wins
  entry_price:      number;      // price at current level entry
  target_price:     number;      // 2x target price
  status:           "active" | "won" | "lost" | "paused";
  wins:             number;
  losses:           number;
  created_at:       string;
  updated_at:       string;
}

export interface MartingaleSignal {
  shouldEnter:     boolean;
  shouldExit:      boolean;
  level:           number;
  positionSize:    number;    // USD to use for this entry
  reason:          string;
  isDoubleDown:    boolean;   // true = this is a loss-recovery double
  maxLevelReached: boolean;   // true = hit safety limit, stop martingaling
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_MARTINGALE_LEVEL  = 4;    // max 4 levels (1x, 2x, 4x, 8x base)
const TARGET_MULTIPLIER     = 2.0;  // sell at 2x always
const MIN_MCAP_FOR_MARTINGALE = 500_000;   // min $500k mcap (playbook: mid/high cap only)
const MIN_LIQ_FOR_MARTINGALE  = 50_000;   // min $50k liquidity
const MIN_VOL_FOR_MARTINGALE  = 100_000;  // min $100k 24h volume

// ─── Eligibility check ────────────────────────────────────────────────────────
// Martingale ONLY works on liquid mid/high cap tokens.
// Do NOT apply to lowcaps — playbook is explicit about this.

export function isMartingaleEligible(pair: any): {
  eligible: boolean;
  reason:   string;
} {
  const mcap  = pair.marketCap ?? pair.fdv ?? 0;
  const liq   = pair.liquidity?.usd ?? 0;
  const vol24 = pair.volume?.h24 ?? 0;

  if (mcap < MIN_MCAP_FOR_MARTINGALE) {
    return { eligible: false, reason: `MCap $${(mcap/1000).toFixed(0)}k too low — Martingale needs mid/high cap` };
  }
  if (liq < MIN_LIQ_FOR_MARTINGALE) {
    return { eligible: false, reason: `Liquidity $${(liq/1000).toFixed(0)}k too low — needs $50k+ for slippage` };
  }
  if (vol24 < MIN_VOL_FOR_MARTINGALE) {
    return { eligible: false, reason: `24h volume $${(vol24/1000).toFixed(0)}k too low — needs active price action` };
  }

  return { eligible: true, reason: `Eligible: $${(mcap/1_000_000).toFixed(2)}M mcap, $${(liq/1000).toFixed(0)}k liq` };
}

// ─── Load active Martingale state for a token ─────────────────────────────────

export async function getMartingaleState(
  tokenAddress: string,
): Promise<MartingaleState | null> {
  try {
    const { data } = await supabase
      .from("martingale_states")
      .select("*")
      .eq("token_address", tokenAddress)
      .eq("status", "active")
      .single();

    return data as MartingaleState ?? null;
  } catch {
    return null;
  }
}

// ─── Calculate next position size ────────────────────────────────────────────
// Level 1: base amount
// Level 2: base × 2 (first double-down)
// Level 3: base × 4
// Level 4: base × 8 (final level — safety cap)

export function calculateLevelSize(baseAmountUsd: number, level: number): number {
  const multiplier = Math.pow(2, level - 1);
  return baseAmountUsd * multiplier;
}

// ─── Evaluate whether to enter a Martingale position ─────────────────────────

export async function evaluateMartingaleEntry(
  pair:          any,
  baseAmountUsd: number,
): Promise<MartingaleSignal> {
  const address = pair.baseToken?.address;
  if (!address) {
    return { shouldEnter: false, shouldExit: false, level: 0, positionSize: 0, reason: "No address", isDoubleDown: false, maxLevelReached: false };
  }

  // Check eligibility first
  const { eligible, reason: eligReason } = isMartingaleEligible(pair);
  if (!eligible) {
    return { shouldEnter: false, shouldExit: false, level: 0, positionSize: 0, reason: eligReason, isDoubleDown: false, maxLevelReached: false };
  }

  // Check for existing active state
  const existing = await getMartingaleState(address);

  if (existing) {
    const currentPrice = parseFloat(pair.priceUsd ?? "0");
    const pnlPct = existing.entry_price > 0
      ? ((currentPrice - existing.entry_price) / existing.entry_price) * 100
      : 0;

    // At 2x target → EXIT signal
    if (currentPrice >= existing.target_price) {
      return {
        shouldEnter:     false,
        shouldExit:      true,
        level:           existing.level,
        positionSize:    existing.current_amount_usd,
        reason:          `2x target hit at $${currentPrice.toFixed(8)} — JEET NOW`,
        isDoubleDown:    false,
        maxLevelReached: false,
      };
    }

    // Red candle forming (price down from entry) → consider double-down
    const priceM5 = pair.priceChange?.m5 ?? 0;
    if (priceM5 <= -3 && pnlPct < 0) {
      const nextLevel = existing.level + 1;

      if (nextLevel > MAX_MARTINGALE_LEVEL) {
        return {
          shouldEnter:     false,
          shouldExit:      false,
          level:           existing.level,
          positionSize:    0,
          reason:          `Max level ${MAX_MARTINGALE_LEVEL} reached — hold, don't double again`,
          isDoubleDown:    true,
          maxLevelReached: true,
        };
      }

      const nextSize = calculateLevelSize(existing.base_amount_usd, nextLevel);
      return {
        shouldEnter:     true,
        shouldExit:      false,
        level:           nextLevel,
        positionSize:    nextSize,
        reason:          `Red candle -${Math.abs(priceM5).toFixed(1)}% | Level ${nextLevel} double-down: $${nextSize.toFixed(0)}`,
        isDoubleDown:    true,
        maxLevelReached: false,
      };
    }

    return {
      shouldEnter:     false,
      shouldExit:      false,
      level:           existing.level,
      positionSize:    existing.current_amount_usd,
      reason:          `Holding Level ${existing.level} | PnL: ${pnlPct.toFixed(1)}%`,
      isDoubleDown:    false,
      maxLevelReached: false,
    };
  }

  // No existing state — fresh entry on red candle
  const priceM5 = pair.priceChange?.m5 ?? 0;
  const priceH1 = pair.priceChange?.h1 ?? 0;
  const buys5m  = pair.txns?.m5?.buys  ?? 0;
  const sells5m = pair.txns?.m5?.sells ?? 0;

  // Enter on red candle with buyers still present (dip, not dump)
  const isRedCandle  = priceM5 <= -3;
  const hasBuyers    = buys5m >= 5 && buys5m >= sells5m * 0.5;
  const notDumping   = priceH1 > -30; // not a full dump

  if (isRedCandle && hasBuyers && notDumping) {
    const entryPrice  = parseFloat(pair.priceUsd ?? "0");
    const targetPrice = entryPrice * TARGET_MULTIPLIER;

    return {
      shouldEnter:     true,
      shouldExit:      false,
      level:           1,
      positionSize:    baseAmountUsd,
      reason:          `Fresh Martingale entry: -${Math.abs(priceM5).toFixed(1)}% candle, ${buys5m}B/${sells5m}S — buy dip, target 2x`,
      isDoubleDown:    false,
      maxLevelReached: false,
    };
  }

  return {
    shouldEnter:     false,
    shouldExit:      false,
    level:           0,
    positionSize:    0,
    reason:          `No entry signal: priceM5=${priceM5.toFixed(1)}%, buys=${buys5m}`,
    isDoubleDown:    false,
    maxLevelReached: false,
  };
}

// ─── Open Martingale position (write to DB) ───────────────────────────────────

export async function openMartingalePosition(
  tokenAddress:  string,
  chain:         string,
  level:         number,
  amountUsd:     number,
  entryPrice:    number,
  baseAmountUsd: number,
): Promise<void> {
  try {
    const existing = await getMartingaleState(tokenAddress);
    const targetPrice = entryPrice * TARGET_MULTIPLIER;

    if (existing) {
      // Update existing state to new level
      await supabase.from("martingale_states").update({
        level,
        current_amount_usd: amountUsd,
        total_invested:     existing.total_invested + amountUsd,
        entry_price:        entryPrice,
        target_price:       targetPrice,
        updated_at:         new Date().toISOString(),
      }).eq("id", existing.id);

      console.log(`📈 Martingale Level ${level}: +$${amountUsd} | Total in: $${existing.total_invested + amountUsd} | Target: $${targetPrice.toFixed(8)}`);
    } else {
      // New Martingale session
      await supabase.from("martingale_states").insert({
        token_address:      tokenAddress,
        chain,
        level:              1,
        base_amount_usd:    baseAmountUsd,
        current_amount_usd: amountUsd,
        total_invested:     amountUsd,
        total_recovered:    0,
        entry_price:        entryPrice,
        target_price:       targetPrice,
        status:             "active",
        wins:               0,
        losses:             0,
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      });

      console.log(`📈 Martingale START: Level 1 | $${amountUsd} | Target 2x at $${targetPrice.toFixed(8)}`);
    }
  } catch (err: any) {
    console.error("❌ openMartingalePosition error:", err.message);
  }
}

// ─── Close Martingale position (win or loss) ──────────────────────────────────

export async function closeMartingalePosition(
  tokenAddress: string,
  exitPrice:    number,
  won:          boolean,
): Promise<void> {
  try {
    const state = await getMartingaleState(tokenAddress);
    if (!state) return;

    const recovered = state.total_invested * (won ? TARGET_MULTIPLIER : 0.5);

    await supabase.from("martingale_states").update({
      status:          won ? "won" : "lost",
      total_recovered: recovered,
      wins:            won ? state.wins + 1 : state.wins,
      losses:          won ? state.losses : state.losses + 1,
      updated_at:      new Date().toISOString(),
    }).eq("id", state.id);

    const pnl = recovered - state.total_invested;
    console.log(`${won ? "✅" : "❌"} Martingale ${won ? "WON" : "LOST"}: in=$${state.total_invested.toFixed(0)} out=$${recovered.toFixed(0)} pnl=${pnl >= 0 ? "+" : ""}$${pnl.toFixed(0)}`);
  } catch (err: any) {
    console.error("❌ closeMartingalePosition error:", err.message);
  }
}

// ─── Supabase table definition (run once) ────────────────────────────────────
// CREATE TABLE martingale_states (
//   id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   token_address    TEXT NOT NULL,
//   chain            TEXT NOT NULL DEFAULT 'solana',
//   level            INT NOT NULL DEFAULT 1,
//   base_amount_usd  NUMERIC NOT NULL,
//   current_amount_usd NUMERIC NOT NULL,
//   total_invested   NUMERIC NOT NULL DEFAULT 0,
//   total_recovered  NUMERIC NOT NULL DEFAULT 0,
//   entry_price      NUMERIC NOT NULL,
//   target_price     NUMERIC NOT NULL,
//   status           TEXT NOT NULL DEFAULT 'active',
//   wins             INT NOT NULL DEFAULT 0,
//   losses           INT NOT NULL DEFAULT 0,
//   created_at       TIMESTAMPTZ DEFAULT now(),
//   updated_at       TIMESTAMPTZ DEFAULT now()
// );




































































































































































































































































































































































































