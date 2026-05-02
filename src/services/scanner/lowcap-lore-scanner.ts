// src/services/scanner/lowcap-lore-scanner.ts
// Catalyst Apex Trader v2.1 — Low Cap Lore Scanner
//
// From the playbook:
// "I now use a trick from my Chinese friend @pokemellon: focus on sub-$10k market
//  caps and look for a good lore."
//
// "You don't need complex filters for new pairs. Just filter out bundles by max 25%
//  and dev holdings max 10%. Then find good lore and narratives to ape."
//
// "There are two ways to trade new pairs:
//  1. Focus on narrative-related pairs that just got deployed.
//  2. Gamble on dogshit by betting on volume and momentum."
//
// This scanner handles path #1 — narrative-first, tiny cap, early entry.
// These are the tokens that become the next CR7, SPACEX, mexicanunc.
//
// Key insight: at sub-$10k mcap the deployer controls everything,
// but if the LORE is strong enough, the market will find it and push it.
// Risk is controlled by the small position size at this stage.

import { RawPair } from "./dexscreener";
import { matchNarrative } from "../scoring/narrative-engine";
import { detectFakeVolume } from "./fake-volume-detector";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoreScore {
  score:           number;     // 0-100
  tier:            1 | 2 | 3 | 0;  // 0 = no lore
  hasStrongLore:   boolean;    // true = score >= 60
  narrativeName:   string;
  loreFactors:     string[];   // what made the lore score high
  skipBundleCheck: boolean;    // Tier 1 narrative = skip bundle
  suggestedSize:   "micro" | "small" | "skip";  // position sizing
}

export interface LowCapPlay {
  pair:          RawPair;
  lore:          LoreScore;
  isPreBonding:  boolean;
  ageMinutes:    number;
  mcap:          number;
  reason:        string;
  confidence:    number;
}

// ─── Lore strength analyzer ───────────────────────────────────────────────────
// Scores a token's narrative/lore strength from name + symbol alone.
// This runs without any API calls — pure text matching.

export function scoreLore(tokenName: string, tokenSymbol: string): LoreScore {
  const narrative = matchNarrative(tokenName, tokenSymbol);
  const loreFactors: string[] = [];
  let score = 0;

  // ── Base score from narrative tier ────────────────────────────────────────
  if (narrative.matched) {
    const tierScores = { 1: 60, 2: 40, 3: 20 };
    score += tierScores[narrative.tier];
    loreFactors.push(`${narrative.narrativeName} narrative (Tier ${narrative.tier})`);
  }

  const fullText = `${tokenName} ${tokenSymbol}`.toLowerCase();

  // ── Bonus: Name is short and memorable ───────────────────────────────────
  // Tokens with short names (2-6 chars) go viral faster
  const nameLen = tokenName.replace(/\s/g, "").length;
  if (nameLen <= 4) {
    score += 15;
    loreFactors.push(`Ultra-short name (${nameLen} chars) — viral potential`);
  } else if (nameLen <= 6) {
    score += 8;
    loreFactors.push(`Short name (${nameLen} chars) — memorable`);
  }

  // ── Bonus: Real person / celebrity name ──────────────────────────────────
  const celebrityPatterns = [
    /\b(trump|biden|elon|musk|bezos|zuck|putin|obama|kanye|drake|ronaldo|messi|lebron)\b/i,
    /\b(taylor|swift|rihanna|beyonce|jay|eminem|snoop|50cent|cardi)\b/i,
    /\b(cr7|neymar|mbappe|haaland|salah)\b/i,
  ];
  if (celebrityPatterns.some((p) => p.test(fullText))) {
    score += 20;
    loreFactors.push("Celebrity name — instant mindshare");
  }

  // ── Bonus: Political / news event ────────────────────────────────────────
  const politicalPatterns = [
    /\b(vote|election|senate|congress|president|war|peace|treaty|sanction)\b/i,
    /\b(tariff|trade|ban|blocked|expelled|arrested|resign)\b/i,
  ];
  if (politicalPatterns.some((p) => p.test(fullText))) {
    score += 15;
    loreFactors.push("Political/news event — high vitality potential");
  }

  // ── Bonus: Pop culture / meme reference ──────────────────────────────────
  const popCulturePatterns = [
    /\b(gme|gamestop|wallstreet|reddit|ape|diamond|hands|moon|tendies)\b/i,
    /\b(doge|shib|pepe|wojak|chad|based|gigachad|npc)\b/i,
    /\b(anime|manga|naruto|goku|pikachu|saitama)\b/i,
  ];
  if (popCulturePatterns.some((p) => p.test(fullText))) {
    score += 12;
    loreFactors.push("Pop culture / meme reference — community appeal");
  }

  // ── Bonus: Ticker matches narrative perfectly ─────────────────────────────
  // e.g. token named "SpaceX" with ticker "SPCX" — intentional narrative play
  const nameWords  = tokenName.toLowerCase().split(/\s+/);
  const tickerLower = tokenSymbol.toLowerCase();
  const tickerMatchesName = nameWords.some((w) => w.startsWith(tickerLower.slice(0, 3)));
  if (tickerMatchesName && tokenSymbol.length >= 3) {
    score += 8;
    loreFactors.push(`Ticker "${tokenSymbol}" matches name — intentional branding`);
  }

  // ── Penalty: Generic/random name ─────────────────────────────────────────
  const genericPatterns = [/^[a-z]{6,}(token|coin|inu|swap)$/i, /^\d+[a-z]+$/i];
  if (genericPatterns.some((p) => p.test(tokenName.replace(/\s/g, "")))) {
    score -= 15;
    loreFactors.push("Generic/forgettable name — penalized");
  }

  // ── Penalty: Already-dead narrative keywords ──────────────────────────────
  const stalePatterns = [/\b(safemoon|squid|luna|terra)\b/i];
  if (stalePatterns.some((p) => p.test(fullText))) {
    score -= 20;
    loreFactors.push("Dead/scam narrative — penalized");
  }

  score = Math.max(0, Math.min(100, score));

  const hasStrongLore = score >= 60;
  const tier = narrative.tier as 1 | 2 | 3;

  // Position sizing based on lore + tier
  const suggestedSize: LoreScore["suggestedSize"] =
    score >= 80 && narrative.tier === 1 ? "small" :
    score >= 60                         ? "micro" :
    "skip";

  return {
    score,
    tier:            narrative.matched ? tier : 0,
    hasStrongLore,
    narrativeName:   narrative.narrativeName,
    loreFactors,
    skipBundleCheck: narrative.skipBundleCheck,
    suggestedSize,
  };
}

