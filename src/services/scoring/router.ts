import { RawPair } from "../scanner/dexscreener";
import { FullSecurityResult } from "../security";
import { ScoreBreakdown, scorePair } from "./confidence";
import { STRATEGY } from "../../core/config";

export type StrategyType = "outlier" | "standard" | "skip";

export interface RouterResult {
  strategy: StrategyType;
  score: ScoreBreakdown;
  reason: string;
}

export function routePair(
  pair: RawPair,
  security: FullSecurityResult
): RouterResult {
  const score = scorePair(pair, security);

  const now = Date.now();
  const ageMinutes = (now - pair.pairCreatedAt) / 1000 / 60;
  const volLiqRatio = score.details.volLiqRatio;

  // ── Outlier check (runs first) ───────────────────────────
  const isYoungEnough = ageMinutes <= STRATEGY.outlier.maxAgeMinutes;
  const hasVelocity = volLiqRatio >= STRATEGY.outlier.minVolLiqRatio;

  if (isYoungEnough && hasVelocity) {
    return {
      strategy: "outlier",
      score,
      reason: `Age: ${ageMinutes.toFixed(1)}min | Vol/Liq: ${volLiqRatio.toFixed(2)} — GEM HUNTER triggered`,
    };
  }

  // ── Standard check ───────────────────────────────────────
  if (score.total >= STRATEGY.standard.minConfidenceScore) {
    return {
      strategy: "standard",
      score,
      reason: `Confidence: ${score.total}/100 — Standard strategy`,
    };
  }

  // ── Skip ─────────────────────────────────────────────────
  return {
    strategy: "skip",
    score,
    reason: `Score too low: ${score.total}/100 — skipping`,
  };
}