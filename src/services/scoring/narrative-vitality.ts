// src/services/scoring/narrative-vitality.ts
// Catalyst Apex Trader v2.1 — Narrative Vitality Scorer
//
// From the playbook:
// "A token can have a good narrative but the vitality is dead. Timing is of the essence."
// "Trump's shooter's name got posted today... it's all over the timeline = vitality + mindshare.
//  It's fresh news, less than a day old = early to vitality + virality + mindshare,
//  which means volume is expected."
//
// Vitality = narrative freshness × social momentum × mindshare spread
//
// A Tier 1 narrative from 3 days ago is worth far less than a Tier 3 from 3 hours ago.
// This scorer adjusts the narrative boost from narrative-engine.ts based on how
// alive and fresh the narrative actually is right now.

import { scanNarrativeVelocity } from "../social/x-scanner";
import { NarrativeMatch }        from "./narrative-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VitalityResult {
  score:          number;    // 0-100. 0 = dead narrative, 100 = exploding right now
  freshness:      "BREAKING" | "FRESH" | "ACTIVE" | "FADING" | "DEAD";
  adjustedBoost:  number;    // final boost to apply (replaces raw narrative tier boost)
  skipEntry:      boolean;   // true = narrative too dead, don't trade even if it matches
  reason:         string;
  tweetCount:     number;
  ageHours:       number;    // hours since narrative keyword first appeared in cache
}

// ─── Vitality cache ───────────────────────────────────────────────────────────
// Tracks when we first saw a narrative keyword trending.
// If it's been trending for > 48h without refresh, vitality decays.

const narrativeFirstSeen = new Map<string, number>(); // keyword → unix timestamp ms

function getAgeHours(keyword: string): number {
  const firstSeen = narrativeFirstSeen.get(keyword);
  if (!firstSeen) {
    narrativeFirstSeen.set(keyword, Date.now());
    return 0;
  }
  return (Date.now() - firstSeen) / 1000 / 3600;
}

// ─── Freshness classifier ─────────────────────────────────────────────────────

function classifyFreshness(
  ageHours:   number,
  tweetCount: number,
  velocity:   number,
): VitalityResult["freshness"] {
  // Breaking: < 6h old AND high tweet volume
  if (ageHours < 6 && tweetCount >= 20 && velocity >= 50) return "BREAKING";

  // Fresh: < 24h old with decent activity
  if (ageHours < 24 && tweetCount >= 10) return "FRESH";

  // Active: 24-48h old but still getting tweets
  if (ageHours < 48 && tweetCount >= 5) return "ACTIVE";

  // Fading: 48-72h old or low engagement
  if (ageHours < 72 && tweetCount >= 2) return "FADING";

  // Dead: > 72h or no tweets
  return "DEAD";
}

// ─── Vitality score calculator ────────────────────────────────────────────────

function calculateVitalityScore(
  freshness:  VitalityResult["freshness"],
  tweetCount: number,
  velocity:   number,
  ageHours:   number,
): number {
  // Base score from freshness
  const baseScores: Record<VitalityResult["freshness"], number> = {
    BREAKING: 90,
    FRESH:    70,
    ACTIVE:   45,
    FADING:   20,
    DEAD:     0,
  };

  let score = baseScores[freshness];

  // Bonus for high tweet velocity
  if (velocity >= 80)      score += 10;
  else if (velocity >= 50) score += 5;

  // Bonus for tweet count (more people = more mindshare)
  if (tweetCount >= 50)     score += 10;
  else if (tweetCount >= 20) score += 5;

  // Penalty for staleness within each bucket
  if (ageHours > 6  && freshness === "BREAKING") score -= 10;
  if (ageHours > 12 && freshness === "FRESH")    score -= 10;

  return Math.max(0, Math.min(100, score));
}

// ─── Adjusted boost calculator ────────────────────────────────────────────────
// Takes the raw narrative tier boost and scales it by vitality.

function adjustBoost(rawBoost: number, vitalityScore: number): number {
  if (vitalityScore >= 80) return rawBoost;                      // Full boost
  if (vitalityScore >= 60) return Math.floor(rawBoost * 0.75);   // 75% boost
  if (vitalityScore >= 40) return Math.floor(rawBoost * 0.50);   // Half boost
  if (vitalityScore >= 20) return Math.floor(rawBoost * 0.25);   // Quarter boost
  return 0;                                                       // Dead = no boost
}

// ─── Main vitality scorer ─────────────────────────────────────────────────────

export async function scoreNarrativeVitality(
  narrative: NarrativeMatch,
): Promise<VitalityResult> {
  // If no narrative match, return neutral
  if (!narrative.matched || narrative.keywords.length === 0) {
    return {
      score:         0,
      freshness:     "DEAD",
      adjustedBoost: 0,
      skipEntry:     false,
      reason:        "No narrative to score",
      tweetCount:    0,
      ageHours:      0,
    };
  }

  const keyword  = narrative.keywords[0];
  const ageHours = getAgeHours(keyword);

  try {
    // Check X/Twitter for current velocity
    const velocity = await scanNarrativeVelocity(keyword);

    const freshness     = classifyFreshness(ageHours, velocity.tweetCount, velocity.velocity);
    const vitalityScore = calculateVitalityScore(freshness, velocity.tweetCount, velocity.velocity, ageHours);
    const adjustedBoost = adjustBoost(narrative.confidenceBoost, vitalityScore);

    // Skip entry if narrative is dead, UNLESS it's Tier 1 with great momentum on-chain
    const skipEntry = freshness === "DEAD" && narrative.tier >= 2;

    const reason = freshness === "DEAD"
      ? `Narrative "${narrative.narrativeName}" is stale (${ageHours.toFixed(0)}h old, ${velocity.tweetCount} tweets) — skipping`
      : `${freshness}: "${narrative.narrativeName}" | ${ageHours.toFixed(1)}h old | ${velocity.tweetCount} tweets | vitality ${vitalityScore}/100`;

    console.log(`   📡 Vitality: ${freshness} | Score: ${vitalityScore}/100 | Boost: +${adjustedBoost}`);

    return {
      score:         vitalityScore,
      freshness,
      adjustedBoost,
      skipEntry,
      reason,
      tweetCount:    velocity.tweetCount,
      ageHours,
    };
  } catch {
    // If X scan fails, assume narrative is moderately alive (don't block the trade)
    const freshness = ageHours < 24 ? "FRESH" : ageHours < 48 ? "ACTIVE" : "FADING";
    return {
      score:         freshness === "FRESH" ? 60 : freshness === "ACTIVE" ? 40 : 20,
      freshness,
      adjustedBoost: Math.floor(narrative.confidenceBoost * 0.5),
      skipEntry:     false,
      reason:        `Vitality assumed (X scan unavailable): ${freshness}`,
      tweetCount:    0,
      ageHours,
    };
  }
}

// ─── Top-blast threshold ──────────────────────────────────────────────────────
// From playbook: "If you understand volume + narrative, you shouldn't be scared
// to top-blast from $300k market cap and above."
// Returns true if vitality is strong enough to justify buying an already-running token.

export function canTopBlast(
  vitality: VitalityResult,
  mcap:     number,
): boolean {
  // Breaking narrative = can buy up to $2M mcap
  if (vitality.freshness === "BREAKING" && mcap <= 2_000_000) return true;

  // Fresh narrative = can buy up to $500k mcap
  if (vitality.freshness === "FRESH" && mcap <= 500_000) return true;

  // Active but not fresh = only buy under $200k
  if (vitality.freshness === "ACTIVE" && mcap <= 200_000) return true;

  return false;
}