// src/services/scoring/confidence.ts

import { RawPair }            from "../scanner/dexscreener";
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
    volMcapRatio:   number;
    ageMinutes:     number;
    priceUsd:       number;
    priceChangeM5:  number;
    buyCount:       number;
    sellCount:      number;
    buySellRatio:   number;
    fakeVolumeFlag: boolean;
    mcap:           number;
  };
}

// ─── Narrative detector ───────────────────────────────────────────────────────
// Precise matching only — no false positives like MLGA = AI
// Returns the narrative label and a score bonus

interface NarrativeMatch {
  label: string;
  bonus: number;
}

function detectNarrative(name: string, symbol: string): NarrativeMatch {
  const text = (name + " " + symbol).toLowerCase();

  // Political — must have explicit political keywords
  if (/trump|maga|biden|harris|president|potus|america\b|usa\b/.test(text))
    return { label: "political", bonus: 10 };

  // Elon / Tesla / SpaceX
  if (/elon|musk|tesla|spacex|grok/.test(text))
    return { label: "elon", bonus: 10 };

  // Dog coins — most reliable memecoin narrative
  if (/\bdoge\b|dogecoin|\bdog\b|shib|inu\b|woof|puppy|bonk|wif\b/.test(text))
    return { label: "dog", bonus: 10 };

  // Cat coins
  if (/\bcat\b|kitty|neko|meow|feline/.test(text))
    return { label: "cat", bonus: 8 };

  // Pepe / frog
  if (/pepe|frog|\bwojak\b/.test(text))
    return { label: "pepe", bonus: 9 };

  // AI — must have explicit AI keywords, not just contain "ai" as substring
  if (/\bai\b|artificial intelligence|\bgpt\b|neural|robot\b|agent\b/.test(text))
    return { label: "AI", bonus: 8 };

  // Space / moon
  if (/\bmoon\b|mars\b|galaxy|space\b|lunar/.test(text))
    return { label: "space", bonus: 6 };

  // Community / chad / based
  if (/\bchad\b|based\b|giga\b|sigma\b/.test(text))
    return { label: "community", bonus: 6 };

  // Generic meme — no specific narrative, small bonus
  return { label: "meme", bonus: 2 };
}

// ─── Generic name penalty ─────────────────────────────────────────────────────
// Penalise coins with names that are too generic to attract organic attention

