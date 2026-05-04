// src/services/intelligence/emotion-modeler.ts
// Catalyst Apex Trader v3.0 — Emotion Modeler
//
// Crowd psychology phase detection.
// Understands the emotional lifecycle of a coin:
// - Euphoria → Panic → Exhaustion → Disbelief → Revenge Buying
// - Silent Accumulation → Fear → Distribution → Revival → Greed → Capitulation
//
// System asks: "What emotional phase is the crowd in RIGHT NOW?"
// Not: "Is price up or down?"

import { supabase } from "../../db/supabase";

// ─── Emotion Phases ───────────────────────────────────────────────────────

export type EmotionPhase =
  | "EUPHORIA"              // peak buying, all in, diamond hands narrative
  | "PANIC"                 // selling, FUD narrative, exit liquidity
  | "EXHAUSTION"            // no more sellers left, volume crashes
  | "DISBELIEF"             // price stabilizes, "is this real?"
  | "REVENGE_BUYING"        // FOMO return, "missed the dip", chasing
  | "SILENT_ACCUMULATION"   // whales buy quietly, low volume
  | "FEAR"                  // "top is in", distribution phase
  | "DISTRIBUTION"          // smart money exits, retail holding bags
  | "REVIVAL"               // narrative resurrection, second chance
  | "GREED"                 // euphoria round 2
  | "CAPITULATION"          // final panic, all hope gone
  | "DEAD"                  // no emotions left, coin is ded;

export interface EmotionSnapshot {
  timestamp:            number;
  token:                string;
  phase:                EmotionPhase;
  intensity:            number;        // 0-100, how strong is this emotion
  confidence:           number;        // 0-100, how sure are we
  triggers:             string[];      // what caused this phase
  holderSentiment:      number;        // -100 to +100 (bearish to bullish)
  volumeConviction:     number;        // buying conviction in current phase
  narrativeIntensity:   number;        // CT engagement level
  nextPhase?:           EmotionPhase;
  nextPhaseProbability: number;        // 0-100
  recommendedAction:    "ACCUMULATE" | "RIDE" | "REDUCE" | "EXIT" | "DEAD";
}

// ─── Phase Transition Logic ───────────────────────────────────────────────

export interface PhaseIndicators {
  priceChange:          number;        // % from local min/max
  volumeTrend:          number;        // accelerating or dying
  buySellRatio:         number;        // weighted buy vs sell
  holderChange:         number;        // holders increasing/decreasing
  narrativeVelocity:    number;        // CT engagement trend
  liquidityDrain:       number;        // liq being removed or added
  smartWalletActivity:  number;        // are smart wallets buying/selling
  timeInPhase:          number;        // how long in current phase (minutes)
}

