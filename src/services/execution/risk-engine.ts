// src/services/execution/risk-engine-updated.ts
// Catalyst Apex Trader v3.0 — Risk Engine
//
// Updated with:
// - Conviction-based position sizing
// - Dynamic leverage adjustment
// - Stop loss scaling based on mode
// - Profit taking ladder based on conviction
//
// This replaces the existing risk-engine.ts
// Keep all existing logic, ADD these enhancements

import { RISK_CONFIG, CONVICTION_THRESHOLDS } from "../../core/config";
import { ConvictionScaledRisk, calculatePositionSize as calcPosSize } from "../intelligence/conviction-scaler";

export interface RiskAdjustedTrade {
  tokenAddress: string;
  entryPrice: number;
  positionSizeUSD: number;
  positionSizeTokens: number;
  leverage: number;
  stopLossPrice: number;
  hardStopLossPercent: number;
  takeProfitLadder: Array<{
    target: number; // % of position
    targetPrice: number;
    profitPercent: number;
  }>;
  trailingStopPercent: number;
  estimatedMaxLoss: number;
  riskRewardRatio: number;
  convictionMode: string;
}

// ─── Position Sizing with Conviction ──────────────────────────────────────

export function sizePosition(
  conviction: ConvictionScaledRisk,
  equityBalanceUSD: number,
  memecoinBalanceUSD: number,
  availableLiquidity: number,
  riskPerTradePercent: number = 2,
): RiskAdjustedTrade | null {
  // ─── Safety Checks ────────────────────────────────────────────────────

  // If mode is INACTIVE or OBSERVATION, don't trade
  if (conviction.mode === "INACTIVE" || conviction.mode === "OBSERVATION") {
    console.log(`⛔ Position sizing blocked: Conviction mode is ${conviction.mode}`);
    return null;
  }

  // ─── Calculate Position Size ──────────────────────────────────────────

  const maxPositionFromConviction = equityBalanceUSD * (conviction.maxPositionSize / 100);
  const maxPositionFromRisk = RISK_CONFIG.maxPositionSizeUSD;
  const maxPositionAllowed = Math.min(maxPositionFromConviction, maxPositionFromRisk);

  // Don't exceed available liquidity
  const safePositionSize = Math.min(maxPositionAllowed, availableLiquidity * 0.1); // 10% of liquidity

  if (safePositionSize < 10) {
    // Position too small
    console.log(`⛔ Position too small: $${safePositionSize}`);
    return null;
  }

  // ─── Adjust Based on Current Exposure ──────────────────────────────────

  const currentExposureRatio = memecoinBalanceUSD / equityBalanceUSD;
  let finalPositionSize = safePositionSize;

  if (currentExposureRatio > 0.5) {
    // Already 50%+ in memecoins, reduce new position
    finalPositionSize *= 0.7;
    console.log(
      `📉 Position reduced: Already ${(currentExposureRatio * 100).toFixed(0)}% in memecoins`,
    );
  }

  // ─── Leverage Adjustment ──────────────────────────────────────────────

  let appliedLeverage = conviction.leverage;

  // Reduce leverage if equity is low
  if (equityBalanceUSD < 100) {
    appliedLeverage = 1;
    console.log(`⚠️ Leverage reduced to 1x: Low equity`);
  }

  // Reduce leverage if already high exposure
  if (currentExposureRatio > 0.4) {
    appliedLeverage = Math.max(1, appliedLeverage - 1);
    console.log(`⚠️ Leverage reduced: High existing exposure`);
  }

  // ─── Stop Loss Calculation ────────────────────────────────────────────

  // Assuming we're entering at market
  const entryPrice = 1; // Normalized for calculation
  const hardStopPercent = conviction.hardStopLossPercent;
  const stopLossPrice = entryPrice * (1 - hardStopPercent / 100);

  // ─── Profit Taking Ladder ────────────────────────────────────────────

  const takeProfitLadder = conviction.takeProfitLadder.map((targetPercent, index) => {
    // Each target is a price level
    // For example, if ladder is [40, 35, 20, 5]:
    // Take 40% profit at 2x
    // Take 35% profit at 4x
    // etc.

    const profitMultiple = index + 2; // 2x, 3x, 4x, 5x...
    const targetPrice = entryPrice * profitMultiple;
    const profitPercent = (targetPrice - entryPrice) / entryPrice * 100;

    return {
      target: targetPercent,
      targetPrice,
      profitPercent,
    };
  });

  // ─── Risk/Reward Ratio ────────────────────────────────────────────────

  const maxPotentialProfit = takeProfitLadder[takeProfitLadder.length - 1]?.profitPercent || 50;
  const maxRisk = hardStopPercent;
  const riskRewardRatio = maxPotentialProfit / maxRisk;

  // Skip if risk/reward not favorable
  if (riskRewardRatio < 1.5) {
    console.log(
      `⛔ Risk/reward unfavorable: ${riskRewardRatio.toFixed(2)}:1 (need 1.5:1+)`,
    );
    return null;
  }

  // ─── Finalize Trade Parameters ────────────────────────────────────────

  const trade: RiskAdjustedTrade = {
    tokenAddress: "TBD", // Set by caller
    entryPrice,
    positionSizeUSD: finalPositionSize,
    positionSizeTokens: finalPositionSize / entryPrice, // will be real price
    leverage: appliedLeverage,
    stopLossPrice,
    hardStopLossPercent: hardStopPercent,
    takeProfitLadder,
    trailingStopPercent: conviction.trailingStopPercent,
    estimatedMaxLoss: finalPositionSize * (hardStopPercent / 100),
    riskRewardRatio,
    convictionMode: conviction.mode,
  };

  return trade;
}

