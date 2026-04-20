// src/services/scoring/chart-reader.ts
// Catalyst Apex Trader v2.1 — On-Chain Chart Shape Reader
//
// Reconstructs momentum shape from on-chain data:
// - Price change over m5, h1 timeframes
// - Buy/sell ratio and raw counts
// - Volume vs liquidity ratio
// - Volume acceleration (m5 pace vs h1)
//
// Used by: scoring engine (entry), position manager (exit)

export type ChartShape =
  | "ACCUMULATION"   // flat price, steady buying — BEST entry
  | "BREAKOUT"       // price accelerating with volume — good entry
  | "STAIRCASE"      // higher lows, healthy structure — hold
  | "FOMO"           // vertical spike — late entry danger
  | "DISTRIBUTION"   // price up but sells increasing — smart money exiting
  | "DUMP"           // falling price, sell dominant — avoid/exit
  | "FLAT"           // nothing happening — neutral
  | "UNKNOWN";       // insufficient data

export interface ChartAnalysis {
  shape:              ChartShape;
  score:              number;        // -20 to +20 added to confidence score
  entryQuality:       "EXCELLENT" | "GOOD" | "NEUTRAL" | "POOR" | "AVOID";
  exitSignal:         boolean;       // true = chart says exit now
  momentum:           "ACCELERATING" | "STEADY" | "DECELERATING" | "NONE";
  volumeAcceleration: number;        // >1 = volume picking up
  buyPressure:        number;        // 0-100 composite
  reason:             string;
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeChartShape(pair: any): ChartAnalysis {
  const priceM5  = pair.priceChange?.m5  ?? 0;
  const priceH1  = pair.priceChange?.h1  ?? 0;
  const buysM5   = pair.txns?.m5?.buys   ?? 0;
  const sellsM5  = pair.txns?.m5?.sells  ?? 0;
  const buysH1   = pair.txns?.h1?.buys   ?? 0;
  const sellsH1  = pair.txns?.h1?.sells  ?? 0;
  const volM5    = pair.volume?.m5       ?? 0;
  const volH1    = pair.volume?.h1       ?? 0;
  const liqUsd   = pair.liquidity?.usd   ?? 0;

  if (volM5 === 0 && volH1 === 0) {
    return {
      shape: "UNKNOWN", score: 0, entryQuality: "NEUTRAL",
      exitSignal: false, momentum: "NONE",
      volumeAcceleration: 0, buyPressure: 0,
      reason: "Insufficient volume data",
    };
  }

  // ── Derived metrics ────────────────────────────────────────────────────────

  const bsrM5 = sellsM5 > 0 ? buysM5 / sellsM5 : buysM5 > 0 ? 5 : 1;
  const bsrH1 = sellsH1 > 0 ? buysH1 / sellsH1 : buysH1 > 0 ? 5 : 1;
  const volLiqRatio        = liqUsd > 0 ? volM5 / liqUsd : 0;
  const volM5Pace          = volM5 * 12; // extrapolate m5 to 1h
  const volumeAcceleration = volH1 > 0 ? volM5Pace / volH1 : 1;

  // Buy pressure composite 0-100
  const bsrScore    = Math.min(40, (bsrM5 - 1) * 10);
  const priceScore  = priceM5 >= 0 ? Math.min(30, priceM5 * 0.5) : Math.max(-20, priceM5 * 0.3);
  const volAccScore = Math.min(30, (volumeAcceleration - 1) * 15);
  const buyPressure = Math.max(0, Math.min(100, 50 + bsrScore + priceScore + volAccScore));

  // ── Shape detection ────────────────────────────────────────────────────────

  let shape: ChartShape = "FLAT";

  if (priceM5 < -15 || (bsrM5 < 0.6 && sellsM5 > 10)) {
    shape = "DUMP";
  } else if (priceM5 >= 50 || (priceH1 >= 100 && priceM5 >= 20) || volLiqRatio >= 15) {
    shape = "FOMO";
  } else if (priceH1 >= 20 && bsrM5 < bsrH1 * 0.7 && bsrM5 < 1.2) {
    shape = "DISTRIBUTION";
  } else if (
    Math.abs(priceM5) <= 15 &&
    priceH1 >= -10 && priceH1 <= 40 &&
    bsrM5 >= 1.5 && buysM5 >= 10 &&
    volumeAcceleration >= 0.8
  ) {
    shape = "ACCUMULATION";
  } else if (
    priceM5 >= 10 && priceM5 < 50 &&
    volLiqRatio >= 1.0 &&
    bsrM5 >= 2 &&
    volumeAcceleration >= 1.2
  ) {
    shape = "BREAKOUT";
  } else if (
    priceH1 >= 20 && priceH1 <= 100 &&
    priceM5 >= 0 && priceM5 <= 30 &&
    bsrM5 >= 1.3 && bsrH1 >= 1.2
  ) {
    shape = "STAIRCASE";
  }

  // ── Score assignment ───────────────────────────────────────────────────────

  const shapeScores: Record<ChartShape, number> = {
    ACCUMULATION:  20,
    BREAKOUT:      15,
    STAIRCASE:     12,
    FLAT:           0,
    UNKNOWN:        0,
    FOMO:         -15,
    DISTRIBUTION: -12,
    DUMP:         -20,
  };

  const score = shapeScores[shape];

  // Exit signal — chart says get out now
  const exitSignal = shape === "DUMP" || shape === "DISTRIBUTION" || shape === "FOMO";

  // ── Entry quality ──────────────────────────────────────────────────────────

  let entryQuality: ChartAnalysis["entryQuality"];
  if      (score >= 15)  entryQuality = "EXCELLENT";
  else if (score >= 10)  entryQuality = "GOOD";
  else if (score >= 0)   entryQuality = "NEUTRAL";
  else if (score >= -10) entryQuality = "POOR";
  else                   entryQuality = "AVOID";

  // ── Momentum ───────────────────────────────────────────────────────────────

  let momentum: ChartAnalysis["momentum"];
  if      (volumeAcceleration >= 1.5) momentum = "ACCELERATING";
  else if (volumeAcceleration >= 0.8) momentum = "STEADY";
  else if (volumeAcceleration >= 0.3) momentum = "DECELERATING";
  else                                momentum = "NONE";

  // ── Reason ────────────────────────────────────────────────────────────────

  const reasons: Record<ChartShape, string> = {
    ACCUMULATION:  `Accumulation — price flat (${priceM5.toFixed(1)}% 5m), BSR ${bsrM5.toFixed(2)}, volume ${momentum.toLowerCase()}. Pre-pump setup.`,
    BREAKOUT:      `Breakout — price +${priceM5.toFixed(1)}% with ${buysM5} buys, BSR ${bsrM5.toFixed(2)}, vol/liq ${volLiqRatio.toFixed(2)}x.`,
    STAIRCASE:     `Staircase uptrend — +${priceH1.toFixed(1)}% h1, BSR ${bsrM5.toFixed(2)}, structure intact.`,
    FLAT:          `Flat — no clear momentum. Wait for direction.`,
    UNKNOWN:       `Insufficient data to read chart shape.`,
    FOMO:          `FOMO zone — price +${priceM5.toFixed(1)}% in 5m or vol/liq ${volLiqRatio.toFixed(2)}x. Likely late.`,
    DISTRIBUTION:  `Distribution — price up but BSR declining (${bsrM5.toFixed(2)} now vs ${bsrH1.toFixed(2)} h1). Smart money exiting.`,
    DUMP:          `Dump — price ${priceM5.toFixed(1)}% in 5m, BSR ${bsrM5.toFixed(2)}. Avoid.`,
  };

  return {
    shape, score, entryQuality, exitSignal,
    momentum, volumeAcceleration, buyPressure,
    reason: reasons[shape],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function shapeEmoji(shape: ChartShape): string {
  const emojis: Record<ChartShape, string> = {
    ACCUMULATION: "🟢", BREAKOUT: "🚀", STAIRCASE: "📈",
    FLAT: "➡️",         UNKNOWN:  "❓", FOMO:       "⚠️",
    DISTRIBUTION: "🔴", DUMP:     "💀",
  };
  return emojis[shape] ?? "❓";
}