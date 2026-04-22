// src/services/scanner/dexscreener.ts
// Catalyst Apex Trader v2.1 — All-Round Scanner
//
// Scans ALL Solana tokens regardless of age.
// Three data sources run in parallel:
// 1. New pairs    — fresh launches (token profiles endpoint)
// 2. Trending     — established coins with current momentum
// 3. Gainers      — tokens breaking out right now
//
// Chart shape is the entry gate — not age.

import axios from "axios";
import { STRATEGY } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawPair {
  chainId:     string;
  pairAddress: string;
  baseToken: {
    address: string;
    name:    string;
    symbol:  string;
  };
  quoteToken: {
    symbol: string;
  };
  priceUsd:  string;
  fdv:       number;
  marketCap: number;
  priceChange: {
    m5:  number;
    h1:  number;
    h6:  number;
    h24: number;
  };
  txns: {
    m5: { buys: number; sells: number; };
    h1: { buys: number; sells: number; };
    h6: { buys: number; sells: number; };
    h24:{ buys: number; sells: number; };
  };
  volume: {
    m5:  number;
    h1:  number;
    h6:  number;
    h24: number;
  };
  liquidity: {
    usd: number;
  };
  pairCreatedAt: number;
  deployer?:     string;
}

// ─── Known large caps to hard-reject ─────────────────────────────────────────

const LARGE_CAP_SYMBOLS = new Set([
  "DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI",
  "SOL",  "BTC",  "ETH",  "BNB", "USDC", "USDT",
  "JUP",  "RAY",  "ORCA", "SAMO", "MEME",
]);

// ─── Trash name patterns ──────────────────────────────────────────────────────

const TRASH_PATTERNS = [
  /\bfart\b/i, /\bass(teroid|hole|wipe)\b/i, /\bshit\b/i,
  /\bcum\b/i,  /\brug\b/i, /\bscam\b/i, /\bponzi\b/i,
];

// ─── Universal filter ─────────────────────────────────────────────────────────
// Applied to ALL tokens regardless of source.
// NO age filter — chart shape determines entry, not age.

function filterPairs(pairs: RawPair[]): RawPair[] {
  return pairs.filter((p) => {
    // Must have core data
    if (!p.liquidity?.usd) return false;
    if (!p.baseToken?.address) return false;

    // Hard reject known large caps
    if (LARGE_CAP_SYMBOLS.has(p.baseToken.symbol?.toUpperCase())) return false;

    // Hard reject MCap above $10M — we want coins with room to run
    const mcap = p.marketCap ?? p.fdv ?? 0;
    if (mcap > 10_000_000) {
      return false;
    }

    // Minimum MCap $15k — below this the deployer controls everything
    if (mcap > 0 && mcap < 15_000) {
      return false;
    }

    // Hard reject trash names
    const fullName = `${p.baseToken.name} ${p.baseToken.symbol}`;
    if (TRASH_PATTERNS.some((pat) => pat.test(fullName))) return false;

    // Minimum liquidity $8k
    if (p.liquidity.usd < 8_000) return false;

    // Must have some volume activity
    const hasActivity = (p.volume?.m5 ?? 0) > 0 ||
                        (p.volume?.h1 ?? 0) > 0 ||
                        (p.volume?.h24 ?? 0) > 0;
    if (!hasActivity) return false;

    // Drop stablecoin pairs
    const quote = p.quoteToken?.symbol?.toUpperCase() ?? "";
    if (["USDC", "USDT", "BUSD", "DAI"].includes(quote)) return false;

    // Drop dead tokens — no volume in 24h and price dropping
    const vol24 = p.volume?.h24 ?? 0;
    const priceH24 = p.priceChange?.h24 ?? 0;
    if (vol24 === 0 && priceH24 < -50) return false;

    return true;
  });
}

// ─── New pairs (fresh launches) ───────────────────────────────────────────────