// ─── Conviction-Based Position Adjustment ──────────────────────────────────

export function adjustPositionForConviction(
  conviction: ConvictionScaledRisk,
  basePositionSize: number,
): number {
  // Scale position based on conviction confidence
  const confidenceMultiplier = conviction.confidence / 100;

  const scaledSize = basePositionSize * confidenceMultiplier;

  console.log(
    `📊 Position scaled: ${basePositionSize} → ${scaledSize.toFixed(0)} (${conviction.confidence}% confidence)`,
  );

  return scaledSize;
}

// ─── Determine Stop Loss Percentage ────────────────────────────────────────

export function getStopLossPercent(conviction: ConvictionScaledRisk): number {
  // Tighter stops for weaker signals
  const stopMap: Record<string, number> = {
    AGGRESSIVE: 12,
    CAUTIOUS: 8,
    DEFENSIVE: 5,
    OBSERVATION: 0,
    INACTIVE: 0,
  };

  return stopMap[conviction.mode] || 8;
}

// ─── Determine Trailing Stop ──────────────────────────────────────────────

export function getTrailingStopPercent(conviction: ConvictionScaledRisk): number {
  // Closer trailing stops for weaker signals (lock in gains)
  const trailingMap: Record<string, number> = {
    AGGRESSIVE: 8,
    CAUTIOUS: 5,
    DEFENSIVE: 3,
    OBSERVATION: 0,
    INACTIVE: 0,
  };

  return trailingMap[conviction.mode] || 5;
}

// ─── Check if Trade Still Valid ───────────────────────────────────────────

