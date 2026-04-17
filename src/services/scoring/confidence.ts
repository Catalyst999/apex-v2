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
    liquidityUsd:    number;
    volumeM5:        number;
    volLiqRatio:     number;
    ageMinutes:      number;
    priceUsd:        number;
    priceChangeM5:   number;
    buyCount:        number;
    sellCount:       number;
    buySellRatio:    number;
    fakeVolumeFlag:  boolean;
    volMcapRatio:    number;
  };
}

export function scorePair(pair: RawPair, security: FullSecurityResult): ScoreBreakdown {
  let safety = 0, liquidity = 0, momentum = 0, age = 0, narrative = 0;

  const now          = Date.now();
  const ageMinutes   = (now - pair.pairCreatedAt) / 1000 / 60;
  const liquidityUsd = pair.liquidity?.usd    ?? 0;
  const volumeM5     = pair.volume?.m5        ?? 0;
  const volumeH24    = pair.volume?.h24       ?? 0;
  const mcap         = pair.marketCap ?? pair.fdv ?? 0;
  const volLiqRatio  = liquidityUsd > 0 ? volumeM5 / liquidityUsd : 0;
  const volMcapRatio = mcap > 0 ? volumeM5 / mcap : 1;
  const priceUsd     = parseFloat(pair.priceUsd ?? "0");
  const priceChangeM5 = pair.priceChange?.m5  ?? 0;
  const buyCount     = pair.txns?.m5?.buys    ?? 0;
  const sellCount    = pair.txns?.m5?.sells   ?? 0;
  const buySellRatio = sellCount > 0 ? buyCount / sellCount : buyCount;

  // Fake volume: vol/liq > 50 OR high 24h vol with tiny liquidity
  const fakeVolumeFlag = volLiqRatio > 50 || (volumeH24 > 100_000 && liquidityUsd < 3000);

  // ── Safety (30pts) ───────────────────────────────────────────────────────
  if (security.mintAuthority   === null) safety += 15;
  if (security.freezeAuthority === null) safety += 10;
  if (!security.goplus.isHoneypot)       safety += 5;

  // ── Liquidity (20pts) ────────────────────────────────────────────────────
  if      (liquidityUsd >= 50_000) liquidity += 20;
  else if (liquidityUsd >= 20_000) liquidity += 16;
  else if (liquidityUsd >= 10_000) liquidity += 12;
  else if (liquidityUsd >= 8_000)  liquidity += 8;

  // ── Momentum (25pts) — vol/liq + buy/sell + price direction ─────────────
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

  // Vol/MCap bonus — high ratio means real buying pressure not bundle control
  if (volMcapRatio >= 2.0)       momentum += 5;
  else if (volMcapRatio >= 1.0)  momentum += 3;

  // ── Age (15pts) ──────────────────────────────────────────────────────────
  if      (ageMinutes <= 10)  age += 15;
  else if (ageMinutes <= 30)  age += 12;
  else if (ageMinutes <= 60)  age += 8;
  else if (ageMinutes <= 120) age += 4;

  // ── Narrative (15pts) ────────────────────────────────────────────────────
  const nameAndTicker = (pair.baseToken.name + " " + pair.baseToken.symbol).toLowerCase();

  // Penalise generic/scammy words first
  const genericWords = ["token", "coin", "finance", "protocol", "swap", "inu2", "safe2"];
  for (const word of genericWords) {
    if (nameAndTicker.includes(word)) { narrative -= 5; break; }
  }

  // Hot narratives from the guide — animal, political, meme, AI, community coins
  const hotNarratives = [
    "trump", "maga", "elon", "doge", "pepe", "ai", "dog", "cat", "based",
    "chad", "giga", "moon", "ape", "baby", "wojak", "frog", "meme", "pump",
    "sol", "bonk", "wif", "pnut", "peanut", "hippo", "monkey", "bird",
  ];
  for (const word of hotNarratives) {
    if (nameAndTicker.includes(word)) { narrative += 10; break; }
  }

  // Short ticker = more memorable = better
  if      (pair.baseToken.symbol.length <= 4) narrative += 5;
  else if (pair.baseToken.symbol.length <= 6) narrative += 2;

  narrative = Math.min(15, Math.max(-5, narrative));

  const total = Math.max(0, Math.min(100, safety + liquidity + momentum + age + narrative));

  return {
    total, safety, liquidity, momentum, age, narrative,
    details: {
      liquidityUsd, volumeM5, volLiqRatio, ageMinutes,
      priceUsd, priceChangeM5, buyCount, sellCount, buySellRatio,
      fakeVolumeFlag, volMcapRatio,
    },
  };
}