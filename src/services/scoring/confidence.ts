// src/services/scoring/confidence.ts

import { RawPair }           from "../scanner/dexscreener";
import { FullSecurityResult } from "../security";

export interface ScoreBreakdown {
  total:     number;
  safety:    number;
  liquidity: number;
  momentum:  number;
  age:       number;
  narrative: number;
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

// ─── Narrative detection — exact word matching only ───────────────────────────
// Uses word boundaries so "cat" doesn't match "catalyst" or "hoeification"
// and "ai" doesn't match "main" or "rain"

function detectNarrative(name: string, symbol: string): string {
  const text = `${name} ${symbol}`.toLowerCase();

  // Political
  if (/\b(trump|maga|biden|harris|potus|president|america|usa|political)\b/.test(text)) return "political";

  // Elon / Tesla
  if (/\b(elon|musk|tesla|spacex|grok|x\.com)\b/.test(text)) return "elon";

  // Dog coins
  if (/\b(doge|shib|inu|dog|woof|puppy|doggo|dogwif)\b/.test(text)) return "dog";

  // Cat coins
  if (/\b(cat|kitty|meow|neko|kitten|tabby)\b/.test(text)) return "cat";

  // Pepe / frog
  if (/\b(pepe|frog|rare|wojak|apu)\b/.test(text)) return "pepe";

  // AI — exact word only, not inside other words
  if (/\b(ai|gpt|llm|neural|robot|agent|artificial)\b/.test(text)) return "AI";

  // Space
  if (/\b(moon|mars|space|galaxy|rocket|nasa|alien|ufo)\b/.test(text)) return "space";

  // Gaming
  if (/\b(game|play|quest|hero|gamer|rpg|nft)\b/.test(text)) return "gaming";

  // Community / based
  if (/\b(based|chad|giga|sigma|alpha|ape|degen)\b/.test(text)) return "community";

  return "meme";
}

// ─── Name quality check ───────────────────────────────────────────────────────
// Returns a penalty score (0 = fine, negative = bad quality signal)

function nameQualityPenalty(name: string, symbol: string): number {
  const text = `${name} ${symbol}`.toLowerCase();
  let penalty = 0;

  // Generic/lazy names
  const genericWords = ["token", "coin", "finance", "protocol", "swap", "inu2", "safe2", "erc20"];
  if (genericWords.some((w) => text.includes(w))) penalty -= 8;

  // Random letter combinations (symbol has no vowels and is >4 chars = likely random)
  const vowels = /[aeiou]/i;
  if (symbol.length > 4 && !vowels.test(symbol)) penalty -= 5;

  // Name is just one word and very generic
  const genericSingleWords = ["fat", "him", "her", "big", "old", "new", "hot", "cool", "good", "bad"];
  const nameLower = name.toLowerCase().trim();
  if (genericSingleWords.includes(nameLower)) penalty -= 10;

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

  // ── Safety (30pts) ─────────────────────────────────────────────────────────
  if (security.mintAuthority   === null) safety += 15;
  if (security.freezeAuthority === null) safety += 10;
  if (!security.goplus.isHoneypot)       safety += 5;

  // ── Liquidity (20pts) ──────────────────────────────────────────────────────
  if      (liquidityUsd >= 50_000) liquidity += 20;
  else if (liquidityUsd >= 20_000) liquidity += 16;
  else if (liquidityUsd >= 10_000) liquidity += 12;
  else if (liquidityUsd >= 8_000)  liquidity += 8;

  // ── Momentum (25pts) ───────────────────────────────────────────────────────
  if      (volLiqRatio >= 2.0) momentum += 12;
  else if (volLiqRatio >= 1.5) momentum += 10;
  else if (volLiqRatio >= 1.0) momentum += 7;
  else if (volLiqRatio >= 0.5) momentum += 4;

  if      (buySellRatio >= 3)   momentum += 8;
  else if (buySellRatio >= 2)   momentum += 6;
  else if (buySellRatio >= 1.5) momentum += 4;
  else if (buySellRatio >= 1)   momentum += 2;

  if      (priceChangeM5 >= 10) momentum += 5;
  else if (priceChangeM5 >= 0)  momentum += 3;
  else if (priceChangeM5 >= -5) momentum += 1;
  else                          momentum -= 5;

  if (fakeVolumeFlag) momentum -= 10;

  // Vol/MCap bonus — high ratio = real organic buying
  if      (volMcapRatio >= 2.0) momentum += 5;
  else if (volMcapRatio >= 1.0) momentum += 3;

  // ── Age (15pts) ────────────────────────────────────────────────────────────
  if      (ageMinutes <= 10)  age += 15;
  else if (ageMinutes <= 30)  age += 12;
  else if (ageMinutes <= 60)  age += 8;
  else if (ageMinutes <= 120) age += 4;

  // ── Narrative (15pts) ──────────────────────────────────────────────────────
  const detectedNarrative = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);

  // High value narratives
  const highValueNarratives = ["political", "elon", "dog", "cat", "pepe", "AI"];
  const midValueNarratives  = ["space", "gaming", "community"];

  if      (highValueNarratives.includes(detectedNarrative)) narrative += 12;
  else if (midValueNarratives.includes(detectedNarrative))  narrative += 7;
  else                                                       narrative += 3; // generic meme

  // Short ticker bonus
  if      (pair.baseToken.symbol.length <= 4) narrative += 3;
  else if (pair.baseToken.symbol.length <= 6) narrative += 1;

  // Name quality penalty
  narrative += nameQualityPenalty(pair.baseToken.name, pair.baseToken.symbol);
  narrative  = Math.min(15, Math.max(-10, narrative));

  const total = Math.max(0, Math.min(100, safety + liquidity + momentum + age + narrative));

  return {
    total, safety, liquidity, momentum, age, narrative,
    details: {
      liquidityUsd, volumeM5, volLiqRatio, ageMinutes,
      priceUsd, priceChangeM5, buyCount, sellCount,
      buySellRatio, fakeVolumeFlag, volMcapRatio,
    },
  };
}