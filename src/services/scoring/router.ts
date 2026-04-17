import { RawPair } from "../scanner/dexscreener";
import { FullSecurityResult } from "../security";
import { ScoreBreakdown, scorePair } from "./confidence";
import { STRATEGY } from "../../core/config";
import { checkTradingWindow, checkOutlierWindow } from "./timing";

export type StrategyType = "outlier" | "standard" | "skip";

export interface RouterResult {
  strategy: StrategyType;
  score: ScoreBreakdown;
  reason: string;
  skipReason?: string;
}

export function routePair(
  pair: RawPair,
  security: FullSecurityResult
): RouterResult {
  const score = scorePair(pair, security);

  const now = Date.now();
  const ageMinutes = (now - pair.pairCreatedAt) / 1000 / 60;
  const volLiqRatio = score.details.volLiqRatio;
  const mcap = pair.marketCap ?? pair.fdv ?? 0;
  const priceChangeM5 = score.details.priceChangeM5;
  const buySellRatio = score.details.buySellRatio;

  // ── MCap ceiling (guide: don't buy near the top) ─────
  // Standard: under $500k, Outlier: under $150k
  const standardMcapOk = mcap === 0 || mcap <= 500_000;
  const outlierMcapOk = mcap === 0 || mcap <= 150_000;

  // ── Fake volume hard reject ───────────────────────────
  if (score.details.fakeVolumeFlag) {
    return {
      strategy: "skip",
      score,
      reason: "Fake volume detected",
      skipReason: "fake_volume",
    };
  }

  // ── Already dumping hard reject ───────────────────────
  if (priceChangeM5 < -15) {
    return {
      strategy: "skip",
      score,
      reason: `Price dumping ${priceChangeM5.toFixed(1)}% in 5m — skip`,
      skipReason: "dumping",
    };
  }

  // ── Heavy sell pressure reject ────────────────────────
  if (buySellRatio < 0.5 && score.details.sellCount > 10) {
    return {
      strategy: "skip",
      score,
      reason: `Heavy sell pressure — buy/sell ratio: ${buySellRatio.toFixed(2)}`,
      skipReason: "sell_pressure",
    };
  }

  // ── OUTLIER CHECK (runs first) ────────────────────────
  const outlierTiming = checkOutlierWindow();

  // Combo A — Early velocity (under 30 mins)
  const comboA = ageMinutes <= 30 && volLiqRatio >= 1.5;

  // Combo B — Late ignition (30-120 mins, higher threshold)
  const comboB = ageMinutes > 30 && ageMinutes <= 120 && volLiqRatio >= 3.0;

  // Combo C — Narrative rocket (any age, price pumping + volume)
  const comboC =
    score.narrative >= 10 &&
    volLiqRatio >= 2.0 &&
    priceChangeM5 >= 15;

  // Combo D — Smart money pattern (heavy accumulation)
  const comboD =
    buySellRatio >= 3 &&
    volLiqRatio >= 2.0 &&
    priceChangeM5 <= 50; // not already too late

  const isOutlier = comboA || comboB || comboC || comboD;

  if (isOutlier && outlierMcapOk) {
    // Outliers can bypass timing in dead/danger zones if velocity is extreme
    const extremeVelocity = volLiqRatio >= 5.0 || buySellRatio >= 5;
    if (outlierTiming.allowed || extremeVelocity) {
      const combo = comboA ? "A" : comboB ? "B" : comboC ? "C" : "D";
      return {
        strategy: "outlier",
        score,
        reason: `GEM HUNTER Combo ${combo} — Age: ${ageMinutes.toFixed(1)}m | Vol/Liq: ${volLiqRatio.toFixed(2)} | B/S: ${buySellRatio.toFixed(2)}`,
      };
    }
  }

  // ── STANDARD CHECK ────────────────────────────────────
  const standardTiming = checkTradingWindow();

  if (!standardTiming.allowed) {
    return {
      strategy: "skip",
      score,
      reason: `⏰ ${standardTiming.reason}`,
      skipReason: "bad_timing",
    };
  }

  if (score.total >= STRATEGY.standard.minConfidenceScore && standardMcapOk) {
    return {
      strategy: "standard",
      score,
      reason: `Confidence: ${score.total}/100 | MCap: $${mcap > 0 ? (mcap / 1000).toFixed(0) + "k" : "unknown"} — Standard strategy`,
    };
  }

  // ── SKIP ─────────────────────────────────────────────
  const skipReason = !standardMcapOk
    ? `MCap too high: $${(mcap / 1000).toFixed(0)}k`
    : `Score too low: ${score.total}/100`;

  return {
    strategy: "skip",
    score,
    reason: skipReason,
    skipReason: !standardMcapOk ? "mcap_ceiling" : "low_score",
  };
}