function getGenericPenalty(name: string, symbol: string): number {
  const text = (name + " " + symbol).toLowerCase();

  // Explicit scam/copy indicators
  if (/^(dog|cat|doge|pepe|meme|moon|chad|coin|token)$/.test(text.trim()))
    return -8;  // single generic word as entire name

  // Finance/protocol words = utility pretender = lower memecoin appeal
  if (/\b(finance|protocol|swap|defi|yield|vault|staking)\b/.test(text))
    return -5;

  // "2", "v2", "classic", "inu2" = copy of a copy
  if (/v2\b|classic\b|inu2|2\.0|\bfork\b/.test(text))
    return -8;

  return 0;
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function scorePair(pair: RawPair, security: FullSecurityResult): ScoreBreakdown {
  let safety = 0, liquidity = 0, momentum = 0, age = 0, narrative = 0;

  const now           = Date.now();
  const ageMinutes    = (now - pair.pairCreatedAt) / 1000 / 60;
  const liquidityUsd  = pair.liquidity?.usd     ?? 0;
  const volumeM5      = pair.volume?.m5         ?? 0;
  const volumeH24     = pair.volume?.h24        ?? 0;
  const mcap          = pair.marketCap ?? pair.fdv ?? 0;
  const volLiqRatio   = liquidityUsd > 0 ? volumeM5 / liquidityUsd : 0;
  const volMcapRatio  = mcap > 0 ? volumeM5 / mcap : 1;
  const priceUsd      = parseFloat(pair.priceUsd ?? "0");
  const priceChangeM5 = pair.priceChange?.m5    ?? 0;
  const buyCount      = pair.txns?.m5?.buys     ?? 0;
  const sellCount     = pair.txns?.m5?.sells    ?? 0;
  const buySellRatio  = sellCount > 0 ? buyCount / sellCount : buyCount;

  // Fake volume detection
  const fakeVolumeFlag = volLiqRatio > 50 || (volumeH24 > 100_000 && liquidityUsd < 3000);

  // ── Hard disqualifiers — return 0 immediately ─────────────────────────────

  // Established coins — real DOGE/BONK etc have MCap in billions, skip them
  if (mcap > 500_000) {
    return {
      total: 0, safety: 0, liquidity: 0, momentum: 0, age: 0, narrative: 0,
      details: { liquidityUsd, volumeM5, volLiqRatio, volMcapRatio, ageMinutes, priceUsd, priceChangeM5, buyCount, sellCount, buySellRatio, fakeVolumeFlag, mcap },
    };
  }

  // Not enough real buyer activity — minimum 5 buys in last 5 minutes
  if (buyCount < 5) {
    return {
      total: 0, safety: 0, liquidity: 0, momentum: 0, age: 0, narrative: 0,
      details: { liquidityUsd, volumeM5, volLiqRatio, volMcapRatio, ageMinutes, priceUsd, priceChangeM5, buyCount, sellCount, buySellRatio, fakeVolumeFlag, mcap },
    };
  }

  // ── Safety (30pts) ────────────────────────────────────────────────────────
  if (security.mintAuthority   === null) safety += 15;
  if (security.freezeAuthority === null) safety += 10;
  if (!security.goplus.isHoneypot)       safety += 5;

  // ── Liquidity (20pts) ─────────────────────────────────────────────────────
  if      (liquidityUsd >= 50_000) liquidity += 20;
  else if (liquidityUsd >= 20_000) liquidity += 16;
  else if (liquidityUsd >= 10_000) liquidity += 12;
  else if (liquidityUsd >= 8_000)  liquidity += 8;

  // ── Momentum (25pts) ──────────────────────────────────────────────────────

  // Vol/Liq ratio
  if      (volLiqRatio >= 2.0) momentum += 10;
  else if (volLiqRatio >= 1.5) momentum += 8;
  else if (volLiqRatio >= 1.0) momentum += 5;
  else if (volLiqRatio >= 0.5) momentum += 2;

  // Buy/sell ratio — most important momentum signal
  if      (buySellRatio >= 4)   momentum += 10;
  else if (buySellRatio >= 3)   momentum += 8;
  else if (buySellRatio >= 2)   momentum += 5;
  else if (buySellRatio >= 1.5) momentum += 3;
  else if (buySellRatio >= 1)   momentum += 1;

  // Price direction
  if      (priceChangeM5 >= 15) momentum += 5;
  else if (priceChangeM5 >= 5)  momentum += 3;
  else if (priceChangeM5 >= 0)  momentum += 1;
  else if (priceChangeM5 >= -5) momentum -= 2;
  else                          momentum -= 8;

  // Fake volume penalty
  if (fakeVolumeFlag) momentum -= 12;

  // Vol/MCap bonus — real buying vs controlled supply
  if      (volMcapRatio >= 3.0) momentum += 5;
  else if (volMcapRatio >= 1.5) momentum += 3;
  else if (volMcapRatio >= 0.8) momentum += 1;

  // Minimum buy activity bonus — more real buyers = better
  if      (buyCount >= 30) momentum += 5;
  else if (buyCount >= 15) momentum += 3;
  else if (buyCount >= 10) momentum += 1;

  // ── Age (15pts) ───────────────────────────────────────────────────────────
  if      (ageMinutes <= 10)  age += 15;
  else if (ageMinutes <= 30)  age += 12;
  else if (ageMinutes <= 60)  age += 8;
  else if (ageMinutes <= 120) age += 4;

  // ── Narrative (15pts) ─────────────────────────────────────────────────────
  const narrativeMatch  = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);
  const genericPenalty  = getGenericPenalty(pair.baseToken.name, pair.baseToken.symbol);

  narrative += narrativeMatch.bonus;
  narrative += genericPenalty;

  // Short memorable ticker bonus
  if      (pair.baseToken.symbol.length <= 4) narrative += 5;
  else if (pair.baseToken.symbol.length <= 6) narrative += 2;

  narrative = Math.min(15, Math.max(-10, narrative));

  const total = Math.max(0, Math.min(100, safety + liquidity + momentum + age + narrative));

  return {
    total, safety, liquidity, momentum, age, narrative,
    details: {
      liquidityUsd, volumeM5, volLiqRatio, volMcapRatio, ageMinutes,
      priceUsd, priceChangeM5, buyCount, sellCount, buySellRatio,
      fakeVolumeFlag, mcap,
    },
  };
}