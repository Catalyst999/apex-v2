// src/services/scoring/haiku.ts
// Catalyst Apex Trader v2.1 — Signal Generator
//
// Raised BUY thresholds significantly based on real signal quality data.
// Previous thresholds were letting through too much noise.

import { RawPair }        from "../scanner/dexscreener";
import { ScoreBreakdown } from "./confidence";

export interface HaikuResult {
  signal:     "BUY" | "WAIT" | "AVOID";
  brandScore: number;
  entry:      string;
  target:     string;
  stopLoss:   string;
  rugRisk:    number;
  reason:     string;
  narrative:  string;
}

// ─── Brand scorer ─────────────────────────────────────────────────────────────
// How memorable and marketable is this coin's name/ticker?

function calcBrandScore(name: string, symbol: string): number {
  let score = 40;  // start lower — earn it
  const n   = name.toLowerCase();
  const s   = symbol.toLowerCase();

  // Short memorable ticker
  if      (s.length <= 3) score += 20;
  else if (s.length <= 4) score += 15;
  else if (s.length <= 6) score += 5;

  // Strong narrative words
  const strongWords = ["doge", "pepe", "trump", "elon", "dog", "cat", "bonk", "wif", "pnut", "peanut"];
  for (const word of strongWords) {
    if (n.includes(word) || s.includes(word)) { score += 20; break; }
  }

  // Mid-tier narrative words
  const midWords = ["moon", "ape", "chad", "giga", "baby", "based", "ai", "frog", "wojak"];
  for (const word of midWords) {
    if (n.includes(word) || s.includes(word)) { score += 10; break; }
  }

  // Penalty for generic/boring names
  const genericWords = ["token", "coin", "finance", "protocol", "swap", "safe", "inu2"];
  for (const word of genericWords) {
    if (n.includes(word)) { score -= 15; break; }
  }

  // Penalty for long unmemorable names (>3 words)
  const wordCount = name.trim().split(/\s+/).length;
  if (wordCount > 3) score -= 10;

  return Math.min(100, Math.max(0, score));
}

// ─── Narrative detector ───────────────────────────────────────────────────────

function detectNarrative(name: string, symbol: string): string {
  const text = (name + " " + symbol).toLowerCase();
  if (/trump|maga|biden|harris|president|potus/.test(text))                    return "political";
  if (/\bdoge\b|dogecoin|\bdog\b|shib|inu\b|bonk|wif\b/.test(text))           return "dog";
  if (/\bcat\b|kitty|neko|meow/.test(text))                                    return "cat";
  if (/\bai\b|\bgpt\b|neural|robot\b|agent\b/.test(text))                      return "AI";
  if (/pepe|frog|\bwojak\b/.test(text))                                        return "pepe";
  if (/elon|musk|tesla|spacex/.test(text))                                     return "elon";
  if (/\bmoon\b|mars\b|space\b|galaxy/.test(text))                             return "space";
  if (/\bchad\b|based\b|giga\b/.test(text))                                    return "community";
  return "meme";
}

// ─── Main signal generator ────────────────────────────────────────────────────

export async function analyzeWithHaiku(
  pair:     RawPair,
  score:    ScoreBreakdown,
  strategy: string,
): Promise<HaikuResult> {
  const price      = parseFloat(pair.priceUsd ?? "0");
  const brandScore = calcBrandScore(pair.baseToken.name, pair.baseToken.symbol);
  const narrative  = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);
  const buyCount   = score.details.buyCount;
  const bsr        = score.details.buySellRatio;
  const volMcap    = score.details.volMcapRatio;

  let signal: "BUY" | "WAIT" | "AVOID" = "AVOID";
  let rugRisk = 60;

  if (strategy === "outlier") {
    // Outlier needs: brand score + momentum confirmation
    // Raised from 65 to 72 — only take high-conviction outlier plays
    const momentumOk = bsr >= 2.5 && buyCount >= 10 && volMcap >= 0.8;
    if (brandScore >= 72 && momentumOk) {
      signal  = "BUY";
      rugRisk = 35;
    } else if (brandScore >= 60 || momentumOk) {
      signal  = "WAIT";
      rugRisk = 45;
    } else {
      signal  = "AVOID";
      rugRisk = 65;
    }

  } else if (strategy === "standard") {
    // Standard needs high score AND real momentum
    // Raised minimum from 55 to 72 — cuts most of the current trash
    const strongMomentum = bsr >= 2 && buyCount >= 15 && volMcap >= 0.8;
    const veryStrong     = bsr >= 3 && buyCount >= 20 && volMcap >= 1.0;

    if (score.total >= 78 && strongMomentum) {
      signal  = "BUY";
      rugRisk = Math.max(15, 100 - score.total);
    } else if (score.total >= 72 && veryStrong) {
      // Lower score but exceptional momentum — still qualifies
      signal  = "BUY";
      rugRisk = Math.max(20, 100 - score.total);
    } else if (score.total >= 65) {
      signal  = "WAIT";
      rugRisk = Math.max(25, 100 - score.total);
    } else {
      signal  = "AVOID";
      rugRisk = Math.max(40, 100 - score.total);
    }
  }

  const entry    = price;
  const target   = price * 2;
  const stopLoss = price * 0.7;

  const reason =
    signal === "BUY"
      ? `${narrative} narrative | Score ${score.total}/100 | B/S ratio ${bsr.toFixed(1)} | ${buyCount} buys in 5m | Vol/MCap ${(volMcap * 100).toFixed(0)}%`
      : signal === "WAIT"
      ? `Watching — momentum building but needs confirmation. Score ${score.total}/100 | B/S ${bsr.toFixed(1)}`
      : `Below threshold. Score ${score.total}/100 — insufficient momentum for entry.`;

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