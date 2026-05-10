// src/services/intelligence/revival-engine/dormancy-detector.ts
/**
 * DORMANCY DETECTOR
 * Identifies tokens that have gone inactive after previous activity
 * Computes dormancy score based on time since last activity
 */

import { runtimeState } from '../../../core/state/runtime-state';

export interface DormancyToken {
  token: string;
  lastActivityTime: number;
  daysSinceActive: number;
  dormancyScore: number; // 0-100, higher = more dormant
  previousVolume?: number;
  previousPrice?: number;
}

class DormancyDetector {
  private dormancyThresholdDays: number = 7; // Consider dormant after 7 days
  private maxDormancyDays: number = 180; // Cap at 180 days for scoring

  /**
   * DETECT DORMANCY
   * Calculate dormancy for a token based on last activity
   */
  async detectDormancy(token: string, lastActivityTime: number): Promise<DormancyToken | null> {
    if (!lastActivityTime) return null;

    const now = Date.now();
    const timeSinceActivity = now - lastActivityTime;
    const daysSinceActive = timeSinceActivity / (1000 * 60 * 60 * 24);

    // Only consider it dormant if > threshold
    if (daysSinceActive < this.dormancyThresholdDays) {
      return null;
    }

    // Calculate dormancy score (0-100)
    // Higher score = more dormant
    const dormancyScore = Math.min(
      100,
      (daysSinceActive / this.maxDormancyDays) * 100
    );

    return {
      token,
      lastActivityTime,
      daysSinceActive,
      dormancyScore,
    };
  }

  /**
   * BULK DETECT
   * Check multiple tokens for dormancy
   */
  async bulkDetectDormancy(
    tokens: Array<{ token: string; lastActivityTime: number }>
  ): Promise<DormancyToken[]> {
    const results: DormancyToken[] = [];

    for (const { token, lastActivityTime } of tokens) {
      const dormancy = await this.detectDormancy(token, lastActivityTime);
      if (dormancy) {
        results.push(dormancy);
      }
    }

    return results;
  }

  /**
   * GET DORMANCY CANDIDATES
   * Find tokens above dormancy threshold
   */
  async getDormancyCandidates(minScore: number = 50): Promise<DormancyToken[]> {
    const signals = runtimeState.getAllSignals();
    const candidates: DormancyToken[] = [];

    for (const signal of signals) {
      if (signal.status === 'SKIPPED' || signal.status === 'FILTERED') {
        const dormancy = await this.detectDormancy(
          signal.token,
          signal.detectedAt
        );
        if (dormancy && dormancy.dormancyScore >= minScore) {
          candidates.push(dormancy);
        }
      }
    }

    return candidates;
  }

  /**
   * ANALYZE DORMANCY
   * Extended analysis with market and holder data
   */
  async analyzeDormancy(
    token: string,
    marketData: any,
    holderData: any[]
  ): Promise<DormancyToken & { marketActivity: number; holderActivity: number }> {
    // Get base dormancy score
    const now = Date.now();
    const lastActivityTime = marketData?.lastUpdate || now - (90 * 24 * 60 * 60 * 1000); // Assume 90 days if no data
    
    const baseDormancy = await this.detectDormancy(token, lastActivityTime);
    
    // Calculate market activity (volume, price movement)
    const marketActivity = marketData?.volume ? 
      Math.min(100, (marketData.volume / 1000000) * 10) : 0;

    // Calculate holder activity (transaction count)
    const holderActivity = holderData?.length > 0 ? 
      Math.min(100, holderData.length * 5) : 0;

    return {
      ...(baseDormancy || {
        token,
        lastActivityTime,
        daysSinceActive: 90,
        dormancyScore: 70,
      }),
      marketActivity,
      holderActivity,
    };
  }
}

export const dormancyDetector = new DormancyDetector();
