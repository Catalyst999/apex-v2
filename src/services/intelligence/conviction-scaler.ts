// src/services/intelligence/conviction-scaler.ts
// Catalyst Apex Trader v3.0 — Conviction Scaler
//
// Dynamic aggression modes based on full alignment scoring.
// System adjusts position sizing, leverage, and risk based on signal strength.
// Not static risk management — ADAPTIVE conviction scaling.
//
// Modes:
// - AGGRESSIVE: All signals aligned, high conviction, max position sizing
// - CAUTIOUS: Mixed signals, moderate position sizing, trailing stops tighter
// - DEFENSIVE: Weak signals or warnings, minimum exposure, stop losses tight
// - OBSERVATION: Interesting but not ready, no position, watch and learn
// - INACTIVE: Dead coin or phase, no trades, record patterns

export type ConvictionMode =
  | "AGGRESSIVE"
  | "CAUTIOUS"
  | "DEFENSIVE"
  | "OBSERVATION"
  | "INACTIVE";

export interface AlignmentScore {
  narrativeScore:       number;        // 0-100 (narrative strength)
  technicalScore:       number;        // 0-100 (chart setup)
  behavioralScore:      number;        // 0-100 (emotion + memory)
  liquidityScore:       number;        // 0-100 (slippage potential)
  safetyScore:          number;        // 0-100 (risk warnings)
  timerScore:           number;        // 0-100 (time of day)
  marketRegimeScore:    number;        // 0-100 (overall market health)
  smartMoneyScore:      number;        // 0-100 (whale activity)
}

export interface ConvictionScaledRisk {
  mode:                 ConvictionMode;
  confidence:           number;        // 0-100 overall
  maxPositionSize:      number;        // % of capital
  leverage:             number;        // 1x - 5x
  entryTarget:          number;        // % of ideal
  takeProfitLadder:     number[];      // % targets (e.g., [50, 30, 20])
  trailingStopPercent:  number;        // trailing stop %
  hardStopLossPercent:  number;        // absolute stop loss %
  holdDuration:         { min: number; max: number }; // minutes
  recommendedAction:    string;        // human readable
  warningFlags:         string[];      // things to watch
}

// ─── Conviction Mode Detection ───────────────────────────────────────────

