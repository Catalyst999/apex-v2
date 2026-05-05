// File path: src/services/gateway/signal-gateway.ts
/**
 * SIGNAL GATEWAY
 * Deterministic pre-filter that blocks 70-80% of garbage tokens
 * ZERO AI usage - pure hardcoded logic
 * Only abnormal tokens reach intelligence modules
 */

import { supabase } from '../../core/db/supabase';
import { preFilterRules, DEFAULT_CONFIG } from './pre-filter-rules';
import { emit } from '../events/event-bus';
import { v4 as uuidv4 } from 'uuid';

export interface GatewayDecision {
  id: string;
  token: string;
  passed: boolean;
  reason: string;
  failureReasons: string[];
  abnormalityScore: number;
  severity: 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL';
  timestamp: number;
}

class SignalGateway {
  private decisionLog: GatewayDecision[] = [];
  private passedTokens = new Set<string>();
  private blockedTokens = new Set<string>();

  /**
   * Main entry point: Should token reach intelligence?
   */
  async shouldAnalyze(token: any): Promise<GatewayDecision> {
    const decisionId = uuidv4();

    // Run pre-filter checks
    const filterResult = preFilterRules.runAllChecks(token);

    // Calculate abnormality score (higher = more unusual)
    const abnormalityScore = this.calculateAbnormalityScore(token, filterResult);

    // Make decision
    const decision: GatewayDecision = {
      id: decisionId,
      token: token.address || token.mint || 'unknown',
      passed: filterResult.passed,
      reason: filterResult.passed ? 'Passed all checks' : `Failed ${filterResult.failureCount} checks`,
      failureReasons: filterResult.checks
        .filter((c) => !c.result.passed)
        .map((c) => c.result.reason),
      abnormalityScore,
      severity: this.determineSeverity(filterResult),
      timestamp: Date.now(),
    };

    // Track decision
    this.decisionLog.push(decision);
    if (decision.passed) {
      this.passedTokens.add(decision.token);
    } else {
      this.blockedTokens.add(decision.token);
    }

    // Log to database
    await this.logDecision(decision);

    // Emit event
    if (decision.passed) {
      await emit({
        type: 'TOKEN_DETECTED',
        token: decision.token,
        mint: token.mint || decision.token,
        name: token.name || 'unknown',
        symbol: token.symbol || '???',
        timestamp: decision.timestamp,
        source: 'signal_gateway',
      });
    }

    console.log(
      `[Gateway] ${decision.passed ? '✅ PASS' : '❌ BLOCK'}: ${decision.token} | ${decision.reason}`
    );

    return decision;
  }

  /**
   * Calculate abnormality score (0-100)
   * High score = unusual patterns = more interesting
   */
  private calculateAbnormalityScore(token: any, filterResult: any): number {
    let score = 50; // baseline

    // Positive signals (increase score)
    if ((token.volume?.m5 || 0) > DEFAULT_CONFIG.minVolumeM5USD * 5) score += 10;
    if ((token.holders?.count || 0) > DEFAULT_CONFIG.minHolderCount * 3) score += 8;
    if ((token.social?.mentions || 0) > 100) score += 12;
    if ((token.holders?.topPercent || 0) < 0.1) score += 5; // well distributed

    // Negative signals (decrease score)
    if ((token.priceChange?.m5 || 0) > 100) score -= 15; // too volatile
    if ((token.priceChange?.m5 || 0) < -20) score -= 10; // already dumping
    if (filterResult.failureCount > 0) score -= 5 * filterResult.failureCount;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine severity level
   */
  private determineSeverity(
    filterResult: any
  ): 'PASS' | 'SOFT_FAIL' | 'HARD_FAIL' {
    const checks = filterResult.checks;

    // Any HARD_FAIL = reject
    if (checks.some((c: any) => c.result.severity === 'HARD_FAIL' && !c.result.passed)) {
      return 'HARD_FAIL';
    }

    // Too many SOFT_FAILs = soft reject (borderline)
    const softFails = checks.filter((c: any) => c.result.severity === 'SOFT_FAIL' && !c.result.passed);
    if (softFails.length > 2) {
      return 'SOFT_FAIL';
    }

    return 'PASS';
  }

  /**
   * Log decision to database
   */
  private async logDecision(decision: GatewayDecision): Promise<void> {
    try {
      await supabase.from('gateway_decisions').insert({
        id: decision.id,
        token: decision.token,
        passed: decision.passed,
        reason: decision.reason,
        failure_reasons: decision.failureReasons,
        abnormality_score: decision.abnormalityScore,
        severity: decision.severity,
        created_at: new Date(decision.timestamp).toISOString(),
      });
    } catch (error) {
      console.warn('[Gateway] Could not log decision:', (error as Error).message);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalDecisions: number;
    passedCount: number;
    blockedCount: number;
    passRate: number;
    uniqueTokens: number;
  } {
    const total = this.decisionLog.length;
    const passed = this.passedTokens.size;
    const blocked = this.blockedTokens.size;

    return {
      totalDecisions: total,
      passedCount: passed,
      blockedCount: blocked,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      uniqueTokens: passed + blocked,
    };
  }

  /**
   * Get decision history
   */
  getHistory(limit: number = 50): GatewayDecision[] {
    return this.decisionLog.slice(-limit);
  }

  /**
   * Get passed tokens
   */
  getPassedTokens(): string[] {
    return Array.from(this.passedTokens);
  }

  /**
   * Get blocked tokens
   */
  getBlockedTokens(): string[] {
    return Array.from(this.blockedTokens);
  }

  /**
   * Clear decision log
   */
  clearLog(): void {
    this.decisionLog = [];
    this.passedTokens.clear();
    this.blockedTokens.clear();
  }
}

export const signalGateway = new SignalGateway();