export function validateTradeSetup(trade: RiskAdjustedTrade): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check position size
  if (trade.positionSizeUSD < 10) {
    errors.push("Position size too small (<$10)");
  }
  if (trade.positionSizeUSD > RISK_CONFIG.maxPositionSizeUSD) {
    errors.push(`Position size exceeds max ($${RISK_CONFIG.maxPositionSizeUSD})`);
  }

  // Check leverage
  if (trade.leverage > RISK_CONFIG.maxLeverageDefault) {
    errors.push(`Leverage exceeds max (${RISK_CONFIG.maxLeverageDefault}x)`);
  }

  // Check risk/reward
  if (trade.riskRewardRatio < 1.5) {
    errors.push(`Risk/reward unfavorable (${trade.riskRewardRatio.toFixed(2)}:1)`);
  }

  // Check stop loss
  if (trade.hardStopLossPercent < 2 || trade.hardStopLossPercent > 20) {
    errors.push("Stop loss % out of reasonable range");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Calculate Max Drawdown from Position ──────────────────────────────────

export function calculateMaxDrawdown(
  positionSize: number,
  hardStopPercent: number,
  equityBalance: number,
): {
  maxLossUSD: number;
  maxLossPercent: number;
  remainingEquity: number;
} {
  const maxLossUSD = positionSize * (hardStopPercent / 100);
  const maxLossPercent = (maxLossUSD / equityBalance) * 100;
  const remainingEquity = equityBalance - maxLossUSD;

  return {
    maxLossUSD,
    maxLossPercent,
    remainingEquity,
  };
}

// ─── Check Daily Loss Limit ───────────────────────────────────────────────

export async function checkDailyLossLimit(
  equityStart: number,
  equityNow: number,
): Promise<{
  withinLimit: boolean;
  dailyLossPercent: number;
  reason?: string;
}> {
  const dailyLoss = equityStart - equityNow;
  const dailyLossPercent = (dailyLoss / equityStart) * 100;
  const dailyLimit = RISK_CONFIG.dailyLossLimit;

  const withinLimit = dailyLossPercent < dailyLimit;

  return {
    withinLimit,
    dailyLossPercent,
    reason: withinLimit
      ? undefined
      : `Daily loss (${dailyLossPercent.toFixed(1)}%) exceeds limit (${dailyLimit}%)`,
  };
}

// ─── Emergency: Reduce All Positions ────────────────────────────────────

export function getEmergencyReducePercentage(conviction: ConvictionScaledRisk): number {
  // In emergency, reduce position by this %
  const reduceMap: Record<string, number> = {
    AGGRESSIVE: 50, // Reduce aggressive positions 50%
    CAUTIOUS: 30,
    DEFENSIVE: 25,
    OBSERVATION: 0,
    INACTIVE: 0,
  };

  return reduceMap[conviction.mode] || 25;
}

// ─── Profit Taking Helper ──────────────────────────────────────────────────

export function calculateProfitTaking(
  conviction: ConvictionScaledRisk,
  currentProfit: number, // %
  positionSizeTokens: number,
): {
  shouldTakeProfitAmount: number;
  remainingAmount: number;
  nextTarget: number | null;
} {
  const ladder = conviction.takeProfitLadder;
  let remainingAmount = positionSizeTokens;
  let takeAmount = 0;

  for (let i = 0; i < ladder.length; i++) {
    const target = ladder[i];
    // If profit reaches this ladder step, take that percentage
    if (currentProfit >= target * 25) {
      // Rough scaling (adjust as needed)
      takeAmount += positionSizeTokens * (target / 100);
      remainingAmount -= takeAmount;
    } else {
      // Next unfilled target
      return {
        shouldTakeProfitAmount: takeAmount,
        remainingAmount,
        nextTarget: target,
      };
    }
  }

  return {
    shouldTakeProfitAmount: takeAmount,
    remainingAmount,
    nextTarget: null,
  };
}

// ─── Risk Summary ─────────────────────────────────────────────────────────

export function summarizeRisk(trade: RiskAdjustedTrade): string {
  const lines = [
    `💰 RISK SUMMARY`,
    `Position: $${trade.positionSizeUSD.toFixed(0)} (${trade.leverage}x leverage)`,
    `Entry: ${trade.entryPrice}`,
    `Stop Loss: ${trade.stopLossPrice.toFixed(6)} (-${trade.hardStopLossPercent}%)`,
    `Max Loss: $${trade.estimatedMaxLoss.toFixed(0)}`,
    `Risk/Reward: ${trade.riskRewardRatio.toFixed(2)}:1`,
    `Conviction: ${trade.convictionMode}`,
    `Trailing Stop: ${trade.trailingStopPercent}%`,
    ``,
    `Profit Targets:`,
    ...trade.takeProfitLadder.map(
      (t) =>
        `  ${t.target}% at ${t.targetPrice.toFixed(6)} (+${t.profitPercent.toFixed(0)}%)`,
    ),
  ];

  return lines.join("\n");
}