export function detectEmotionPhase(
  indicators: PhaseIndicators,
  previousPhase: EmotionPhase,
  historicalContext: any,
): EmotionSnapshot {
  const timestamp = Math.floor(Date.now() / 1000);

  // ─── Phase Detection Logic ────────────────────────────────────────────

  let phase: EmotionPhase = previousPhase || "SILENT_ACCUMULATION";
  let intensity = 50;
  let confidence = 50;
  let triggers: string[] = [];

  // EUPHORIA: Price pumping, volume surging, all positive sentiment
  if (
    indicators.priceChange > 20 &&
    indicators.volumeTrend > 2 &&
    indicators.buySellRatio > 3 &&
    indicators.narrativeVelocity > 80
  ) {
    phase = "EUPHORIA";
    intensity = Math.min(100, 50 + indicators.priceChange / 2);
    confidence = Math.min(100, indicators.buySellRatio * 10);
    triggers = ["explosive_price_action", "volume_surge", "narrative_peak"];
  }
  // PANIC: Price dumping, volume spiking down, sellers overwhelming
  else if (
    indicators.priceChange < -15 &&
    indicators.buySellRatio < 0.3 &&
    indicators.volumeTrend > 1.5
  ) {
    phase = "PANIC";
    intensity = Math.min(100, Math.abs(indicators.priceChange) / 2);
    confidence = 90;
    triggers = ["sharp_dump", "sell_pressure", "exit_liquidity"];
  }
  // EXHAUSTION: Price crashed but volume died, no one selling anymore
  else if (
    indicators.priceChange < -10 &&
    indicators.volumeTrend < 0.5 &&
    indicators.buySellRatio > 1
  ) {
    phase = "EXHAUSTION";
    intensity = 40;
    confidence = 85;
    triggers = ["volume_death", "seller_exhaustion", "capitulation_complete"];
  }
  // DISBELIEF: Price recovered, low volume, "is this real?"
  else if (
    indicators.priceChange > 0 &&
    indicators.priceChange < 10 &&
    indicators.volumeTrend < 0.8 &&
    indicators.narrativeVelocity < 30
  ) {
    phase = "DISBELIEF";
    intensity = 30;
    confidence = 75;
    triggers = ["price_recovery", "low_conviction", "quiet_accumulation"];
  }
  // REVENGE BUYING: Price up moderately, volume increasing, FOMO narrative
  else if (
    indicators.priceChange > 10 &&
    indicators.priceChange < 30 &&
    indicators.buySellRatio > 2 &&
    indicators.narrativeVelocity > 60
  ) {
    phase = "REVENGE_BUYING";
    intensity = 75;
    confidence = 80;
    triggers = ["fomo_chasing", "narrative_revival", "volume_return"];
  }
  // SILENT ACCUMULATION: Low volume, price stable/slightly up, smart wallets buying
  else if (
    indicators.volumeTrend < 0.6 &&
    indicators.smartWalletActivity > 60 &&
    indicators.holderChange > 2 &&
    indicators.narrativeVelocity < 40
  ) {
    phase = "SILENT_ACCUMULATION";
    intensity = 30;
    confidence = 85;
    triggers = ["whale_buying", "low_volume", "holder_growth"];
  }
  // FEAR: Price declining, narrative shifting negative, distribution signals
  else if (
    indicators.priceChange < 0 &&
    indicators.priceChange > -15 &&
    indicators.narrativeVelocity < 20 &&
    indicators.smartWalletActivity < 30
  ) {
    phase = "FEAR";
    intensity = 60;
    confidence = 75;
    triggers = ["narrative_death", "distribution_phase", "whale_selling"];
  }
  // DISTRIBUTION: Volume concentrated in hands of few, retail holding
  else if (
    indicators.holderChange < 0 &&
    indicators.liquidityDrain > 1 &&
    indicators.buySellRatio < 1.2
  ) {
    phase = "DISTRIBUTION";
    intensity = 55;
    confidence = 80;
    triggers = ["liquidity_removal", "holder_decrease", "concentration"];
  }
  // REVIVAL: Narrative return, volume pickup, "second chance" story
  else if (
    indicators.narrativeVelocity > 50 &&
    indicators.volumeTrend > 1.2 &&
    indicators.holderChange > 1
  ) {
    phase = "REVIVAL";
    intensity = 70;
    confidence = 75;
    triggers = ["narrative_resurrection", "volume_return", "new_catalyst"];
  }
  // GREED: Strong FOMO, high conviction, retail all-in
  else if (
    indicators.priceChange > 30 &&
    indicators.narrativeVelocity > 85 &&
    indicators.buySellRatio > 4
  ) {
    phase = "GREED";
    intensity = 90;
    confidence = 85;
    triggers = ["extreme_fomo", "peak_narrative", "euphoria_2"];
  }
  // CAPITULATION: Final seller panic, volume explosion, hope gone
  else if (
    indicators.priceChange < -20 &&
    indicators.volumeTrend > 2 &&
    indicators.narrativeVelocity < 10 &&
    previousPhase !== "PANIC"
  ) {
    phase = "CAPITULATION";
    intensity = 95;
    confidence = 90;
    triggers = ["final_panic", "all_hope_gone", "retail_liquidation"];
  }

  // ─── Holder Sentiment ──────────────────────────────────────────────────

  let holderSentiment = 0;
  if (phase === "EUPHORIA" || phase === "GREED" || phase === "REVENGE_BUYING") {
    holderSentiment = 80;
  } else if (phase === "PANIC" || phase === "CAPITULATION" || phase === "FEAR") {
    holderSentiment = -80;
  } else if (phase === "SILENT_ACCUMULATION" || phase === "REVIVAL") {
    holderSentiment = 20;
  } else if (phase === "EXHAUSTION" || phase === "DISBELIEF") {
    holderSentiment = -10;
  }

  // ─── Volume Conviction ────────────────────────────────────────────────

  let volumeConviction = indicators.buySellRatio * 20; // scale to 0-100
  if (phase === "EUPHORIA" || phase === "GREED") volumeConviction = 90;
  if (phase === "PANIC" || phase === "CAPITULATION") volumeConviction = 10;
  if (phase === "SILENT_ACCUMULATION") volumeConviction = 40;

  // ─── Next Phase Prediction ────────────────────────────────────────────

  let nextPhase: EmotionPhase = "DEAD";
  let nextPhaseProbability = 0;

  const phaseTransitions: Record<EmotionPhase, [EmotionPhase, number]> = {
    EUPHORIA: ["PANIC", 85],
    PANIC: ["EXHAUSTION", 90],
    EXHAUSTION: ["DISBELIEF", 80],
    DISBELIEF: ["REVENGE_BUYING", 70],
    REVENGE_BUYING: ["EUPHORIA", 60],
    SILENT_ACCUMULATION: ["REVIVAL", 75],
    FEAR: ["DISTRIBUTION", 85],
    DISTRIBUTION: ["DEAD", 80],
    REVIVAL: ["GREED", 75],
    GREED: ["CAPITULATION", 80],
    CAPITULATION: ["SILENT_ACCUMULATION", 85],
    DEAD: ["DEAD", 100],
  };

  const [predictedNext, probability] = phaseTransitions[phase] || ["DEAD", 50];
  nextPhase = predictedNext;
  nextPhaseProbability = probability;

  // ─── Recommended Action ───────────────────────────────────────────────

  let recommendedAction: "ACCUMULATE" | "RIDE" | "REDUCE" | "EXIT" | "DEAD";
  switch (phase) {
    case "SILENT_ACCUMULATION":
    case "EXHAUSTION":
      recommendedAction = "ACCUMULATE";
      break;
    case "DISBELIEF":
    case "REVENGE_BUYING":
    case "REVIVAL":
      recommendedAction = "RIDE";
      break;
    case "EUPHORIA":
    case "GREED":
      recommendedAction = "REDUCE";
      break;
    case "FEAR":
    case "DISTRIBUTION":
    case "PANIC":
      recommendedAction = "EXIT";
      break;
    case "CAPITULATION":
    case "DEAD":
      recommendedAction = "DEAD";
      break;
    default:
      recommendedAction = "RIDE";
  }

  return {
    timestamp,
    token: historicalContext?.token || "UNKNOWN",
    phase,
    intensity,
    confidence,
    triggers,
    holderSentiment,
    volumeConviction,
    narrativeIntensity: indicators.narrativeVelocity,
    nextPhase,
    nextPhaseProbability,
    recommendedAction,
  };
}

