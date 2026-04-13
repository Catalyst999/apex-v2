import { RawPair } from "../scanner/dexscreener";
import { FullSecurityResult } from "../security";

export interface ScoreBreakdown {
  total: number;
  safety: number;
  liquidity: number;
  momentum: number;
  age: number;
  details: {
    liquidityUsd: number;
    volumeM5: number;
    volLiqRatio: number;
    ageMinutes: number;
    priceUsd: number;
  };
}

export function scorePair(
  pair: RawPair,
  security: FullSecurityResult
): ScoreBreakdown {
  let safety = 0;
  let liquidity = 0;
  let momentum = 0;
  let age = 0;

  const now = Date.now();
  const ageMinutes = (now - pair.pairCreatedAt) / 1000 / 60;
  const liquidityUsd = pair.liquidity?.usd ?? 0;
  const volumeM5 = pair.volume?.m5 ?? 0;
  const volLiqRatio = liquidityUsd > 0 ? volumeM5 / liquidityUsd : 0;
  const priceUsd = parseFloat(pair.priceUsd ?? "0");

  // ── Safety (30pts) ──────────────────────────────────────
  if (security.mintAuthority === null) safety += 15;
  if (security.freezeAuthority === null) safety += 10;
  if (!security.goplus.isHoneypot) safety += 5;

  // ── Liquidity (25pts) ───────────────────────────────────
  if (liquidityUsd >= 50000) liquidity += 25;
  else if (liquidityUsd >= 20000) liquidity += 20;
  else if (liquidityUsd >= 10000) liquidity += 15;
  else if (liquidityUsd >= 5000) liquidity += 10;

  // ── Momentum (25pts) ────────────────────────────────────
  if (volLiqRatio >= 2.0) momentum += 25;
  else if (volLiqRatio >= 1.5) momentum += 20;
  else if (volLiqRatio >= 1.0) momentum += 15;
  else if (volLiqRatio >= 0.5) momentum += 10;
  else if (volLiqRatio > 0) momentum += 5;

  // ── Age sweet spot (20pts) ──────────────────────────────
  if (ageMinutes <= 10) age += 20;
  else if (ageMinutes <= 30) age += 15;
  else if (ageMinutes <= 60) age += 10;
  else if (ageMinutes <= 120) age += 5;

  const total = safety + liquidity + momentum + age;

  return {
    total,
    safety,
    liquidity,
    momentum,
    age,
    details: {
      liquidityUsd,
      volumeM5,
      volLiqRatio,
      ageMinutes,
      priceUsd,
    },
  };
}