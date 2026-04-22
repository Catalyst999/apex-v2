// src/services/scoring/router.ts
// v2.1 — Age-agnostic routing. Chart shape is the primary gate.

import { RawPair }            from "../scanner/dexscreener";
import { FullSecurityResult } from "../security";
import { ScoreBreakdown, scorePair } from "./confidence";
import { STRATEGY }           from "../../core/config";
import { checkTradingWindow, checkOutlierWindow } from "./timing";

export type StrategyType = "outlier" | "standard" | "skip";

export interface RouterResult {
  strategy:    StrategyType;
  score:       ScoreBreakdown;
  reason:      string;
  skipReason?: string;
}

export function routePair(pair: RawPair, security: FullSecurityResult): RouterResult {
  const score         = scorePair(pair, security);
  const now           = Date.now();
  const ageMinutes    = pair.pairCreatedAt
    ? (now - pair.pairCreatedAt) / 1000 / 60
    : 9999;
  const mcap          = pair.marketCap ?? pair.fdv ?? 0;
  const volLiqRatio   = score.details.volLiqRatio;
  const bsr           = score.details.buySellRatio;
  const priceChangeM5 = score.details.priceChangeM5;
  const buyCount      = score.details.buyCount;
  const chart         = score.chartAnalysis;

  // ── Hard skips ─────────────────────────────────────────────────────────────

  if (score.total === 0) {
    return { strategy: "skip", score, reason: "Hard disqualified", skipReason: "hard_fail" };
  }

  if (score.details.fakeVolumeFlag) {
    return { strategy: "skip", score, reason: "Fake volume detected", skipReason: "fake_volume" };
  }

  // DUMP chart shape = hard reject regardless of score
  if (chart.shape === "DUMP") {
    return { strategy: "skip", score, reason: `Chart: DUMP pattern — price ${priceChangeM5.toFixed(1)}% in 5m`, skipReason: "chart_dump" };
  }

  if (priceChangeM5 < -15) {
    return { strategy: "skip", score, reason: `Price dumping ${priceChangeM5.toFixed(1)}% in 5m`, skipReason: "dumping" };
  }

  if (bsr < 0.5 && score.details.sellCount > 10) {
    return { strategy: "skip", score, reason: `Heavy sell pressure — ratio: ${bsr.toFixed(2)}`, skipReason: "sell_pressure" };
  }

  if (buyCount < 5) {
    return { strategy: "skip", score, reason: `Only ${buyCount} buys in 5m`, skipReason: "low_activity" };
  }

  const standardMcapOk = mcap === 0 || mcap <= 10_000_000;
  const outlierMcapOk  = mcap === 0 || mcap <= 500_000;

  // ── Outlier detection ──────────────────────────────────────────────────────
  // Chart-driven combos — age is just one factor now, not a gate

  // Combo A: Fresh token with velocity (new launch play)
  const comboA = ageMinutes <= 30 && volLiqRatio >= 1.5 && bsr >= 2 && buyCount >= 10;

  // Combo B: Late ignition (established token waking up)
  const comboB = ageMinutes > 30 && volLiqRatio >= 3.0 && bsr >= 2.5;

  // Combo C: Narrative rocket — strong narrative + price moving
  const comboC = score.narrative >= 8 && volLiqRatio >= 2.0 && priceChangeM5 >= 15 && buyCount >= 15;

  // Combo D: Smart money pattern — exceptional buy pressure
  const comboD = bsr >= 4 && volLiqRatio >= 2.0 && priceChangeM5 <= 50 && buyCount >= 20;

  // Combo E: Chart accumulation breakout — any age, perfect chart setup
  // This is the new combo that catches established tokens setting up
  const comboE = (chart.shape === "ACCUMULATION" || chart.shape === "BREAKOUT") &&
                 chart.entryQuality === "EXCELLENT" &&
                 bsr >= 1.5 &&
                 buyCount >= 15;

  // Combo F: Veteran token recovery — 7+ days old, was dead, now showing life
  const comboF = ageMinutes > 10080 && // 7+ days old
                 volLiqRatio >= 2.0 &&
                 bsr >= 2 &&
                 (chart.shape === "ACCUMULATION" || chart.shape === "BREAKOUT") &&
                 priceChangeM5 >= 5;

  const isOutlier       = comboA || comboB || comboC || comboD || comboE || comboF;
  const outlierTiming   = checkOutlierWindow();
  const extremeVelocity = volLiqRatio >= 5.0 || bsr >= 5;

  if (isOutlier && outlierMcapOk && (outlierTiming.allowed || extremeVelocity)) {
    const combo = comboA ? "A" : comboB ? "B" : comboC ? "C" : comboD ? "D" : comboE ? "E" : "F";
    const ageStr = ageMinutes < 60
      ? `${ageMinutes.toFixed(0)}m`
      : `${(ageMinutes / 60).toFixed(0)}h`;
    return {
      strategy: "outlier",
      score,
      reason: `GEM HUNTER Combo ${combo} — Age: ${ageStr} | Chart: ${chart.shape} | Vol/Liq: ${volLiqRatio.toFixed(2)} | B/S: ${bsr.toFixed(2)}`,
    };
  }

  // ── Standard detection ─────────────────────────────────────────────────────
  const standardTiming = checkTradingWindow();
  if (!standardTiming.allowed) {
    return { strategy: "skip", score, reason: `⏰ ${standardTiming.reason}`, skipReason: "bad_timing" };
  }

  // Standard: score >= 70, good momentum, chart not in danger zone
  const chartOk         = chart.shape !== "FOMO" && chart.shape !== "DISTRIBUTION";
  const standardMomentumOk = bsr >= 1.5 && buyCount >= 10 && chartOk;

  if (score.total >= 70 && standardMcapOk && standardMomentumOk) {
    const ageStr = ageMinutes < 60
      ? `${ageMinutes.toFixed(0)}m`
      : `${(ageMinutes / 60).toFixed(1)}h`;
    return {
      strategy: "standard",
      score,
      reason: `Score: ${score.total}/100 | Chart: ${chart.shape} | MCap: $${mcap > 0 ? (mcap / 1000).toFixed(0) + "k" : "?"} | Age: ${ageStr}`,
    };
  }

  // Build skip reason
  const reasons: string[] = [];
  if (!standardMcapOk)    reasons.push(`MCap too high: $${(mcap / 1_000_000).toFixed(2)}M`);
  if (score.total < 70)   reasons.push(`Score too low: ${score.total}/100`);
  if (!chartOk)           reasons.push(`Chart: ${chart.shape} — avoid entry`);
  if (!standardMomentumOk && chartOk) reasons.push(`Momentum weak: B/S ${bsr.toFixed(2)}, ${buyCount} buys`);

  return {
    strategy:   "skip",
    score,
    reason:     reasons.join(" | "),
    skipReason: !standardMcapOk ? "mcap_ceiling" : score.total < 70 ? "low_score" : "weak_momentum",
  };
}