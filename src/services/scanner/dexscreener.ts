import axios from "axios";

export interface RawPair {
  chainId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    symbol: string;
  };
  priceUsd: string;
  fdv: number;
  marketCap: number;
  priceChange: {
    m5: number;
    h1: number;
  };
  txns: {
    m5: {
      buys: number;
      sells: number;
    };
    h1: {
      buys: number;
      sells: number;
    };
  };
  volume: {
    m5: number;
    h1: number;
    h24: number;
  };
  liquidity: {
    usd: number;
  };
  pairCreatedAt: number;
}

interface TokenProfile {
  chainId: string;
  tokenAddress: string;
}

function filterPairs(pairs: RawPair[], maxAgeMinutes = 120): RawPair[] {
  const now = Date.now();
  return pairs.filter((p) => {
    if (!p.liquidity?.usd) return false;
    if (!p.volume?.m5) return false;
    if (!p.pairCreatedAt) return false;
    const ageMinutes = (now - p.pairCreatedAt) / 1000 / 60;
    if (ageMinutes > maxAgeMinutes) return false;
    if (p.liquidity.usd < 5000) return false;
    if (p.volume.m5 <= 0) return false;
    if ((p.priceChange?.m5 ?? 0) < -10) return false;
    const buys = p.txns?.m5?.buys ?? 0;
    const sells = p.txns?.m5?.sells ?? 0;
    if (sells > buys * 2) return false;
    const volLiqRatio = p.volume.m5 / p.liquidity.usd;
    if (volLiqRatio > 50) return false;
    return true;
  });
}

export async function fetchNewSolanaPairs(): Promise<RawPair[]> {
  try {
    const profileRes = await axios.get(
      "https://api.dexscreener.com/token-profiles/latest/v1"
    );

    const profiles: TokenProfile[] = profileRes.data ?? [];
    const solanaAddresses = profiles
      .filter((p) => p.chainId === "solana")
      .map((p) => p.tokenAddress)
      .slice(0, 30);

    if (solanaAddresses.length === 0) return [];

    console.log(`📡 Fetching pairs for ${solanaAddresses.length} tokens...`);

    const allPairs: RawPair[] = [];
    const batchSize = 10;

    for (let i = 0; i < solanaAddresses.length; i += batchSize) {
      const batch = solanaAddresses.slice(i, i + batchSize).join(",");
      const res = await axios.get(
        `https://api.dexscreener.com/tokens/v1/solana/${batch}`
      );
      const pairs = res.data ?? [];
      allPairs.push(...pairs);
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`📊 Total pairs fetched: ${allPairs.length}`);

    return filterPairs(allPairs);
  } catch (err: any) {
    console.error("❌ DexScreener SOL error:", err.message);
    return [];
  }
}

export async function fetchNewBscPairs(): Promise<RawPair[]> {
  try {
    const profileRes = await axios.get(
      "https://api.dexscreener.com/token-profiles/latest/v1"
    );

    const profiles: TokenProfile[] = profileRes.data ?? [];
    const bscAddresses = profiles
      .filter((p) => p.chainId === "bsc")
      .map((p) => p.tokenAddress)
      .slice(0, 30);

    if (bscAddresses.length === 0) return [];

    const allPairs: RawPair[] = [];
    const batchSize = 10;

    for (let i = 0; i < bscAddresses.length; i += batchSize) {
      const batch = bscAddresses.slice(i, i + batchSize).join(",");
      const res = await axios.get(
        `https://api.dexscreener.com/tokens/v1/bsc/${batch}`
      );
      const pairs = res.data ?? [];
      allPairs.push(...pairs);
      await new Promise((r) => setTimeout(r, 300));
    }

    return filterPairs(allPairs);
  } catch (err: any) {
    console.error("❌ DexScreener BSC error:", err.message);
    return [];
  }
}

export async function fetchTokenData(
  address: string,
  chain: "solana" | "bsc"
): Promise<RawPair | null> {
  try {
    const res = await axios.get(
      `https://api.dexscreener.com/tokens/v1/${chain}/${address}`
    );
    const pairs = res.data ?? [];
    return pairs[0] ?? null;
  } catch {
    return null;
  }
}