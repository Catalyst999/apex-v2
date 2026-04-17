// src/services/scoring/haiku.ts
// Rule-based signal engine.
// Swap analyzeWithHaiku body for real Claude Haiku when API credits are funded.

import { RawPair }        from "../scanner/dexscreener";
import { ScoreBreakdown } from "./confidence";

export interface HaikuResult {
  signal:    "BUY" | "WAIT" | "AVOID";
  brandScore: number;
  entry:     string;
  target:    string;
  stopLoss:  string;
  rugRisk:   number;
  reason:    string;
  narrative: string;
}

// ─── Brand score ──────────────────────────────────────────────────────────────
function calcBrandScore(name: string, symbol: string): number {
  let score = 40; // start lower — earn it
  const n = name.toLowerCase();
  const s = symbol.toLowerCase();

  // Short memorable ticker
  if      (s.length <= 3) score += 20;
  else if (s.length <= 4) score += 12;
  else if (s.length <= 6) score += 5;

  // Strong narrative keywords — exact word match only
  const strongWords = ["trump", "elon", "maga", "doge", "pepe", "ai", "dog", "cat",
                       "based", "chad", "giga", "moon", "ape", "wojak", "pnut", "peanut"];
  for (const word of strongWords) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(n) || regex.test(s)) { score += 20; break; }
  }

  // Generic word penalty
  const genericWords = ["token", "coin", "finance", "protocol", "swap"];
  for (const word of genericWords) {
    if (n.includes(word)) { score -= 15; break; }
  }

  // Single generic word name penalty
  const genericNames = ["fat", "him", "her", "big", "old", "new", "hot", "cool", "good", "bad", "baba", "hopu"];
  if (genericNames.includes(n.trim())) score -= 20;

  return Math.min(100, Math.max(0, score));
}

function detectNarrative(name: string, symbol: string): string {
  const text = `${name} ${symbol}`.toLowerCase();
  if (/\b(trump|maga|biden|harris|potus|president|america)\b/.test(text)) return "political";
  if (/\b(elon|musk|tesla|spacex|grok)\b/.test(text))                     return "elon";
  if (/\b(doge|shib|inu|dog|woof|puppy|doggo)\b/.test(text))              return "dog";
  if (/\b(cat|kitty|meow|neko|kitten)\b/.test(text))                      return "cat";
  if (/\b(pepe|frog|rare|wojak|apu)\b/.test(text))                        return "pepe";
  if (/\b(ai|gpt|llm|neural|robot|agent)\b/.test(text))                   return "AI";
  if (/\b(moon|mars|space|galaxy|rocket)\b/.test(text))                   return "space";
  if (/\b(based|chad|giga|sigma|ape|degen)\b/.test(text))                 return "community";
  return "meme";
}

// ─── Main signal engine ───────────────────────────────────────────────────────
// Raised thresholds based on data analysis:
// - Outlier BUY: score >= 75 AND brandScore >= 65 (was 65/65)
// - Standard BUY: score >= 80 (was 75)
// - WAIT: score >= 70 for outlier, >= 72 for standard
// - Everything else: AVOID

export async function analyzeWithHaiku(
  pair:     RawPair,
  score:    ScoreBreakdown,
  strategy: string,
): Promise<HaikuResult> {
  const price      = parseFloat(pair.priceUsd ?? "0");
  const brandScore = calcBrandScore(pair.baseToken.name, pair.baseToken.symbol);
  const narrative  = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);

  let signal:  "BUY" | "WAIT" | "AVOID" = "AVOID";
  let rugRisk  = 50;

  if (strategy === "outlier") {
    // Outlier needs both high score AND strong brand
    if      (score.total >= 75 && brandScore >= 65) { signal = "BUY";   rugRisk = 35; }
    else if (score.total >= 70)                     { signal = "WAIT";  rugRisk = 45; }
    else                                            { signal = "AVOID"; rugRisk = 65; }
  } else if (strategy === "standard") {
    // Standard needs higher confidence score
    if      (score.total >= 80) { signal = "BUY";   rugRisk = Math.max(10, 100 - score.total); }
    else if (score.total >= 72) { signal = "WAIT";  rugRisk = Math.max(20, 110 - score.total); }
    else                        { signal = "AVOID"; rugRisk = Math.max(30, 120 - score.total); }
  }

  // Hard block: if brand score is very low, never BUY regardless of other scores
  if (brandScore < 40 && signal === "BUY") {
    signal  = "WAIT";
    rugRisk = Math.min(rugRisk + 15, 90);
  }

  const entry    = price;
  const target   = price * 2;
  const stopLoss = price * 0.7;

  const reason =
    signal === "BUY"
      ? `${narrative} narrative, score ${score.total}/100, brand ${brandScore}/100. Vol/Liq ${score.details.volLiqRatio.toFixed(2)}x confirms momentum.`
      : signal === "WAIT"
      ? `Decent setup but needs confirmation. Score ${score.total}/100, brand ${brandScore}/100 — watch for volume spike.`
      : `Low confidence — score ${score.total}/100, brand ${brandScore}/100. Risk too high.`;

  return {
    signal,
    brandScore,
    entry:    `$${entry.toFixed(10)}`,
    target:   `$${target.toFixed(10)}`,
    stopLoss: `$${stopLoss.toFixed(10)}`,
    rugRisk,
    reason,
    narrative,
  };
}