export function calculateConvictionMode(scores: AlignmentScore): ConvictionScaledRisk {
  // Calculate weighted alignment
  const weights = {
    narrative: 0.2,
    technical: 0.15,
    behavioral: 0.25,
    liquidity: 0.15,
    safety: 0.15,
    timer: 0.05,
    marketRegime: 0.03,
    smartMoney: 0.02,
  };

  const weightedScore =
    scores.narrativeScore * weights.narrative +
    scores.technicalScore * weights.technical +
    scores.behavioralScore * weights.behavioral +
    scores.liquidityScore * weights.liquidity +
    scores.safetyScore * weights.safety +
    scores.timerScore * weights.timer +
    scores.marketRegimeScore * weights.marketRegime +
    scores.smartMoneyScore * weights.smartMoney;

  const confidence = Math.round(weightedScore);
  const warningFlags: string[] = [];

  // ─── Safety Checks ────────────────────────────────────────────────────

  if (scores.safetyScore < 30) {
    warningFlags.push("⚠️ HIGH RISK PROFILE");
    return {
      mode: "INACTIVE",
      confidence,
      maxPositionSize: 0,
      leverage: 1,
      entryTarget: 0,
      takeProfitLadder: [],
      trailingStopPercent: 2,
      hardStopLossPercent: 2,
      holdDuration: { min: 0, max: 0 },
      recommendedAction: "🛑 SKIP - Risk profile unacceptable",
      warningFlags: ["contract_risk", "rug_probability_high", "deployer_suspicious"],
    };
  }

  if (scores.marketRegimeScore < 20) {
    warningFlags.push("⚠️ BAD MARKET REGIME");
  }

  if (scores.liquidityScore < 30) {
    warningFlags.push("⚠️ THIN LIQUIDITY");
  }

  // ─── Mode Assignment ──────────────────────────────────────────────────

  let mode: ConvictionMode;
  let maxPositionSize: number;
  let leverage: number;
  let entryTarget: number;
  let takeProfitLadder: number[];
  let trailingStopPercent: number;
  let hardStopLossPercent: number;
  let holdDuration: { min: number; max: number };
  let recommendedAction: string;

  // AGGRESSIVE: 80+ confidence, all signals aligned
  if (
    confidence >= 80 &&
    scores.narrativeScore >= 70 &&
    scores.technicalScore >= 70 &&
    scores.behavioralScore >= 70 &&
    scores.safetyScore >= 70
  ) {
    mode = "AGGRESSIVE";
    maxPositionSize = 15; // 15% of capital
    leverage = 3; // can use 3x
    entryTarget = 90; // wait for 90% of ideal signal
    takeProfitLadder = [40, 35, 20, 5]; // 40% at 2x, 35% at 4x, etc
    trailingStopPercent = 8;
    hardStopLossPercent = 12;
    holdDuration = { min: 15, max: 240 }; // 15min to 4hr
    recommendedAction = "🚀 AGGRESSIVE - Full alignment, high confidence";
  }
  // CAUTIOUS: 60-79 confidence, some signals mixed
  else if (confidence >= 60 && scores.safetyScore >= 50) {
    mode = "CAUTIOUS";
    maxPositionSize = 8; // 8% of capital
    leverage = 2; // 2x max
    entryTarget = 80; // stricter entry
    takeProfitLadder = [50, 50]; // 50/50 split
    trailingStopPercent = 5;
    hardStopLossPercent = 8;
    holdDuration = { min: 10, max: 120 }; // 10min to 2hr
    recommendedAction = "⚡ CAUTIOUS - Good signals but mixed, moderate position";
  }
  // DEFENSIVE: 40-59 confidence or safety concerns
  else if (confidence >= 40 && scores.safetyScore >= 40) {
    mode = "DEFENSIVE";
    maxPositionSize = 3; // 3% of capital
    leverage = 1; // no leverage
    entryTarget = 70; // very strict entry
    takeProfitLadder = [100]; // all at first target
    trailingStopPercent = 3;
    hardStopLossPercent = 5;
    holdDuration = { min: 5, max: 60 }; // 5min to 1hr
    recommendedAction = "🛡️ DEFENSIVE - Weak signals, minimal position, tight stops";
    warningFlags.push("Keep position small, exit quickly on weakness");
  }
  // OBSERVATION: Interesting but not trade-ready
  else if (confidence >= 30) {
    mode = "OBSERVATION";
    maxPositionSize = 0; // no position
    leverage = 1;
    entryTarget = 0;
    takeProfitLadder = [];
    trailingStopPercent = 0;
    hardStopLossPercent = 0;
    holdDuration = { min: 0, max: 0 };
    recommendedAction = "👀 OBSERVATION - Monitor, not ready yet";
    warningFlags.push("Watch for signal maturation before entering");
  }
  // INACTIVE: Dead coin or bad phase
  else {
    mode = "INACTIVE";
    maxPositionSize = 0;
    leverage = 1;
    entryTarget = 0;
    takeProfitLadder = [];
    trailingStopPercent = 2;
    hardStopLossPercent = 2;
    holdDuration = { min: 0, max: 0 };
    recommendedAction = "🛑 INACTIVE - Not worth trading now";
    warningFlags.push("Record pattern outcomes, move on");
  }

  // Add additional warnings based on score imbalances
  if (scores.narrativeScore < 40 && mode !== "INACTIVE") {
    warningFlags.push("Weak narrative, could collapse quickly");
  }
  if (scores.technicalScore < 40 && mode !== "INACTIVE") {
    warningFlags.push("Poor chart setup, risky entry");
  }
  if (scores.liquidityScore < 50) {
    warningFlags.push("Low liquidity, slippage risk");
  }
  if (scores.timerScore < 30) {
    warningFlags.push("Bad time of day, reduce size");
  }

  return {
    mode,
    confidence,
    maxPositionSize,
    leverage,
    entryTarget,
    takeProfitLadder,
    trailingStopPercent,
    hardStopLossPercent,
    holdDuration,
    recommendedAction,
    warningFlags,
  };
}

