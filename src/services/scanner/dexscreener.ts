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
  volume: {
    m5: number;
    h1: number;
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
    if (allPairs.length > 0) {
      console.log("Sample pair:", JSON.stringify(allPairs[0]).slice(0, 200));
    }

    const now = Date.now();
    return allPairs.filter((p) => {
      const ageMinutes = (now - p.pairCreatedAt) / 1000 / 60;
      return (
        p.liquidity?.usd >= 5000 &&
        p.volume?.m5 > 0 &&
        ageMinutes <= 120
      );
    });

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

    const now = Date.now();
    return allPairs.filter((p) => {
      const ageMinutes = (now - p.pairCreatedAt) / 1000 / 60;
      return (
        p.liquidity?.usd >= 5000 &&
        p.volume?.m5 > 0 &&
        ageMinutes <= 120
      );
    });

  } catch (err: any) {
    console.error("❌ DexScreener BSC error:", err.message);
    return [];
  }
}