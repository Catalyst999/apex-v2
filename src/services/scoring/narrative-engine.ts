// src/services/scoring/narrative-engine.ts
// Catalyst Apex Trader v2.1 — Narrative Engine
//
// Tracks live market catalysts and boosts tokens that match active narratives.
// No Polymarket API needed — uses X social data + hardcoded watchlist.
//
// Narratives are tiered:
// TIER 1 (hot right now)    → +30 confidence boost, skip strict bundle check
// TIER 2 (building)        → +20 confidence boost
// TIER 3 (watch list)      → +10 confidence boost

import { scanNarrativeVelocity } from "../social/x-scanner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NarrativeMatch {
  matched:       boolean;
  narrativeName: string;
  tier:          1 | 2 | 3;
  confidenceBoost: number;
  skipBundleCheck: boolean;  // true for Tier 1 momentum plays
  reason:        string;
  keywords:      string[];
}

export interface NarrativeConfig {
  name:     string;
  keywords: string[];
  tier:     1 | 2 | 3;
}

// ─── Active Narrative Watchlist ───────────────────────────────────────────────
// Update this list as the market shifts.
// Keywords are matched against token name + symbol (case-insensitive).

const ACTIVE_NARRATIVES: NarrativeConfig[] = [
  // ── TIER 1: Currently Hot ─────────────────────────────────────────────────
  {
    name:     "SpaceX / Elon Space",
    keywords: ["spacex", "spcx", "spax", "elon", "rocket", "starship", "nasa", "space", "mars", "orbital"],
    tier:     1,
  },
  {
    name:     "AI / LLM Agents",
    keywords: ["deepseek", "grok", "claude", "gemini", "ai", "agent", "llm", "openai", "gpt", "robot", "agi", "eliza"],
    tier:     1,
  },
  {
    name:     "Celebrity / Sports",
    keywords: ["cr7", "ronaldo", "messi", "trump", "maga", "kanye", "taylor", "drake", "lebron", "nba", "nfl"],
    tier:     1,
  },

  // ── TIER 2: Building Momentum ─────────────────────────────────────────────
  {
    name:     "Cuba / Political",
    keywords: ["cuba", "havana", "castro", "cigar", "embargo", "pentagon", "geopolitical"],
    tier:     2,
  },
  {
    name:     "X Money / Twitter Finance",
    keywords: ["xmoney", "xpay", "twitter", "twitterpay", "xfi", "xbank"],
    tier:     2,
  },
  {
    name:     "Meme Animals",
    keywords: ["cat", "dog", "pepe", "frog", "doge", "shib", "inu", "bear", "bull", "ape", "monkey", "bird"],
    tier:     2,
  },
  {
    name:     "Gaming / Metaverse",
    keywords: ["game", "play", "pixel", "nft", "meta", "vr", "virtual", "world", "quest"],
    tier:     2,
  },

  // ── TIER 3: Watch List ────────────────────────────────────────────────────
  {
    name:     "DeFi / Finance",
    keywords: ["defi", "yield", "stake", "swap", "liquidity", "vault", "earn", "apy"],
    tier:     3,
  },
  {
    name:     "Music / Entertainment",
    keywords: ["music", "song", "beat", "rap", "hiphop", "concert", "festival", "movie", "film"],
    tier:     3,
  },
  {
    name:     "Food / Meme Culture",
    keywords: ["pizza", "burger", "taco", "noodle", "sushi", "ramen", "food", "eat", "cook"],
    tier:     3,
  },
];

// ─── Boost config per tier ────────────────────────────────────────────────────

const TIER_CONFIG = {
  1: { confidenceBoost: 30, skipBundleCheck: true  },
  2: { confidenceBoost: 20, skipBundleCheck: false },
  3: { confidenceBoost: 10, skipBundleCheck: false },
};

// ─── Main narrative matcher ───────────────────────────────────────────────────

export function matchNarrative(
  tokenName:   string,
  tokenSymbol: string,
): NarrativeMatch {
  const searchText = `${tokenName} ${tokenSymbol}`.toLowerCase();

  let bestMatch: NarrativeConfig | null = null;
  let matchedKeywords: string[]         = [];

  for (const narrative of ACTIVE_NARRATIVES) {
    const hits = narrative.keywords.filter((kw) => searchText.includes(kw));
    if (hits.length > 0) {
      // Prefer higher tier (lower number) matches
      if (!bestMatch || narrative.tier < bestMatch.tier) {
        bestMatch       = narrative;
        matchedKeywords = hits;
      }
    }
  }

  if (!bestMatch) {
    return {
      matched:         false,
      narrativeName:   "None",
      tier:            3,
      confidenceBoost: 0,
      skipBundleCheck: false,
      reason:          "No active narrative match",
      keywords:        [],
    };
  }

  const config = TIER_CONFIG[bestMatch.tier];

  return {
    matched:         true,
    narrativeName:   bestMatch.name,
    tier:            bestMatch.tier,
    confidenceBoost: config.confidenceBoost,
    skipBundleCheck: config.skipBundleCheck,
    reason:          `Tier ${bestMatch.tier} narrative: ${bestMatch.name} (matched: ${matchedKeywords.join(", ")})`,
    keywords:        matchedKeywords,
  };
}

// ─── Narrative velocity check (uses X scanner) ───────────────────────────────
// Checks if the narrative is currently trending on X/Twitter.
// Adds an extra +10 if the narrative has >20 tweets and velocity > 40.

export async function checkNarrativeVelocity(
  narrativeName: string,
  keywords:      string[],
): Promise<{ velocityBoost: number; tweetCount: number; isHot: boolean }> {
  try {
    // Use the primary keyword for the search
    const searchKeyword = keywords[0] ?? narrativeName.split(" ")[0];
    const velocity      = await scanNarrativeVelocity(searchKeyword);

    const isHot       = velocity.tweetCount >= 20 && velocity.velocity >= 40;
    const velocityBoost = isHot ? 10 : 0;

    return { velocityBoost, tweetCount: velocity.tweetCount, isHot };
  } catch {
    return { velocityBoost: 0, tweetCount: 0, isHot: false };
  }
}

// ─── Full narrative analysis (sync + async combined) ─────────────────────────

export async function analyzeNarrative(
  tokenName:   string,
  tokenSymbol: string,
): Promise<NarrativeMatch & { totalBoost: number; isHot: boolean }> {
  const match = matchNarrative(tokenName, tokenSymbol);

  if (!match.matched) {
    return { ...match, totalBoost: 0, isHot: false };
  }

  const velocity = await checkNarrativeVelocity(match.narrativeName, match.keywords);

  const totalBoost = match.confidenceBoost + velocity.velocityBoost;

  console.log(
    `   🎯 Narrative: ${match.narrativeName} | Tier ${match.tier} | Boost: +${totalBoost}${velocity.isHot ? " 🔥" : ""}`
  );

  return {
    ...match,
    totalBoost,
    isHot: velocity.isHot,
  };
}

// ─── Narrative summary for logging ───────────────────────────────────────────

export function narrativeSummary(match: NarrativeMatch): string {
  if (!match.matched) return "No narrative";
  return `${match.narrativeName} (T${match.tier}, +${match.confidenceBoost})`;
}