// ─── Dynamic Position Sizing ──────────────────────────────────────────────

export function calculatePositionSize(
  conviction: ConvictionScaledRisk,
  availableCapital: number,
  maxLossPerTrade: number, // e.g., 0.02 for 2% risk
): number {
  if (conviction.mode === "INACTIVE" || conviction.mode === "OBSERVATION") {
    return 0;
  }

  const maxAllowed = availableCapital * (conviction.maxPositionSize / 100);

  // Size based on stop loss distance
  const stopLossAmount = maxLossPerTrade * availableCapital;
  const riskPerUnit = conviction.hardStopLossPercent / 100;
  const sizeBasedOnRisk = stopLossAmount / riskPerUnit;

  const position = Math.min(maxAllowed, sizeBasedOnRisk);

  return Math.round(position);
}

// ─── Leverage Calculator ──────────────────────────────────────────────────

export function calculateLeverage(
  conviction: ConvictionScaledRisk,
  equityBalance: number,
  memeBalance: number,
): number {
  // Never exceed max for mode
  let recommendedLeverage = conviction.leverage;

  // Reduce if low equity
  if (equityBalance < 100) {
    recommendedLeverage = 1;
  }

  // Reduce if already in multiple positions
  const exposureRatio = memeBalance / equityBalance;
  if (exposureRatio > 0.5) {
    recommendedLeverage = Math.max(1, recommendedLeverage - 1);
  }

  return recommendedLeverage;
}

// ─── Alignment Score Template ────────────────────────────────────────────

export function createAlignmentScore(
  narrativeScore: number = 50,
  technicalScore: number = 50,
  behavioralScore: number = 50,
  liquidityScore: number = 50,
  safetyScore: number = 50,
  timerScore: number = 50,
  marketRegimeScore: number = 50,
  smartMoneyScore: number = 50,
): AlignmentScore {
  return {
    narrativeScore: Math.max(0, Math.min(100, narrativeScore)),
    technicalScore: Math.max(0, Math.min(100, technicalScore)),
    behavioralScore: Math.max(0, Math.min(100, behavioralScore)),
    liquidityScore: Math.max(0, Math.min(100, liquidityScore)),
    safetyScore: Math.max(0, Math.min(100, safetyScore)),
    timerScore: Math.max(0, Math.min(100, timerScore)),
    marketRegimeScore: Math.max(0, Math.min(100, marketRegimeScore)),
    smartMoneyScore: Math.max(0, Math.min(100, smartMoneyScore)),
  };
}

// ─── Score Explainer ──────────────────────────────────────────────────────

export function explainScores(scores: AlignmentScore): string {
  const lines = [
    `📊 ALIGNMENT BREAKDOWN:`,
    `  Narrative: ${scores.narrativeScore}% (CT + discourse strength)`,
    `  Technical: ${scores.technicalScore}% (chart pattern quality)`,
    `  Behavioral: ${scores.behavioralScore}% (emotion phase + memory)`,
    `  Liquidity: ${scores.liquidityScore}% (ability to exit)`,
    `  Safety: ${scores.safetyScore}% (risk level)`,
    `  Timer: ${scores.timerScore}% (time of day advantage)`,
    `  Market Regime: ${scores.marketRegimeScore}% (overall market health)`,
    `  Smart Money: ${scores.smartMoneyScore}% (whale activity)`,
  ];

  return lines.join("\n");
}