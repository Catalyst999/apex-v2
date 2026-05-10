/**
 * HELIUS RPC SERVICE - FIXED
 * Proper 429 error detection + aggressive backoff
 */

import axios, { AxiosError } from 'axios';
import { HELIUS } from '../../core/config';

// ─── Types ────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface InFlightRequest {
  promise: Promise<any>;
  controller: AbortController;
}

interface RateLimitState {
  requestCount: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil: number;
}

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

type RpcEndpoint = 'primary' | 'backup';

// ─── RPC Service ──────────────────────────────────────────────────────────

class HeliusRpcService {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlightRequests = new Map<string, InFlightRequest>();
  private rateLimitState: RateLimitState = {
    requestCount: 0,
    windowStart: Date.now(),
    blocked: false,
    blockedUntil: 0,
  };

  // Configuration - VERY CONSERVATIVE for aggressive rate limiting
  private readonly MAX_REQUESTS_PER_SEC = 2; // 2 requests/sec (Helius is very strict)
  private readonly REQUEST_WINDOW_MS = 1000;
  private readonly BACKOFF_BASE_MS = 2000; // Start at 2 seconds
  private readonly MAX_RETRIES = 2; // Too aggressive; fewer retries to reduce duplicate load
  private readonly CACHE_TTL_SIGNATURES = 15000; // 15 seconds cache
  private readonly CACHE_TTL_TRANSACTIONS = 20000; // 20 seconds cache

  // Endpoints
  private primaryRpc: string;
  private backupRpc: string;
  private currentEndpoint: RpcEndpoint = 'primary';

