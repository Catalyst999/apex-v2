// src/services/rpc/runtime-cache.ts
/**
 * RUNTIME CACHE
 * Request deduplication, cooldowns, caching
 * Prevents API spam and duplicate processing
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CooldownEntry {
  token: string;
  lastRequest: number;
  cooldownMs: number;
}

class RuntimeCache {
  // Request cache (dedup + TTL)
  private cache: Map<string, CacheEntry<any>> = new Map();

  // Cooldown tracking (token-level throttling)
  private cooldowns: Map<string, CooldownEntry> = new Map();

  // Circuit breaker
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerTrips: number = 0;
  private circuitBreakerResetTime: number = 0;

  // Stats
  private hits: number = 0;
  private misses: number = 0;
  private duplicateBlocks: number = 0;

  /**
   * GET FROM CACHE
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  /**
   * SET IN CACHE
   */
  set<T>(key: string, data: T, ttl: number = 300000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * CHECK IF REQUEST SHOULD BE BLOCKED (Duplicate)
   */
  isDuplicateRequest(key: string): boolean {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      // If still in cache and fresh, it's a duplicate
      if (Date.now() - entry.timestamp < entry.ttl) {
        this.duplicateBlocks++;
        return true;
      }
    }
    return false;
  }

  /**
   * CHECK COOLDOWN FOR TOKEN
   */
  isOnCooldown(token: string, cooldownMs: number = 500): boolean {
    const cd = this.cooldowns.get(token);
    if (!cd) return false;

    const elapsed = Date.now() - cd.lastRequest;
    return elapsed < cooldownMs;
  }

  /**
   * UPDATE COOLDOWN
   */
  updateCooldown(token: string, cooldownMs: number = 500): void {
    this.cooldowns.set(token, {
      token,
      lastRequest: Date.now(),
      cooldownMs,
    });
  }

  /**
   * CIRCUIT BREAKER: Check if open
   */
  isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpen) return false;

    // Check if reset time has passed
    if (Date.now() > this.circuitBreakerResetTime) {
      console.log('[Cache] Circuit breaker reset');
      this.circuitBreakerOpen = false;
      this.circuitBreakerTrips = 0;
      return false;
    }

    return true;
  }

  /**
   * TRIGGER CIRCUIT BREAKER
   * On 429 error, pause all RPC requests for cooldown period
   */
  triggerCircuitBreaker(cooldownMs: number = 60000): void {
    this.circuitBreakerTrips++;
    this.circuitBreakerOpen = true;
    this.circuitBreakerResetTime = Date.now() + cooldownMs;

    console.warn(`[Cache] ⚠️ Circuit breaker OPEN (trip ${this.circuitBreakerTrips})`);
  }

  /**
   * RESET CIRCUIT BREAKER
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.circuitBreakerTrips = 0;
    this.circuitBreakerResetTime = 0;
    console.log('[Cache] Circuit breaker reset');
  }

  /**
   * CLEANUP EXPIRED ENTRIES
   */
  cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.cache.delete(key);
    }

    if (expired.length > 0) {
      console.log(`[Cache] Cleaned ${expired.length} expired entries`);
    }
  }

  /**
   * START AUTO-CLEANUP
   */
  startAutoCleanup(intervalMs: number = 60000): NodeJS.Timer {
    return setInterval(() => this.cleanup(), intervalMs);
  }

  /**
   * GET STATS
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      cacheSize: this.cache.size,
      cooldownSize: this.cooldowns.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate.toFixed(1),
      duplicateBlocks: this.duplicateBlocks,
      circuitBreakerOpen: this.circuitBreakerOpen,
      circuitBreakerTrips: this.circuitBreakerTrips,
      type: 'RUNTIME_CACHE',
    };
  }

  /**
   * CLEAR ALL
   */
  clear(): void {
    this.cache.clear();
    this.cooldowns.clear();
    this.resetCircuitBreaker();
    this.hits = 0;
    this.misses = 0;
    this.duplicateBlocks = 0;
    console.log('[Cache] Cleared all');
  }
}

export const runtimeCache = new RuntimeCache();