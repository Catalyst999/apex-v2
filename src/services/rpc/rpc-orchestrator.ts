// src/services/rpc/rpc-orchestrator.ts
/**
 * RPC ORCHESTRATOR
 * Routes requests to appropriate provider
 * Coordinates hybrid RPC strategy
 */

import { publicRpcAdapter } from './public-rpc-adapter';
import { heliusRpcEnrichment } from './helius-rpc-enrichment';
import { dexscreenerAdapter } from './dexscreener-adapter';
import { raydiumIntelligence } from './raydium-intelligence';
import { runtimeCache } from './runtime-cache';
import { HYBRID_RPC } from '../../core/config';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export type RequestType =
  | 'BACKGROUND_SCAN'
  | 'MARKET_DATA'
  | 'ENRICHMENT'
  | 'MIGRATION_CHECK'
  | 'FALLBACK';

class RpcOrchestrator {
  private requestCounts: Map<RequestType, number> = new Map();
  private startTime: number = Date.now();

  constructor() {
    // Initialize request counters
    const types: RequestType[] = [
      'BACKGROUND_SCAN',
      'MARKET_DATA',
      'ENRICHMENT',
      'MIGRATION_CHECK',
      'FALLBACK',
    ];
    types.forEach(type => this.requestCounts.set(type, 0));
  }

  /**
   * ROUTE GET SIGNATURES
   * Background scanning → Public RPC (cheap)
   */
  async getSignaturesForAddress(
    address: string,
    limit?: number,
  ): Promise<any[]> {
    // Check circuit breaker
    if (runtimeCache.isCircuitBreakerOpen()) {
      console.log('[RpcOrch] Circuit breaker open, request blocked');
      return [];
    }

    // Check duplicate
    const cacheKey = `sigs:${address}:${limit || 100}`;
    if (runtimeCache.isDuplicateRequest(cacheKey)) {
      console.log('[RpcOrch] Duplicate request blocked:', cacheKey);
      return [];
    }

    try {
      const result = await publicRpcAdapter.getSignaturesForAddress(address, limit);
      runtimeCache.set(cacheKey, result, 60000); // Cache 1 minute
      this.recordRequest('BACKGROUND_SCAN');
      return result;
    } catch (error) {
      console.error('[RpcOrch] Get signatures failed:', error);
      return [];
    }
  }

  /**
   * ROUTE GET MARKET DATA
   * Token metadata → DexScreener (free market data)
   */
  async getMarketData(mint: string): Promise<any | null> {
    const cacheKey = `market:${mint}`;
    
    // Check cache
    const cached = runtimeCache.get(cacheKey);
    if (cached) return cached;

    try {
      const data = await dexscreenerAdapter.getTokenByMint(mint);
      if (data) {
        runtimeCache.set(cacheKey, data, 300000); // Cache 5 minutes
      }
      this.recordRequest('MARKET_DATA');
      return data;
    } catch (error) {
      console.error('[RpcOrch] Market data failed:', error);
      return null;
    }
  }

  /**
   * ROUTE ENRICHMENT
   * Deep analysis → Helius RPC (only for high-conviction)
   */
  async enrichToken(mint: string, conviction: number): Promise<any | null> {
    // Only enrich high-conviction tokens
    if (conviction < HYBRID_RPC.HELIUS_ENRICHMENT_CONVICTION_THRESHOLD) {
      console.log(`[RpcOrch] Conviction ${conviction} below threshold ${HYBRID_RPC.HELIUS_ENRICHMENT_CONVICTION_THRESHOLD}, skipping enrichment`);
      return null;
    }

    const cacheKey = `enrich:${mint}`;
    const cached = runtimeCache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await heliusRpcEnrichment.enrichToken(mint, conviction);
      runtimeCache.set(cacheKey, result, 600000); // Cache 10 minutes
      this.recordRequest('ENRICHMENT');
      return result;
    } catch (error) {
      console.error('[RpcOrch] Enrichment failed:', error);
      return null;
    }
  }

  /**
   * ROUTE MIGRATION CHECK
   * Pump.fun → Raydium migration → Raydium API
   */
  async checkMigration(token: string): Promise<{
    hasMigrated: boolean;
    poolInfo?: any;
  }> {
    const cacheKey = `migration:${token}`;
    
    // Check cache
    const cached = runtimeCache.get(cacheKey) as any;
    if (cached && cached.hasMigrated !== undefined) return cached;

    try {
      const result = await raydiumIntelligence.detectMigration(token);
      runtimeCache.set(cacheKey, result, 600000); // Cache 10 minutes
      this.recordRequest('MIGRATION_CHECK');
      return result;
    } catch (error) {
      console.error('[RpcOrch] Migration check failed:', error);
      return { hasMigrated: false };
    }
  }

  /**
   * ROUTE FALLBACK
   * When primary RPC fails → try public RPC
   */
  async fallbackGetTransaction(signature: string): Promise<any | null> {
    try {
      const result = await publicRpcAdapter.getTransaction(signature);
      this.recordRequest('FALLBACK');
      return result;
    } catch (error) {
      console.error('[RpcOrch] Fallback failed:', error);
      return null;
    }
  }

  /**
   * RECORD REQUEST
   */
  private recordRequest(type: RequestType): void {
    const current = this.requestCounts.get(type) || 0;
    this.requestCounts.set(type, current + 1);
  }

  /**
   * GET METRICS
   */
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    const totalRequests = Array.from(this.requestCounts.values()).reduce(
      (a, b) => a + b,
      0,
    );

    return {
      uptime: uptime,
      totalRequests,
      byType: Object.fromEntries(this.requestCounts),
      circuitBreakerOpen: runtimeCache.isCircuitBreakerOpen(),
      cacheStats: runtimeCache.getStats(),
      type: 'RPC_ORCHESTRATOR',
    };
  }

  /**
   * GET STATUS
   */
  getStatus() {
    return {
      publicRpcAdapter: publicRpcAdapter.getStatus(),
      heliusRpcEnrichment: heliusRpcEnrichment.getStatus(),
      dexscreenerAdapter: dexscreenerAdapter.getStatus(),
      raydiumIntel: raydiumIntelligence.getPoolStats(),
      metrics: this.getMetrics(),
      type: 'RPC_ORCHESTRATOR',
    };
  }

  /**
   * RESET METRICS
   */
  resetMetrics(): void {
    const types: RequestType[] = [
      'BACKGROUND_SCAN',
      'MARKET_DATA',
      'ENRICHMENT',
      'MIGRATION_CHECK',
      'FALLBACK',
    ];
    types.forEach(type => this.requestCounts.set(type, 0));
    this.startTime = Date.now();
    console.log('[RpcOrch] Metrics reset');
  }
}

export const rpcOrchestrator = new RpcOrchestrator();