async function fetchNewPairs(): Promise<RawPair[]> {
  try {
    const res = await axios.get(
      "https://api.dexscreener.com/token-profiles/latest/v1",
      { timeout: 10000 }
    );

    const allProfiles: any[] = res.data ?? [];
    const solanaProfiles = allProfiles
      .filter((p: any) => p.chainId === "solana")
      .slice(0, 30);

    if (solanaProfiles.length === 0) return [];

    const addresses = solanaProfiles.map((p: any) => p.tokenAddress as string);
    const allPairs:  RawPair[] = [];

    for (let i = 0; i < addresses.length; i += 10) {
      const batch = addresses.slice(i, i + 10).join(",");
      try {
        const pairRes = await axios.get(
          `https://api.dexscreener.com/tokens/v1/solana/${batch}`,
          { timeout: 10000 }
        );
        allPairs.push(...(pairRes.data ?? []));
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }

    return allPairs.map((pair: any) => ({
      ...pair,
      deployer: pair.deployer ?? pair.info?.deployer ?? undefined,
    }));

  } catch (err: any) {
    console.error("❌ New pairs fetch error:", err.message);
    return [];
  }
}

// ─── Trending tokens (established coins with momentum) ────────────────────────

async function fetchTrendingPairs(): Promise<RawPair[]> {
  try {
    const res = await axios.get(
      "https://api.dexscreener.com/token-boosts/top/v1",
      { timeout: 10000 }
    );

    const allBoosts: any[] = res.data ?? [];
    const solanaAddresses  = allBoosts
      .filter((p: any) => p.chainId === "solana")
      .map((p: any) => p.tokenAddress as string)
      .slice(0, 20);

    if (solanaAddresses.length === 0) return [];

    const allPairs: RawPair[] = [];

    for (let i = 0; i < solanaAddresses.length; i += 10) {
      const batch = solanaAddresses.slice(i, i + 10).join(",");
      try {
        const pairRes = await axios.get(
          `https://api.dexscreener.com/tokens/v1/solana/${batch}`,
          { timeout: 10000 }
        );
        allPairs.push(...(pairRes.data ?? []));
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }

    return allPairs;

  } catch (err: any) {
    console.error("❌ Trending pairs fetch error:", err.message);
    return [];
  }
}

// ─── Gainers (breakouts in progress) ─────────────────────────────────────────

async function fetchGainerPairs(): Promise<RawPair[]> {
  try {
    // DexScreener search for top Solana gainers by 1h price change
    const res = await axios.get(
      "https://api.dexscreener.com/latest/dex/search?q=solana",
      { timeout: 10000 }
    );

    const pairs: any[] = res.data?.pairs ?? [];

    // Filter to Solana only, sort by 1h gain, take top 20
    return pairs
      .filter((p: any) => p.chainId === "solana")
      .sort((a: any, b: any) => (b.priceChange?.h1 ?? 0) - (a.priceChange?.h1 ?? 0))
      .slice(0, 20);

  } catch (err: any) {
    console.error("❌ Gainers fetch error:", err.message);
    return [];
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
// Runs all 3 sources in parallel, deduplicates, filters, returns.

export async function fetchNewSolanaPairs(): Promise<RawPair[]> {
  console.log(`📡 Scanning: new pairs + trending + gainers...`);

  // Run all 3 in parallel
  const [newPairs, trendingPairs, gainerPairs] = await Promise.all([
    fetchNewPairs(),
    fetchTrendingPairs(),
    fetchGainerPairs(),
  ]);

  console.log(`   📦 New: ${newPairs.length} | Trending: ${trendingPairs.length} | Gainers: ${gainerPairs.length}`);

  // Merge and deduplicate by token address
  const seen    = new Set<string>();
  const merged: RawPair[] = [];

  for (const pair of [...newPairs, ...trendingPairs, ...gainerPairs]) {
    const addr = pair.baseToken?.address;
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    merged.push(pair);
  }

  console.log(`   🔀 Merged: ${merged.length} unique tokens`);

  const filtered = filterPairs(merged);
  console.log(`   ✅ After filter: ${filtered.length} tokens`);

  return filtered;
}

// ─── BSC scanner (unchanged) ──────────────────────────────────────────────────

export async function fetchNewBscPairs(): Promise<RawPair[]> {
  try {
    const profileRes = await axios.get(
      "https://api.dexscreener.com/token-profiles/latest/v1",
      { timeout: 10000 }
    );

    const profiles: any[]  = profileRes.data ?? [];
    const bscAddresses     = profiles
      .filter((p: any) => p.chainId === "bsc")
      .map((p: any) => p.tokenAddress as string)
      .slice(0, 30);

    if (bscAddresses.length === 0) return [];

    const allPairs: RawPair[] = [];

    for (let i = 0; i < bscAddresses.length; i += 10) {
      const batch = bscAddresses.slice(i, i + 10).join(",");
      try {
        const res = await axios.get(
          `https://api.dexscreener.com/tokens/v1/bsc/${batch}`,
          { timeout: 10000 }
        );
        allPairs.push(...(res.data ?? []));
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }

    return filterPairs(allPairs);

  } catch (err: any) {
    console.error("❌ DexScreener BSC error:", err.message);
    return [];
  }
}

// ─── Single token lookup ──────────────────────────────────────────────────────

export async function fetchTokenData(
  address: string,
  chain:   "solana" | "bsc"
): Promise<RawPair | null> {
  try {
    const res = await axios.get(
      `https://api.dexscreener.com/tokens/v1/${chain}/${address}`,
      { timeout: 10000 }
    );
    const pairs: any[] = res.data ?? [];
    return pairs[0] ?? null;
  } catch {
    return null;
  }
}