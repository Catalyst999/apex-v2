// src/services/rpc/raydium-intelligence.ts
/**
 * RAYDIUM INTELLIGENCE
 * Pool creation, LP events, migration tracking
 * Important for revival detection (liquidity preparation)
 */

import axios from 'axios';

export interface RaydiumPool {
  id: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  lpDecimals: number;
  version: number;
  programId: string;
  authority: string;
  openOrders: string;
  targetOrders: string;
  baseVault: string;
  quoteVault: string;
  marketVersion: number;
  marketProgramId: string;
  marketId: string;
  marketAuthority: string;
  marketBaseVault: string;
  marketQuoteVault: string;
  marketBids: string;
  marketAsks: string;
  marketEventQueue: string;
  lookupTableAccount?: string;
}

export interface LiquidityEvent {
  poolId: string;
  token: string;
  liquidityAdded: number;
  timestamp: number;
  type: 'ADD' | 'REMOVE';
}

class RaydiumIntelligence {
  private apiUrl: string = 'https://api.raydium.io/v2';
  private timeout: number = 10000;
  private poolCache: Map<string, RaydiumPool> = new Map();
  private cacheTtl: number = 300000; // 5 minutes

  /**
   * GET RAYDIUM POOLS
   */
  async getRaydiumPools(): Promise<RaydiumPool[]> {
    try {
      const response = await axios.get<{ data: { official: RaydiumPool[] } }>(
        `${this.apiUrl}/poolList`,
        { timeout: this.timeout }
      );

      const pools = response.data?.data?.official || [];
      pools.forEach(pool => {
        this.poolCache.set(pool.id, pool);
      });

      console.log(`[RaydiumIntel] ✓ Loaded ${pools.length} pools`);
      return pools;
    } catch (error: any) {
      console.warn('[RaydiumIntel] Failed to load pools:', error.message);
      return [];
    }
  }

  /**
   * GET POOL BY MINT
   */
  async getPoolByMint(baseMint: string): Promise<RaydiumPool | null> {
    // Check cache first
    for (const pool of this.poolCache.values()) {
      if (pool.baseMint === baseMint) {
        return pool;
      }
    }

    // Fetch all and retry
    const pools = await this.getRaydiumPools();
    return pools.find(p => p.baseMint === baseMint) || null;
  }

  /**
   * DETECT NEW POOLS (Recent listings)
   * Useful for finding new tokens to monitor
   */
  async detectNewPools(sinceMinutes: number = 60): Promise<RaydiumPool[]> {
    const pools = await this.getRaydiumPools();
    
    // Raydium API doesn't provide creation time directly,
    // so we track recent discovered pools
    const recent = pools.slice(-100); // Most recently added

    console.log(`[RaydiumIntel] Found ${recent.length} recent pools (last 100)`);
    return recent;
  }

  /**
   * CHECK LIQUIDITY STABILITY
   * Is LP backing this pool stable or declining?
   */
  async checkLiquidityStability(poolId: string): Promise<{
    stable: boolean;
    trend: 'increasing' | 'decreasing' | 'stable';
    confidence: number;
  }> {
    // Requires historical data - simplified version
    // In production, track LP changes over time

    const pool = this.poolCache.get(poolId);
    if (!pool) {
      return { stable: false, trend: 'stable', confidence: 0 };
    }

    // Check if both vaults have liquidity
    const hasBackedLiquidity = !!pool.baseVault && !!pool.quoteVault;

    return {
      stable: hasBackedLiquidity,
      trend: 'stable',
      confidence: hasBackedLiquidity ? 0.8 : 0.2,
    };
  }

  /**
   * DETECT MIGRATION
   * Track Pump.fun → Raydium migrations
   */
  async detectMigration(token: string): Promise<{
    hasMigrated: boolean;
    migratedTo?: RaydiumPool;
    timestamp?: number;
  }> {
    const pool = await this.getPoolByMint(token);
    
    if (pool) {
      return {
        hasMigrated: true,
        migratedTo: pool,
        timestamp: Date.now(),
      };
    }

    return { hasMigrated: false };
  }

  /**
   * GET POOL STATS
   */
  getPoolStats() {
    return {
      cachedPools: this.poolCache.size,
      cacheTtl: this.cacheTtl,
      type: 'RAYDIUM_INTELLIGENCE',
    };
  }

  /**
   * CLEAR CACHE
   */
  clearCache(): void {
    this.poolCache.clear();
    console.log('[RaydiumIntel] Cache cleared');
  }

  /**
   * REFRESH POOLS
   */
  async refreshPools(): Promise<void> {
    this.clearCache();
    await this.getRaydiumPools();
  }
}

export const raydiumIntelligence = new RaydiumIntelligence();