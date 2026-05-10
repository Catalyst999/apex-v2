// src/services/rpc/dexscreener-adapter.ts
/**
 * DEXSCREENER ADAPTER
 * Market data: liquidity, volume, marketcap, velocity
 * Lightweight market intelligence layer
 */

import axios from 'axios';

export interface PairData {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    m5: number;
    h1: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: {
    imageUrl?: string;
    websites?: string[];
    socials?: string[];
  };
}

class DexScreenerAdapter {
  private baseUrl: string = 'https://api.dexscreener.com/latest';
  private timeout: number = 10000;
  private cache: Map<string, { data: PairData; timestamp: number }> = new Map();
  private cacheTtl: number = 300000; // 5 minutes

  /**
   * SEARCH TOKEN
   */
  async searchToken(query: string): Promise<PairData[]> {
    try {
      const response = await axios.get<{ pairs: PairData[] }>(
        `${this.baseUrl}/dex/search?q=${query}`,
        { timeout: this.timeout }
      );

      return response.data?.pairs || [];
    } catch (error: any) {
      console.warn('[DexScreener] Search failed:', error.message);
      return [];
    }
  }

  /**
   * GET PAIR BY ADDRESS
   */
  async getPairByAddress(chainId: string, pairAddress: string): Promise<PairData | null> {
    const cacheKey = `${chainId}:${pairAddress}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtl) {
      return cached.data;
    }

    try {
      const response = await axios.get<{ pair: PairData }>(
        `${this.baseUrl}/dex/pairs/${chainId}/${pairAddress}`,
        { timeout: this.timeout }
      );

      const pair = response.data?.pair;
      if (pair) {
        this.cache.set(cacheKey, { data: pair, timestamp: Date.now() });
      }

      return pair || null;
    } catch (error) {
      console.warn('[DexScreener] Pair fetch failed');
      return null;
    }
  }

  /**
   * GET TOKEN BY MINT (Solana)
   */
  async getTokenByMint(mint: string): Promise<PairData | null> {
    return this.getPairByAddress('solana', mint);
  }

  /**
   * GET LIQUIDITY
   */
  async getLiquidity(chainId: string, pairAddress: string): Promise<number> {
    const pair = await this.getPairByAddress(chainId, pairAddress);
    return pair?.liquidity?.usd || 0;
  }

  /**
   * GET VOLUME ACCELERATION
   * Current 24h volume vs 1h volume (velocity indicator)
   */
  async getVolumeAcceleration(chainId: string, pairAddress: string): Promise<number> {
    const pair = await this.getPairByAddress(chainId, pairAddress);
    if (!pair || !pair.volume) return 0;

    const vol1h = pair.volume.h1 || 0;
    const vol24h = pair.volume.h24 || 0;

    // Higher ratio = faster volume expansion
    return vol1h > 0 ? (vol24h / vol1h / 24) : 0;
  }

  /**
   * GET MARKETCAP
   */
  async getMarketCap(chainId: string, pairAddress: string): Promise<number> {
    const pair = await this.getPairByAddress(chainId, pairAddress);
    return pair?.marketCap || pair?.fdv || 0;
  }

  /**
   * GET PRICE CHANGE
   */
  async getPriceChange(chainId: string, pairAddress: string): Promise<{
    m5: number;
    h1: number;
    h24: number;
  }> {
    const pair = await this.getPairByAddress(chainId, pairAddress);
    return pair?.priceChange || { m5: 0, h1: 0, h24: 0 };
  }

  /**
   * GET TRANSACTION ACTIVITY
   */
  async getTransactionActivity(chainId: string, pairAddress: string): Promise<{
    buysM5: number;
    sellsM5: number;
    buysH1: number;
    sellsH1: number;
  }> {
    const pair = await this.getPairByAddress(chainId, pairAddress);
    if (!pair) return { buysM5: 0, sellsM5: 0, buysH1: 0, sellsH1: 0 };

    return {
      buysM5: pair.txns?.m5?.buys || 0,
      sellsM5: pair.txns?.m5?.sells || 0,
      buysH1: pair.txns?.h1?.buys || 0,
      sellsH1: pair.txns?.h1?.sells || 0,
    };
  }

  /**
   * BATCH GET PAIRS
   */
  async batchGetPairs(chainId: string, pairAddresses: string[]): Promise<Map<string, PairData>> {
    const result = new Map<string, PairData>();

    for (const address of pairAddresses) {
      const pair = await this.getPairByAddress(chainId, address);
      if (pair) {
        result.set(address, pair);
      }
    }

    return result;
  }

  /**
   * GET STATUS
   */
  getStatus() {
    return {
      baseUrl: this.baseUrl,
      cacheSize: this.cache.size,
      cacheTtl: this.cacheTtl,
      type: 'DEXSCREENER_ADAPTER',
    };
  }

  /**
   * CLEAR CACHE
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[DexScreener] Cache cleared');
  }
}

export const dexscreenerAdapter = new DexScreenerAdapter();