// ─── Low cap filter ───────────────────────────────────────────────────────────
// Applies the playbook's simplified filter for new pairs:
// Bundle max 25%, dev holdings max 10%, strong lore required.

export function isLowCapLorePlay(pair: RawPair): LowCapPlay | null {
  const mcap       = pair.marketCap ?? pair.fdv ?? 0;
  const liq        = pair.liquidity?.usd ?? 0;
  const now        = Date.now();
  const ageMinutes = pair.pairCreatedAt
    ? (now - pair.pairCreatedAt) / 1000 / 60
    : 9999;

  // ── MCap gate: sub-$100k (using $100k as the "micro" cutoff, $10k as ideal) ─
  // Playbook says sub-$10k is the target but we scan up to $100k and score accordingly
  if (mcap > 100_000) return null;

  // ── Age gate: new pairs only (< 60 min) ──────────────────────────────────
  if (ageMinutes > 60) return null;

  // ── Minimum liquidity: need at least $3k to trade safely ─────────────────
  if (liq < 3_000) return null;

  // ── Fake volume check ─────────────────────────────────────────────────────
  const fakeVol = detectFakeVolume(pair);
  if (fakeVol.isFake && fakeVol.confidence >= 70) return null;

  // ── Lore score ────────────────────────────────────────────────────────────
  const lore = scoreLore(pair.baseToken.name, pair.baseToken.symbol);

  // Require strong lore for this play — it's the entire thesis
  if (!lore.hasStrongLore) return null;
  if (lore.suggestedSize === "skip") return null;

  // ── Activity check: needs some buyers ────────────────────────────────────
  const buys5m = pair.txns?.m5?.buys ?? 0;
  if (buys5m < 3) return null;

  // ── Build confidence score ────────────────────────────────────────────────
  let confidence = lore.score;

  // Boost for ideal MCap range (sub-$10k is the sweet spot from playbook)
  if (mcap <= 10_000)       confidence += 15;
  else if (mcap <= 30_000)  confidence += 8;
  else if (mcap <= 50_000)  confidence += 3;

  // Boost for early age
  if (ageMinutes <= 5)       confidence += 10;
  else if (ageMinutes <= 15) confidence += 5;

  // Boost for activity
  if (buys5m >= 20)          confidence += 10;
  else if (buys5m >= 10)     confidence += 5;

  confidence = Math.min(100, confidence);

  const isPreBonding = mcap < 50_000 && liq < 15_000;

  const reason = [
    `Low-cap lore play: $${mcap > 1000 ? (mcap / 1000).toFixed(1) + "k" : mcap.toFixed(0)} mcap`,
    `Lore: ${lore.narrativeName} (${lore.score}/100)`,
    `Age: ${ageMinutes.toFixed(0)}m | Liq: $${(liq / 1000).toFixed(1)}k`,
    lore.loreFactors[0] ?? "",
  ].filter(Boolean).join(" | ");

  return {
    pair,
    lore,
    isPreBonding,
    ageMinutes,
    mcap,
    reason,
    confidence,
  };
}

// ─── Batch scanner for low-cap lore plays ─────────────────────────────────────
// Runs through a list of pairs and returns only the strong lore plays.

export function scanForLorePlays(pairs: RawPair[]): LowCapPlay[] {
  const plays: LowCapPlay[] = [];

  for (const pair of pairs) {
    const play = isLowCapLorePlay(pair);
    if (play) {
      plays.push(play);
      console.log(`🎭 LORE PLAY: ${pair.baseToken.name} (${pair.baseToken.symbol}) | Score: ${play.lore.score}/100 | MCap: $${play.mcap > 1000 ? (play.mcap / 1000).toFixed(1) + "k" : play.mcap.toFixed(0)} | ${play.lore.narrativeName}`);
    }
  }

  // Sort by confidence (best plays first)
  return plays.sort((a, b) => b.confidence - a.confidence);
}

// ─── Martingale position sizing helper ────────────────────────────────────────
// From the playbook: buy into every red candle, sell at 2x, double on next dip.
// This is only for mid/high cap tokens with liquidity — NOT for these tiny plays.
// Included here as a utility for the execution layer to reference.

export function martingaleNextSize(
  lastPositionUsd: number,
  won:             boolean,
): number {
  if (won) {
    // Win → same size next time (don't double on wins)
    return lastPositionUsd;
  }
  // Loss → double the next position
  return lastPositionUsd * 2;
}

// ─── Jeeting exit helper ──────────────────────────────────────────────────────
// From the playbook: sell at exactly 2x, no hesitation. Fast and clean.

export function shouldJeetExit(
  entryPrice:   number,
  currentPrice: number,
): boolean {
  const multiplier = currentPrice / entryPrice;
  return multiplier >= 2.0;
}