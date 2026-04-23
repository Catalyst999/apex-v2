// src/services/execution/risk-engine.ts
// Catalyst Apex Trader v2.1 — Risk Engine

import { supabase } from "../../db/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskDecision {
  allowed:      boolean;
  positionSize: number;
  reason:       string;
  riskScore:    number;
}

export interface RiskState {
  id:                 number;
  consecutive_losses: number;
  total_drawdown_pct: number;
  trades_today:       number;
  daily_pnl_sol:      number;
  is_paused:          boolean;
  paused_until:       number;
  last_updated:       string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_RISK_PCT               = 0.02;
const MAX_RISK_PCT                = 0.03;
const MIN_RISK_PCT                = 0.005;
const MAX_DRAWDOWN_PCT            = 15;
const CONSECUTIVE_LOSS_REDUCE     = 3;
const CONSECUTIVE_LOSS_PAUSE      = 5;
const PAUSE_HOURS                 = 24;
const MAX_TRADES_PER_DAY          = 10;
const DAILY_SOL_TARGET            = 50;
const SOL_PRICE_ESTIMATE          = 150;
const DEAD_POSITION_MINS          = 30;

// ─── Risk state ───────────────────────────────────────────────────────────────

export async function getRiskState(): Promise<RiskState> {
  try {
    const { data } = await supabase
      .from("risk_state")
      .select("*")
      .eq("id", 1)
      .single();
    if (data) return data as RiskState;
  } catch {}

  return {
    id:                 1,
    consecutive_losses: 0,
    total_drawdown_pct: 0,
    trades_today:       0,
    daily_pnl_sol:      0,
    is_paused:          false,
    paused_until:       0,
    last_updated:       new Date().toISOString(),
  };
}

export async function updateRiskState(updates: Partial<RiskState>): Promise<void> {
  try {
    await supabase.from("risk_state").upsert({
      id: 1,
      ...updates,
      last_updated: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("❌ Risk state update error:", err.message);
  }
}

// ─── Account balance ──────────────────────────────────────────────────────────

async function getAccountBalance(): Promise<number> {
  try {
    const { data: trades } = await supabase
      .from("trades")
      .select("amount_usd, pnl_usd, status");

    if (!trades || trades.length === 0) return 100;

    const invested = trades
      .filter((t) => t.status === "open")
      .reduce((sum, t) => sum + (t.amount_usd ?? 0), 0);

    const realized = trades
      .filter((t) => t.status === "closed")
      .reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0);

    return Math.max(50, invested + realized + 50);
  } catch {
    return 100;
  }
}

// ─── Risk score ───────────────────────────────────────────────────────────────

export function calculateRiskScore(params: {
  liquidityUsd:     number;
  volLiqRatio:      number;
  buySellRatio:     number;
  topHolderPercent: number;
  buyTax:           number;
  sellTax:          number;
  chartShape:       string;
  xVelocityScore:   number;
  onChainSignal?:   string;
}): number {
  let score = 0;

  if      (params.liquidityUsd >= 50_000) score += 20;
  else if (params.liquidityUsd >= 20_000) score += 15;
  else if (params.liquidityUsd >= 10_000) score += 10;
  else if (params.liquidityUsd >= 8_000)  score += 5;

  if      (params.volLiqRatio >= 2.0) score += 20;
  else if (params.volLiqRatio >= 1.0) score += 12;
  else if (params.volLiqRatio >= 0.5) score += 6;

  if      (params.buySellRatio >= 3)   score += 20;
  else if (params.buySellRatio >= 2)   score += 14;
  else if (params.buySellRatio >= 1.5) score += 8;
  else if (params.buySellRatio >= 1)   score += 4;

  const chartBonus: Record<string, number> = {
    ACCUMULATION: 20, BREAKOUT: 15, STAIRCASE: 12,
    FLAT: 0, UNKNOWN: 0, FOMO: -10, DISTRIBUTION: -15, DUMP: -25,
  };
  score += chartBonus[params.chartShape] ?? 0;

  if (params.xVelocityScore >= 60)      score += 10;
  else if (params.xVelocityScore >= 30) score += 5;

  if (params.onChainSignal === "ACCUMULATION")      score += 15;
  else if (params.onChainSignal === "ORGANIC_DISCOVERY") score += 10;
  else if (params.onChainSignal === "SURVIVAL")     score += 8;

  if (params.topHolderPercent > 10)                   score -= 15;
  if (params.buyTax > 5 || params.sellTax > 5)        score -= 10;

  return Math.max(0, Math.min(100, score));
}

// ─── Main risk check ──────────────────────────────────────────────────────────

export async function checkRisk(params: {
  liquidityUsd:     number;
  volLiqRatio:      number;
  buySellRatio:     number;
  topHolderPercent: number;
  buyTax:           number;
  sellTax:          number;
  chartShape:       string;
  xVelocityScore:   number;
  onChainSignal?:   string;
}): Promise<RiskDecision> {
  const state   = await getRiskState();
  const balance = await getAccountBalance();

  // Kill switches
  if (state.is_paused && Date.now() / 1000 < state.paused_until) {
    const hoursLeft = ((state.paused_until - Date.now() / 1000) / 3600).toFixed(1);
    return { allowed: false, positionSize: 0, reason: `Trading paused — ${hoursLeft}h remaining`, riskScore: 0 };
  }

  if (state.daily_pnl_sol >= DAILY_SOL_TARGET) {
    return { allowed: false, positionSize: 0, reason: `🎯 Daily target hit — ${state.daily_pnl_sol.toFixed(1)} SOL. Turn off screen.`, riskScore: 100 };
  }

  if (state.total_drawdown_pct >= MAX_DRAWDOWN_PCT) {
    return { allowed: false, positionSize: 0, reason: `🛑 Drawdown ${state.total_drawdown_pct.toFixed(1)}% — trading halted`, riskScore: 0 };
  }

  if (state.trades_today >= MAX_TRADES_PER_DAY) {
    return { allowed: false, positionSize: 0, reason: `Max trades today (${MAX_TRADES_PER_DAY}) reached`, riskScore: 0 };
  }

  const riskScore = calculateRiskScore(params);

  if (riskScore < 40) {
    return { allowed: false, positionSize: 0, reason: `Risk score too low: ${riskScore}/100`, riskScore };
  }

  let riskPct = BASE_RISK_PCT;

  if (state.total_drawdown_pct >= 10)      riskPct *= 0.5;
  else if (state.total_drawdown_pct >= 5)  riskPct *= 0.75;

  if (state.consecutive_losses >= CONSECUTIVE_LOSS_REDUCE) {
    riskPct *= 0.5;
    console.log(`⚠️  Position size halved — ${state.consecutive_losses} consecutive losses`);
  }

  if (riskScore >= 80) riskPct = Math.min(riskPct * 1.5, MAX_RISK_PCT);

  riskPct = Math.max(MIN_RISK_PCT, Math.min(MAX_RISK_PCT, riskPct));

  const positionSize = Math.max(3, Math.round(balance * riskPct));

  return {
    allowed:      true,
    positionSize,
    reason:       `Risk score ${riskScore}/100 | Size: $${positionSize} (${(riskPct * 100).toFixed(1)}% of $${balance.toFixed(0)})`,
    riskScore,
  };
}

// ─── Record outcome ───────────────────────────────────────────────────────────

export async function recordTradeOutcome(won: boolean, pnlUsd: number): Promise<void> {
  const state = await getRiskState();

  const pnlSol              = pnlUsd / SOL_PRICE_ESTIMATE;
  const newPnlSol           = state.daily_pnl_sol + pnlSol;
  let consecutiveLosses     = won ? 0 : state.consecutive_losses + 1;
  let isPaused              = state.is_paused;
  let pausedUntil           = state.paused_until;

  if (consecutiveLosses >= CONSECUTIVE_LOSS_PAUSE) {
    isPaused    = true;
    pausedUntil = Math.floor(Date.now() / 1000) + PAUSE_HOURS * 3600;
    console.log(`🛑 Trading paused ${PAUSE_HOURS}h — ${consecutiveLosses} consecutive losses`);
  }

  const newDrawdown = pnlUsd < 0
    ? Math.min(state.total_drawdown_pct + Math.abs(pnlUsd / 100), 100)
    : Math.max(0, state.total_drawdown_pct - pnlUsd / 200);

  await updateRiskState({
    consecutive_losses: consecutiveLosses,
    total_drawdown_pct: newDrawdown,
    trades_today:       state.trades_today + 1,
    daily_pnl_sol:      newPnlSol,
    is_paused:          isPaused,
    paused_until:       pausedUntil,
  });

  console.log(`📊 Risk: ${consecutiveLosses} losses | ${newDrawdown.toFixed(1)}% drawdown | ${newPnlSol.toFixed(2)} SOL today`);
}

// ─── Ladder targets ───────────────────────────────────────────────────────────

export function getLadderTargets(strategy: string): Array<{ multiplier: number; sellPct: number; action: string }> {
  if (strategy === "outlier") {
    return [
      { multiplier: 2.0, sellPct: 0.5,  action: "MOONBAG — sell 50% at 2x" },
      { multiplier: 3.0, sellPct: 0.25, action: "TRAIL — sell 25% more at 3x" },
    ];
  }
  return [
    { multiplier: 1.5, sellPct: 0.3, action: "LADDER 1 — sell 30% at 1.5x" },
    { multiplier: 2.0, sellPct: 0.5, action: "LADDER 2 — sell 50% at 2x" },
    { multiplier: 3.0, sellPct: 1.0, action: "FULL EXIT — sell all at 3x" },
  ];
}

// ─── Dead position ────────────────────────────────────────────────────────────

export function isDeadPosition(
  entryPrice:   number,
  currentPrice: number,
  openedAt:     string,
): boolean {
  const ageMinutes = (Date.now() - new Date(openedAt).getTime()) / 1000 / 60;
  const pnlPct     = ((currentPrice - entryPrice) / entryPrice) * 100;
  return ageMinutes >= DEAD_POSITION_MINS && Math.abs(pnlPct) < 5;
}

// ─── Daily reset ──────────────────────────────────────────────────────────────

export async function resetDailyRiskState(): Promise<void> {
  await updateRiskState({
    trades_today:  0,
    daily_pnl_sol: 0,
    is_paused:     false,
  });
  console.log(`🔄 Daily risk state reset`);
} 