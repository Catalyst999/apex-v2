// src/services/scanner/dexscreener.ts

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
    m5: number;
    h1: number;
  };
  txns: {
    m5: { buys: number; sells: number; };
    h1: { buys: number; sells: number; };
  };
  volume: {
    m5:  number;
    h1:  number;
    h24: number;
  };
  liquidity: {
    usd: number;
  };
  pairCreatedAt: number;
  deployer?:     string;
}

// ─── Known large cap addresses to hard-reject ─────────────────────────────────
// These are real established coins that sometimes appear as "new pairs"
// when someone creates a new pool for them. We never want to trade these.
const LARGE_CAP_SYMBOLS = new Set([
  "DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI",
  "SOL",  "BTC",  "ETH",  "BNB",  "USDC", "USDT",
  "JUP",  "RAY",  "ORCA", "SAMO", "MEME",
]);

// ─── Suspicious name patterns ─────────────────────────────────────────────────
// Names that are almost always low-quality cash grabs
const TRASH_PATTERNS = [
  /fart/i, /ass(?:teroid|hole|wipe)/i, /shit/i, /cum(?:\s|$)/i,
  /rug/i,  /scam/i, /ponzi/i,
];

// ─── Filter ───────────────────────────────────────────────────────────────────
function filterPairs(pairs: RawPair[], maxAgeMinutes = 120): RawPair[] {
  const now = Date.now();

  return pairs.filter((p) => {
    if (!p.liquidity?.usd)  return false;
    if (!p.volume?.m5)      return false;
    if (!p.pairCreatedAt)   return false;

    const ageMinutes = (now - p.pairCreatedAt) / 1000 / 60;
    if (ageMinutes > maxAgeMinutes) return false;

    // Hard reject known large caps
    if (LARGE_CAP_SYMBOLS.has(p.baseToken.symbol?.toUpperCase())) {
      console.log(`⛔ Large cap rejected: ${p.baseToken.symbol}`);
      return false;
    }

    // Hard reject MCap above $500k — we only trade small caps
    const mcap = p.marketCap ?? p.fdv ?? 0;
    if (mcap > 500_000) {
      console.log(`⛔ MCap too high ($${(mcap/1000).toFixed(0)}k): ${p.baseToken.symbol}`);
      return false;
    }

    // Hard reject trash name patterns
    const fullName = `${p.baseToken.name} ${p.baseToken.symbol}`;
    if (TRASH_PATTERNS.some((pat) => pat.test(fullName))) {
      console.log(`⛔ Trash name rejected: ${p.baseToken.name}`);
      return false;
    }

    // Minimum liquidity
    if (p.liquidity.usd < 8000) return false;

    // Must have positive 5-min volume
    if (p.volume.m5 <= 0) return false;

    // Drop hard dumpers
    if ((p.priceChange?.m5 ?? 0) < -10) return false;

    // Drop heavy sell pressure
    const buys  = p.txns?.m5?.buys  ?? 0;
    const sells = p.txns?.m5?.sells ?? 0;
    if (sells > buys * 2) return false;

    // Minimum buyer activity — at least 10 buys in last 5 min
    if (buys < 10) {
      console.log(`⛔ Not enough buyers (${buys}): ${p.baseToken.symbol}`);
      return false;
    }

    // Drop fake volume
    const volLiqRatio = p.volume.m5 / p.liquidity.usd;
    if (volLiqRatio > 50) return false;

    // Vol/MCap ratio check
    if (mcap > 0) {
      const volMcapRatio = p.volume.m5 / mcap;
      if (volMcapRatio < STRATEGY.scanner.minVolMcapRatio) {
        console.log(`⛔ Vol/MCap too low (${(volMcapRatio * 100).toFixed(0)}%): ${p.baseToken.symbol}`);
        return false;
      }
    }

    // Drop stablecoin pairs
    const quote = p.quoteToken?.symbol?.toUpperCase() ?? "";
    if (["USDC", "USDT", "BUSD", "DAI"].includes(quote)) return false;

    return true;
  });
}

// ─── Solana scanner ───────────────────────────────────────────────────────────
export async function fetchNewSolanaPairs(): Promise<RawPair[]> {
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

    const solanaAddresses = solanaProfiles.map((p: any) => p.tokenAddress as string);
    console.log(`📡 Fetching pairs for ${solanaAddresses.length} tokens...`);

    const allPairs: RawPair[] = [];

    for (let i = 0; i < solanaAddresses.length; i += 10) {
      const batch = solanaAddresses.slice(i, i + 10).join(",");
      try {
        const pairRes = await axios.get(
          `https://api.dexscreener.com/tokens/v1/solana/${batch}`,
          { timeout: 10000 }
        );
        const pairs: any[] = pairRes.data ?? [];
        allPairs.push(...pairs);
      } catch (batchErr: any) {
        console.warn(`⚠️  Batch fetch failed: ${batchErr.message}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`📊 Total pairs fetched: ${allPairs.length}`);

    const enriched: RawPair[] = allPairs.map((pair: any) => ({
      ...pair,
      deployer: pair.deployer ?? pair.info?.deployer ?? undefined,
    }));

    return filterPairs(enriched);

  } catch (err: any) {
    console.error("❌ DexScreener SOL error:", err.message);
    return [];
  }
}

// ─── BSC scanner ──────────────────────────────────────────────────────────────
export async function fetchNewBscPairs(): Promise<RawPair[]> {
  try {
    const profileRes = await axios.get(
      "https://api.dexscreener.com/token-profiles/latest/v1",
      { timeout: 10000 }
    );

    const profiles: any[] = profileRes.data ?? [];
    const bscAddresses = profiles
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
        const pairs: any[] = res.data ?? [];
        allPairs.push(...pairs);
      } catch (batchErr: any) {
        console.warn(`⚠️  BSC batch failed: ${batchErr.message}`);
      }
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