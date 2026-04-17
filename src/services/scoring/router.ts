// src/services/scoring/router.ts
// Catalyst Apex Trader v2.1 — Strategy Router

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
  const score       = scorePair(pair, security);
  const now         = Date.now();
  const ageMinutes  = (now - pair.pairCreatedAt) / 1000 / 60;
  const mcap        = pair.marketCap ?? pair.fdv ?? 0;
  const volLiqRatio = score.details.volLiqRatio;
  const bsr         = score.details.buySellRatio;
  const priceChangeM5 = score.details.priceChangeM5;
  const buyCount    = score.details.buyCount;
  const volMcapRatio = score.details.volMcapRatio;

  // Hard skip: score 0 means hard disqualified in confidence.ts
  if (score.total === 0) {
    return { strategy: "skip", score, reason: "Hard disqualified — MCap ceiling or insufficient buyers", skipReason: "hard_fail" };
  }

  // Hard skip: fake volume
  if (score.details.fakeVolumeFlag) {
    return { strategy: "skip", score, reason: "Fake volume detected", skipReason: "fake_volume" };
  }

  // Hard skip: active dumping
  if (priceChangeM5 < -15) {
    return { strategy: "skip", score, reason: `Price dumping ${priceChangeM5.toFixed(1)}% in 5m`, skipReason: "dumping" };
  }

  // Hard skip: heavy sell pressure with real volume
  if (bsr < 0.5 && score.details.sellCount > 10) {
    return { strategy: "skip", score, reason: `Heavy sell pressure — ratio: ${bsr.toFixed(2)}`, skipReason: "sell_pressure" };
  }

  // Hard skip: not enough real buyers
  if (buyCount < 5) {
    return { strategy: "skip", score, reason: `Only ${buyCount} buys in 5m — insufficient activity`, skipReason: "low_activity" };
  }

  // Hard skip: Vol/MCap too low — almost certainly bundled
  if (mcap > 0 && volMcapRatio < STRATEGY.scanner.minVolMcapRatio) {
    return { strategy: "skip", score, reason: `Vol/MCap ${(volMcapRatio * 100).toFixed(0)}% — below 80% threshold`, skipReason: "low_vol_mcap" };
  }

  const standardMcapOk = mcap === 0 || mcap <= 500_000;
  const outlierMcapOk  = mcap === 0 || mcap <= 150_000;

  // ── Outlier detection ─────────────────────────────────────────────────────
  // Four combos — but now require stronger confirmation signals

  // Combo A: Early velocity — young token, high vol/liq, strong buyers
  const comboA = ageMinutes <= 30 && volLiqRatio >= 1.5 && bsr >= 2 && buyCount >= 10;

  // Combo B: Late ignition — older token suddenly catching fire
  const comboB = ageMinutes > 30 && ageMinutes <= 120 && volLiqRatio >= 3.0 && bsr >= 2.5;

  // Combo C: Narrative rocket — clear narrative + strong momentum
  const comboC = score.narrative >= 8 && volLiqRatio >= 2.0 && priceChangeM5 >= 15 && buyCount >= 15;

  // Combo D: Smart money — exceptional buy pressure across the board
  const comboD = bsr >= 4 && volLiqRatio >= 2.0 && priceChangeM5 <= 50 && buyCount >= 20;

  const isOutlier      = comboA || comboB || comboC || comboD;
  const outlierTiming  = checkOutlierWindow();
  const extremeVelocity = volLiqRatio >= 5.0 || bsr >= 5;

  if (isOutlier && outlierMcapOk && (outlierTiming.allowed || extremeVelocity)) {
    const combo = comboA ? "A" : comboB ? "B" : comboC ? "C" : "D";
    return {
      strategy: "outlier",
      score,
      reason: `GEM HUNTER Combo ${combo} — Age: ${ageMinutes.toFixed(1)}m | Vol/Liq: ${volLiqRatio.toFixed(2)} | B/S: ${bsr.toFixed(2)} | Buys: ${buyCount}`,
    };
  }

  // ── Standard detection ────────────────────────────────────────────────────
  const standardTiming = checkTradingWindow();
  if (!standardTiming.allowed) {
    return { strategy: "skip", score, reason: `⏰ ${standardTiming.reason}`, skipReason: "bad_timing" };
  }

  // Raised minimum score from 55 to 70 for standard
  // Also require minimum buy activity and vol/mcap
  const standardMomentumOk = bsr >= 1.5 && buyCount >= 10 && volMcapRatio >= 0.8;

  if (score.total >= 70 && standardMcapOk && standardMomentumOk) {
    return {
      strategy: "standard",
      score,
      reason: `Confidence: ${score.total}/100 | MCap: $${mcap > 0 ? (mcap / 1000).toFixed(0) + "k" : "unknown"} | B/S: ${bsr.toFixed(2)} | Buys: ${buyCount}`,
    };
  }

  // Build skip reason
  const reasons: string[] = [];
  if (!standardMcapOk)                     reasons.push(`MCap too high: $${(mcap / 1000).toFixed(0)}k`);
  if (score.total < 70)                    reasons.push(`Score too low: ${score.total}/100`);
  if (!standardMomentumOk)                 reasons.push(`Momentum weak: B/S ${bsr.toFixed(2)}, ${buyCount} buys`);

  return {
    strategy:   "skip",
    score,
    reason:     reasons.join(" | "),
    skipReason: !standardMcapOk ? "mcap_ceiling" : score.total < 70 ? "low_score" : "weak_momentum",
  };
}