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
  pairCreatedAt: number;  // unix milliseconds
  deployer?:     string;  // wallet that deployed the token (available via Helius later)
}

// ─── Filter ───────────────────────────────────────────────────────────────────
// Hard pre-filters — cheapest checks run first to avoid wasting API calls.

function filterPairs(pairs: RawPair[], maxAgeMinutes = 120): RawPair[] {
  const now = Date.now();

  return pairs.filter((p) => {
    // Must have core data
    if (!p.liquidity?.usd)  return false;
    if (!p.volume?.m5)      return false;
    if (!p.pairCreatedAt)   return false;

    // Age filter
    const ageMinutes = (now - p.pairCreatedAt) / 1000 / 60;
    if (ageMinutes > maxAgeMinutes) return false;

    // Minimum liquidity — raised to $8k to cut noise
    if (p.liquidity.usd < 8000) return false;

    // Must have positive 5-min volume
    if (p.volume.m5 <= 0) return false;

    // Drop hard dumpers
    if ((p.priceChange?.m5 ?? 0) < -10) return false;

    // Drop heavy sell pressure
    const buys  = p.txns?.m5?.buys  ?? 0;
    const sells = p.txns?.m5?.sells ?? 0;
    if (sells > buys * 2) return false;

    // Drop fake volume — vol/liq above 50 is wash trading
    const volLiqRatio = p.volume.m5 / p.liquidity.usd;
    if (volLiqRatio > 50) return false;

    // Vol/MCap ratio check — below 80% is almost certainly a bundle (per expert guide)
    const mcap = p.marketCap ?? p.fdv ?? 0;
    if (mcap > 0) {
      const volMcapRatio = p.volume.m5 / mcap;
      if (volMcapRatio < STRATEGY.scanner.minVolMcapRatio) {
        console.log(`⚠️  Vol/MCap too low (${(volMcapRatio * 100).toFixed(0)}%): ${p.baseToken.symbol} — likely bundled`);
        return false;
      }
    }

    // Drop stablecoin pairs — we only want memecoins
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

    // Enrich with deployer where available
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