  constructor() {
    this.primaryRpc = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.API_KEY}`;
    this.backupRpc = `https://api.helius.xyz/v0/?api-key=${HELIUS.API_KEY}`;
  }

  /**
   * GET SIGNATURES FOR ADDRESS
   */
  async getSignaturesForAddress(address: string, limit: number = 100): Promise<string[]> {
    const cacheKey = `sigs_${address}_${limit}`;

    // 1. Check cache first
    const cached = this.getCached<Array<{ signature: string }>>(cacheKey);
    if (cached && Array.isArray(cached)) {
      const signatures = cached.map((r) => r.signature).filter(Boolean);
      console.log(`[RPC] ✓ Cache hit: ${address.slice(0, 8)}... (${signatures.length} sigs)`);
      return signatures;
    }

    // 2. Check for in-flight request (deduplication)
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      console.log(`[RPC] ⟳ Dedup: ${address.slice(0, 8)}... (waiting for in-flight)`);
      const result = await inFlight.promise;
      return Array.isArray(result) ? result.map((r: any) => r.signature).filter(Boolean) : [];
    }

    // 3. Rate limit check
    await this.waitForRateLimit();

    // 4. Make request (with deduplication tracking)
    const request = this.makeRequest(
      cacheKey,
      () =>
        this.rpcCall<Array<{ signature: string }>>(
          'getSignaturesForAddress',
          [address, { limit, commitment: 'confirmed' }]
        )
    );

    try {
      const result = await request.promise;
      const signatures = Array.isArray(result) ? result.map((r) => r.signature).filter(Boolean) : [];

      // Cache the result
      this.setCache(cacheKey, result || [], this.CACHE_TTL_SIGNATURES);

      console.log(`[RPC] ✓ Got ${signatures.length} sigs: ${address.slice(0, 8)}...`);
      return signatures;
    } catch (err) {
      console.error(`[RPC] ✗ getSignaturesForAddress failed:`, err);
      return [];
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  /**
   * FETCH ENHANCED TRANSACTIONS
   */
  async fetchEnhancedTransactions(signatures: string[]): Promise<any[]> {
    if (!Array.isArray(signatures) || signatures.length === 0) return [];

    const cacheKey = `txs_${signatures.slice(0, 10).join('_')}`;

    // Check cache
    const cached = this.getCached<any[]>(cacheKey);
    if (cached && Array.isArray(cached)) {
      console.log(`[RPC] ✓ Cache hit: ${signatures.length} txs`);
      return cached;
    }

    // Check in-flight
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      console.log(`[RPC] ⟳ Dedup: ${signatures.length} txs (waiting for in-flight)`);
      const result = await inFlight.promise;
      return Array.isArray(result) ? result : [];
    }

    await this.waitForRateLimit();

    const request = this.makeRequest(
      cacheKey,
      () =>
        this.rpcCall<any[]>(
          'getTransactions',
          [signatures.slice(0, 100)],
          'helius-enhanced'
        )
    );

    try {
      const result = await request.promise;
      const txs = Array.isArray(result) ? result : [];
      this.setCache(cacheKey, txs, this.CACHE_TTL_TRANSACTIONS);
      console.log(`[RPC] ✓ Got ${txs.length} txs`);
      return txs;
    } catch (err) {
      console.error(`[RPC] ✗ fetchEnhancedTransactions failed:`, err);
      return [];
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  /**
   * CORE RPC CALL with proper 429 detection and backoff
   */
  private async rpcCall<T>(
    method: string,
    params: any[],
    endpoint: string = 'standard'
  ): Promise<T | null> {
    let lastError: any;
    let backoffMs = this.BACKOFF_BASE_MS;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const url =
          endpoint === 'helius-enhanced'
            ? `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.API_KEY}`
            : this.currentEndpoint === 'primary'
            ? this.primaryRpc
            : this.backupRpc;

        console.log(`[RPC] Attempt ${attempt + 1}/${this.MAX_RETRIES}: POST ${method} (${url.slice(0, 50)}...)`);

        const response = await axios.post<RpcResponse<T>>(
          url,
          {
            jsonrpc: '2.0',
            id: Math.random(),
            method,
            params,
          },
          {
            timeout: 12000,
            headers: { 'Content-Type': 'application/json' },
          }
        );

        // Check if response status is 429
        if (response.status === 429) {
          console.warn(`[RPC] Got 429 in response (attempt ${attempt + 1})`);
          throw new Error('HTTP 429 - Rate Limited');
        }

        if (response.data?.error) {
          throw new Error(`RPC Error: ${response.data.error.message}`);
        }

        // Success - reset failover if needed
        if (this.currentEndpoint === 'backup') {
          console.log('[RPC] ✓ Switched back to primary endpoint');
          this.currentEndpoint = 'primary';
        }

        return response.data?.result ?? null;
      } catch (err: any) {
        lastError = err;

        // Check if this is a 429 error
        const is429 =
          err.response?.status === 429 ||
          err.status === 429 ||
          (err.message && err.message.includes('429'));

        if (is429) {
          const retryAfter = err.response?.headers?.['retry-after'];
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(60000, backoffMs * Math.pow(2, attempt));

          console.warn(
            `[RPC] 429 (attempt ${attempt + 1}/${this.MAX_RETRIES}) - waiting ${waitMs}ms (retry-after: ${retryAfter}s)`
          );

          this.rateLimitState.blocked = true;
          this.rateLimitState.blockedUntil = Date.now() + waitMs;

          await this.sleep(waitMs);
          continue;
        }

        // Connection errors - try failover if on primary
        const isNetworkError =
          err.code === 'ECONNREFUSED' ||
          err.code === 'ENOTFOUND' ||
          (err.message && err.message.includes('timeout'));

        if (isNetworkError && this.currentEndpoint === 'primary') {
          console.warn(`[RPC] Primary endpoint failed (${err.code}), switching to backup...`);
          this.currentEndpoint = 'backup';
          continue;
        }

        // Give up after MAX_RETRIES
        if (attempt === this.MAX_RETRIES - 1) {
          console.error(`[RPC] Failed after ${this.MAX_RETRIES} attempts:`, err.message);
          throw lastError;
        }

        // Standard backoff for other errors
        const wait = backoffMs * (attempt + 1);
        console.warn(`[RPC] Error attempt ${attempt + 1} - waiting ${wait}ms before retry:`, err.message);
        await this.sleep(wait);
        backoffMs *= 1.5;
      }
    }

    throw lastError;
  }

  /**
   * RATE LIMIT MANAGEMENT
   */
  private async waitForRateLimit(): Promise<void> {
    // Check if currently blocked due to 429
    if (this.rateLimitState.blocked && Date.now() < this.rateLimitState.blockedUntil) {
      const waitMs = this.rateLimitState.blockedUntil - Date.now();
      console.warn(`[RPC] Blocked by rate limit - waiting ${waitMs.toFixed(0)}ms...`);
      await this.sleep(waitMs);
      this.rateLimitState.blocked = false;
    }

    // Rolling window: check requests in last second
    const now = Date.now();
    const windowAge = now - this.rateLimitState.windowStart;

    if (windowAge > this.REQUEST_WINDOW_MS) {
      // Reset window
      this.rateLimitState.requestCount = 0;
      this.rateLimitState.windowStart = now;
    }

    this.rateLimitState.requestCount++;

    // If approaching limit, wait
    if (this.rateLimitState.requestCount >= this.MAX_REQUESTS_PER_SEC) {
      const waitMs = this.REQUEST_WINDOW_MS - windowAge;
      if (waitMs > 0) {
        console.log(
          `[RPC] Throttle (${this.rateLimitState.requestCount}/${this.MAX_REQUESTS_PER_SEC}/sec) - waiting ${waitMs.toFixed(0)}ms`
        );
        await this.sleep(waitMs);
        this.rateLimitState.requestCount = 0;
        this.rateLimitState.windowStart = Date.now();
      }
    }
  }

  /**
   * CACHE MANAGEMENT
   */
  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * IN-FLIGHT REQUEST TRACKING
   */
  private makeRequest<T>(key: string, fn: () => Promise<T>): InFlightRequest {
    const controller = new AbortController();
    const promise = fn();

    this.inFlightRequests.set(key, { promise, controller });
    return { promise, controller };
  }

  /**
   * HELPERS
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  clearCache(): void {
    console.log(`[RPC] Clearing cache (${this.cache.size} entries)`);
    this.cache.clear();
  }

  getStatus() {
    return {
      cacheSize: this.cache.size,
      inFlightRequests: this.inFlightRequests.size,
      currentEndpoint: this.currentEndpoint,
      rateLimited: this.rateLimitState.blocked,
      requestsThisSec: this.rateLimitState.requestCount,
      blockedUntil: this.rateLimitState.blockedUntil,
    };
  }
}

// Export singleton
export const heliusRpc = new HeliusRpcService();