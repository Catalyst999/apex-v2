// src/services/scoring/confidence.ts

import { RawPair }           from "../scanner/dexscreener";
import { FullSecurityResult } from "../security";
import { analyzeChartShape, ChartAnalysis } from "./chart-reader";

export interface ScoreBreakdown {
  total:         number;
  safety:        number;
  liquidity:     number;
  momentum:      number;
  age:           number;
  narrative:     number;
  chart:         number;
  chartAnalysis: ChartAnalysis;
  details: {
    liquidityUsd:   number;
    volumeM5:       number;
    volLiqRatio:    number;
    ageMinutes:     number;
    priceUsd:       number;
    priceChangeM5:  number;
    buyCount:       number;
    sellCount:      number;
    buySellRatio:   number;
    fakeVolumeFlag: boolean;
    volMcapRatio:   number;
  };
}

// ─── Narrative detection ───────────────────────────────────────────────────────

function detectNarrative(name: string, symbol: string): string {
  const text = `${name} ${symbol}`.toLowerCase();
  if (/\b(trump|maga|biden|harris|potus|president|america|usa)\b/.test(text)) return "political";
  if (/\b(elon|musk|tesla|spacex|grok)\b/.test(text))                         return "elon";
  if (/\b(doge|shib|inu|dog|woof|puppy|doggo)\b/.test(text))                  return "dog";
  if (/\b(cat|kitty|meow|neko|kitten)\b/.test(text))                          return "cat";
  if (/\b(pepe|frog|rare|wojak|apu)\b/.test(text))                            return "pepe";
  if (/\b(ai|gpt|llm|neural|robot|agent)\b/.test(text))                       return "AI";
  if (/\b(moon|mars|space|galaxy|rocket)\b/.test(text))                       return "space";
  if (/\b(based|chad|giga|sigma|ape|degen)\b/.test(text))                     return "community";
  if (/\b(rave|crime|asteroid|disaster|news|viral|breaking)\b/.test(text))    return "event";
  return "meme";
}

// ─── Name quality penalty ─────────────────────────────────────────────────────

function nameQualityPenalty(name: string, symbol: string): number {
  const text = `${name} ${symbol}`.toLowerCase();
  let penalty = 0;
  const genericWords = ["token", "coin", "finance", "protocol", "swap", "inu2", "safe2"];
  if (genericWords.some((w) => text.includes(w))) penalty -= 8;
  const vowels = /[aeiou]/i;
  if (symbol.length > 4 && !vowels.test(symbol)) penalty -= 5;
  const genericSingleWords = ["fat", "him", "her", "big", "old", "new", "hot", "cool", "good", "bad"];
  if (genericSingleWords.includes(name.toLowerCase().trim())) penalty -= 10;
  return penalty;
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scorePair(pair: RawPair, security: FullSecurityResult): ScoreBreakdown {
  let safety = 0, liquidity = 0, momentum = 0, age = 0, narrative = 0;

  const now           = Date.now();
  const ageMinutes    = (now - pair.pairCreatedAt) / 1000 / 60;
  const liquidityUsd  = pair.liquidity?.usd    ?? 0;
  const volumeM5      = pair.volume?.m5        ?? 0;
  const volumeH24     = pair.volume?.h24       ?? 0;
  const mcap          = pair.marketCap ?? pair.fdv ?? 0;
  const volLiqRatio   = liquidityUsd > 0 ? volumeM5 / liquidityUsd : 0;
  const volMcapRatio  = mcap > 0 ? volumeM5 / mcap : 1;
  const priceUsd      = parseFloat(pair.priceUsd ?? "0");
  const priceChangeM5 = pair.priceChange?.m5   ?? 0;
  const buyCount      = pair.txns?.m5?.buys    ?? 0;
  const sellCount     = pair.txns?.m5?.sells   ?? 0;
  const buySellRatio  = sellCount > 0 ? buyCount / sellCount : buyCount;
  const fakeVolumeFlag = volLiqRatio > 50 || (volumeH24 > 100_000 && liquidityUsd < 3000);

  // ── Chart shape (runs first) ───────────────────────────────────────────────
  const chartAnalysis = analyzeChartShape(pair);
  const chart         = chartAnalysis.score;

  // ── Safety (30pts) ─────────────────────────────────────────────────────────
  if (security.mintAuthority   === null) safety += 15;
  if (security.freezeAuthority === null) safety += 10;
  if (!security.goplus.isHoneypot)       safety += 5;

  // ── Liquidity (20pts) ──────────────────────────────────────────────────────
  if      (liquidityUsd >= 50_000) liquidity += 20;
  else if (liquidityUsd >= 20_000) liquidity += 16;
  else if (liquidityUsd >= 10_000) liquidity += 12;
  else if (liquidityUsd >= 8_000)  liquidity += 8;

  // ── Momentum (20pts) ───────────────────────────────────────────────────────
  if      (volLiqRatio >= 2.0) momentum += 10;
  else if (volLiqRatio >= 1.5) momentum += 8;
  else if (volLiqRatio >= 1.0) momentum += 5;
  else if (volLiqRatio >= 0.5) momentum += 3;

  if      (buySellRatio >= 3)   momentum += 6;
  else if (buySellRatio >= 2)   momentum += 4;
  else if (buySellRatio >= 1.5) momentum += 3;
  else if (buySellRatio >= 1)   momentum += 1;

  if      (priceChangeM5 >= 10) momentum += 4;
  else if (priceChangeM5 >= 0)  momentum += 2;
  else if (priceChangeM5 >= -5) momentum += 1;
  else                          momentum -= 5;

  if (fakeVolumeFlag) momentum -= 10;

  if      (volMcapRatio >= 2.0) momentum += 3;
  else if (volMcapRatio >= 1.0) momentum += 1;

  // ── Age (15pts) ────────────────────────────────────────────────────────────
  if      (ageMinutes <= 10)  age += 15;
  else if (ageMinutes <= 30)  age += 12;
  else if (ageMinutes <= 60)  age += 8;
  else if (ageMinutes <= 120) age += 4;

  // ── Narrative (15pts) ──────────────────────────────────────────────────────
  const detectedNarrative   = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);
  const highValueNarratives = ["political", "elon", "dog", "cat", "pepe", "AI", "event"];
  const midValueNarratives  = ["space", "community"];

  if      (highValueNarratives.includes(detectedNarrative)) narrative += 12;
  else if (midValueNarratives.includes(detectedNarrative))  narrative += 7;
  else                                                       narrative += 3;

  if      (pair.baseToken.symbol.length <= 4) narrative += 3;
  else if (pair.baseToken.symbol.length <= 6) narrative += 1;

  narrative += nameQualityPenalty(pair.baseToken.name, pair.baseToken.symbol);
  narrative  = Math.min(15, Math.max(-10, narrative));

  // ── Total ─────────────────────────────────────────────────────────────────
  const total = Math.max(0, Math.min(100, safety + liquidity + momentum + age + narrative + chart));

  console.log(`   📊 Chart: ${chartAnalysis.shape} (${chart >= 0 ? "+" : ""}${chart}pts) — ${chartAnalysis.entryQuality}`);

  return {
    total, safety, liquidity, momentum, age, narrative, chart,
    chartAnalysis,
    details: {
      liquidityUsd, volumeM5, volLiqRatio, ageMinutes,
      priceUsd, priceChangeM5, buyCount, sellCount,
      buySellRatio, fakeVolumeFlag, volMcapRatio,
    },
  };
}