// ─── Store Emotion Snapshots ──────────────────────────────────────────────

export async function recordEmotionSnapshot(
  snapshot: EmotionSnapshot,
  token: string,
): Promise<void> {
  try {
    await supabase.from("emotion_snapshots").insert({
      token,
      timestamp: snapshot.timestamp,
      phase: snapshot.phase,
      intensity: snapshot.intensity,
      confidence: snapshot.confidence,
      triggers: snapshot.triggers,
      holder_sentiment: snapshot.holderSentiment,
      volume_conviction: snapshot.volumeConviction,
      narrative_intensity: snapshot.narrativeIntensity,
      next_phase: snapshot.nextPhase,
      next_phase_probability: snapshot.nextPhaseProbability,
      recommended_action: snapshot.recommendedAction,
    });

    console.log(`💭 Emotion recorded: ${token} | ${snapshot.phase} (${snapshot.confidence}% conf)`);
  } catch (err: any) {
    console.error("❌ Emotion snapshot error:", err.message);
  }
}

// ─── Emotion History ──────────────────────────────────────────────────────

export async function getEmotionHistory(
  token: string,
  limit: number = 50,
): Promise<EmotionSnapshot[]> {
  try {
    const { data } = await supabase
      .from("emotion_snapshots")
      .select("*")
      .eq("token", token)
      .order("timestamp", { ascending: false })
      .limit(limit);

    return (data || []).map((row: any) => ({
      timestamp: row.timestamp,
      token: row.token,
      phase: row.phase,
      intensity: row.intensity,
      confidence: row.confidence,
      triggers: row.triggers,
      holderSentiment: row.holder_sentiment,
      volumeConviction: row.volume_conviction,
      narrativeIntensity: row.narrative_intensity,
      nextPhase: row.next_phase,
      nextPhaseProbability: row.next_phase_probability,
      recommendedAction: row.recommended_action,
    }));
  } catch (err: any) {
    console.error("❌ Emotion history error:", err.message);
    return [];
  }
}


