// src/services/scoring/router-updated.ts
// Catalyst Apex Trader v3.0 — Signal Router
// 
// Updated with:
// - Market regime dampening
// - No-trade intelligence
// - Behavioral intelligence integration
// - Conviction-based routing
//
// This replaces the existing router.ts
// Keep all existing logic, ADD these enhancements

import { FEATURE_FLAGS, MARKET_REGIME, CONVICTION_THRESHOLDS } from "../../core/config";
import { calculateConvictionMode, AlignmentScore } from "./conviction-scaler";
import { detectEmotionPhase, PhaseIndicators } from "./emotion-modeler";
import { assessPvPSafety } from "./pvp-survival-detector";
import { detectFakeBreakout, detectExitLiquidityTrap } from "./pvp-survival-detector";

export interface RoutingDecision {
  shouldTrade: boolean;
  reason: string;
  severity: "SKIP" | "REDUCE" | "NORMAL" | "AGGRESSIVE";
  convictionMode: string;
  recommendedPositionSize: number; // % of capital
  recommendedLeverage: number;
}

// ─── Market Regime Detection ──────────────────────────────────────────────

export async function getMarketRegime(): Promise<{
  regimeHealth: "HEALTHY" | "WARMING" | "COLD";
  score: number; // 0-100
  reasons: string[];
}> {
  try {
    // Placeholder: In production, aggregate from market memory + narrative flows
    // For now: simple heuristic
    
    // Score based on:
    // 1. Recent win rate (if cold, many losses)
    // 2. Narrative diversity (if single narrative saturated)
    // 3. Overall liquidity (if declining)
    // 4. Volatility (if extreme)

    let score = 70; // baseline
    const reasons: string[] = [];

    // Would query supabase for actual metrics
    // const { data: recentTrades } = await supabase
    //   .from("trades")
    //   .select("*")
    //   .order("timestamp", { ascending: false })
    //   .limit(20);

    // For now, simulate with config
    const minRegimeScore = MARKET_REGIME.minAverageNarrativeScore;

    if (score < minRegimeScore) {
      score -= 20;
      reasons.push("Market regime declining - narrative diversity low");
    }

    let regimeHealth: "HEALTHY" | "WARMING" | "COLD";
    if (score >= 70) {
      regimeHealth = "HEALTHY";
      reasons.push("✅ Market regime HEALTHY");
    } else if (score >= 45) {
      regimeHealth = "WARMING";
      reasons.push("⚠️ Market regime WARMING (caution)");
    } else {
      regimeHealth = "COLD";
      reasons.push("❄️ Market regime COLD (high risk)");
    }

    return { regimeHealth, score, reasons };
  } catch (err: any) {
    console.error("❌ Regime detection error:", err.message);
    return {
      regimeHealth: "WARMING",
      score: 50,
      reasons: ["Error in regime detection, defaulting to cautious"],
    };
  }
}

// ─── Main Router Function ─────────────────────────────────────────────────

export async function routeSignal(
  signal: any,
  alignmentScore: AlignmentScore,
  emotionPhaseIndicators: PhaseIndicators,
): Promise<RoutingDecision> {
  const reasons: string[] = [];

  // ─── Step 1: Market Regime Check ──────────────────────────────────────

  const { regimeHealth, score: regimeScore, reasons: regimeReasons } = await getMarketRegime();
  reasons.push(...regimeReasons);

  // Dampen conviction in bad regimes
  let convictionMultiplier = 1.0;
  if (regimeHealth === "WARMING") {
    convictionMultiplier = 0.85; // 15% less aggressive
    reasons.push("📉 Conviction dampened due to warming regime");
  } else if (regimeHealth === "COLD") {
    convictionMultiplier = 0.65; // 35% less aggressive
    reasons.push("❄️ Conviction significantly dampened due to cold regime");
    
    // In cold regime, may want to pause trading
    if (MARKET_REGIME.tradingPauseOnBadRegime) {
      return {
        shouldTrade: false,
        reason: "🛑 Trading paused: Market regime is COLD",
        severity: "SKIP",
        convictionMode: "INACTIVE",
        recommendedPositionSize: 0,
        recommendedLeverage: 1,
      };
    }
  }

  // ─── Step 2: Behavioral Intelligence Checks ────────────────────────────

  // Check emotion phase
  let emotionPhase = "UNKNOWN";
  let shouldSkipEmotion = false;

  if (FEATURE_FLAGS.useEmotionModeler) {
    const emotion = detectEmotionPhase(
      emotionPhaseIndicators,
      "SILENT_ACCUMULATION",
      signal,
    );

    emotionPhase = emotion.phase;
    reasons.push(`💭 Emotion phase: ${emotion.phase} (intensity: ${emotion.intensity}%)`);

    // Skip on death phases
    if (emotion.phase === "DEATH_SPIRAL" || emotion.phase === "CAPITULATION") {
      shouldSkipEmotion = true;
      reasons.push("🛑 Emotion-based skip: Death spiral or capitulation detected");
    }

    // Reduce on exhaustion
    if (emotion.phase === "EXHAUSTION_TOP" || emotion.phase === "FEAR") {
      convictionMultiplier *= 0.7;
      reasons.push("⚠️ Conviction reduced: Exhaustion/fear phase");
    }
  }

  if (shouldSkipEmotion) {
    return {
      shouldTrade: false,
      reason: reasons.join(" | "),
      severity: "SKIP",
      convictionMode: "INACTIVE",
      recommendedPositionSize: 0,
      recommendedLeverage: 1,
    };
  }

  // ─── Step 3: PvP Warfare Detection ────────────────────────────────────

  let shouldSkipPvP = false;
  if (FEATURE_FLAGS.usePvpSurvivalDetector) {
    // Check for fake breakout (example)
    const priceHistory = signal.priceHistory || [];
    const volumeHistory = signal.volumeHistory || [];
    const liquidityHistory = signal.liquidityHistory || [];
    const holderHistory = signal.holderHistory || [];

    if (priceHistory.length >= 5) {
      const fakeBreakout = detectFakeBreakout(
        priceHistory,
        volumeHistory,
        liquidityHistory,
        holderHistory,
      );

      if (fakeBreakout && fakeBreakout.safetyRating === "LETHAL") {
        shouldSkipPvP = true;
        reasons.push(`🚨 PvP Skip: ${fakeBreakout.recommendedAction}`);
      } else if (fakeBreakout && fakeBreakout.safetyRating === "DANGER") {
        convictionMultiplier *= 0.5;
        reasons.push(`⚠️ Conviction halved: ${fakeBreakout.recommendedAction}`);
      }
    }

    // Check for exit traps
    if (!shouldSkipPvP && holderHistory.length > 0) {
      const exitTrap = detectExitLiquidityTrap(
        priceHistory,
        signal.buys || 0,
        signal.sells || 0,
        signal.liquidityAddedRecently || false,
        signal.holderConcentration || 0,
      );

      if (exitTrap && exitTrap.safetyRating === "LETHAL") {
        shouldSkipPvP = true;
        reasons.push(`🚨 PvP Skip: ${exitTrap.recommendedAction}`);
      } else if (exitTrap && exitTrap.safetyRating === "DANGER") {
        convictionMultiplier *= 0.6;
        reasons.push(`⚠️ Conviction reduced: Exit trap detected`);
      }
    }
  }

  if (shouldSkipPvP) {
    return {
      shouldTrade: false,
      reason: reasons.join(" | "),
      severity: "SKIP",
      convictionMode: "INACTIVE",
      recommendedPositionSize: 0,
      recommendedLeverage: 1,
    };
  }

  // ─── Step 4: Conviction Scaling ──────────────────────────────────────

  // Apply multiplier to alignment scores
  const adjustedAlignment: AlignmentScore = {
    narrativeScore: alignmentScore.narrativeScore * convictionMultiplier,
    technicalScore: alignmentScore.technicalScore * convictionMultiplier,
    behavioralScore: alignmentScore.behavioralScore * convictionMultiplier,
    liquidityScore: alignmentScore.liquidityScore,
    safetyScore: alignmentScore.safetyScore,
    timerScore: alignmentScore.timerScore,
    marketRegimeScore: regimeScore,
    smartMoneyScore: alignmentScore.smartMoneyScore,
  };

  const conviction = calculateConvictionMode(adjustedAlignment);
  reasons.push(`💪 Conviction mode: ${conviction.mode} (${conviction.confidence}%)`);

  // ─── Step 5: Narrative Saturation Check ────────────────────────────────

  if (FEATURE_FLAGS.useNarrativeRotation) {
    // Would query narrative_flows from Supabase
    // For now, placeholder

    const narrativeCategory = signal.narrativeCategory || "UNKNOWN";
    // const { data: narrative } = await supabase
    //   .from("narrative_flows")
    //   .select("*")
    //   .eq("category", narrativeCategory)
    //   .order("timestamp", { ascending: false })
    //   .limit(1)
    //   .single();

    // if (narrative?.saturation > 85) {
    //   reasons.push("📊 Narrative saturation > 85%, capital rotating away");
    //   conviction = { ...conviction, confidence: conviction.confidence * 0.7 };
    // }
  }

  // ─── Step 6: Final Decision ────────────────────────────────────────────

  let shouldTrade = true;
  let severity: "SKIP" | "REDUCE" | "NORMAL" | "AGGRESSIVE" = "NORMAL";

  if (conviction.mode === "INACTIVE" || conviction.mode === "OBSERVATION") {
    shouldTrade = false;
    severity = "SKIP";
    reasons.push(`🛑 Conviction mode ${conviction.mode} = NO TRADE`);
  } else if (conviction.mode === "DEFENSIVE") {
    severity = "REDUCE";
    reasons.push("🛡️ DEFENSIVE mode: Small position, tight stops");
  } else if (conviction.mode === "AGGRESSIVE") {
    severity = "AGGRESSIVE";
    reasons.push("🚀 AGGRESSIVE mode: Full position sizing");
  }

  // Check max open positions in bad regime
  if (regimeHealth === "COLD" && MARKET_REGIME.maxOpenPositionsInBadRegime === 1) {
    // Would check current open position count
    // If already have 1, don't add more
    // Placeholder logic here
  }

  return {
    shouldTrade,
    reason: reasons.join(" | "),
    severity,
    convictionMode: conviction.mode,
    recommendedPositionSize: conviction.maxPositionSize,
    recommendedLeverage: conviction.leverage,
  };
}

// ─── No-Trade Decision Generator ──────────────────────────────────────────

export function explainNoTrade(decision: RoutingDecision): string {
  const lines = [
    `❌ TRADE SKIPPED`,
    ``,
    `Reason: ${decision.reason}`,
    `Confidence: Below decision threshold`,
    `Next action: Monitor and wait for better signal`,
  ];

  return lines.join("\n");
}

// ─── Trade Decision Generator ────────────────────────────────────────────

export function explainTrade(decision: RoutingDecision): string {
  const lines = [
    `✅ TRADE APPROVED`,
    ``,
    `Mode: ${decision.convictionMode}`,
    `Position size: ${decision.recommendedPositionSize}% of capital`,
    `Leverage: ${decision.recommendedLeverage}x`,
    `Severity: ${decision.severity}`,
    ``,
    `Details: ${decision.reason}`,
  ];

  return lines.join("\n");
}