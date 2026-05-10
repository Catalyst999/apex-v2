/**
 * TIME-TO-FAILURE ANALYSIS
 * Elite traders know: how long does a bad play last?
 * This changes: stop placement, scaling, conviction
 */

export interface FailurePattern {
  type: string; // 'fake_runner', 'bagholder_trap', 'sandwich', 'rug'
  avgTimeToFailure: number; // milliseconds
  failureSignatures: string[];
  stopLoss: {
    tight: number; // % below entry
    medium: number;
    loose: number;
  };
  holdTime: {
    min: number;
    max: number;
    safe: number;
  };
}

const FAILURE_PATTERNS: Record<string, FailurePattern> = {
  fake_runner: {
    type: 'fake_runner',
    avgTimeToFailure: 6 * 60 * 1000, // 6 minutes
    failureSignatures: ['rapid dump', 'volume cliff', 'whale exit'],
    stopLoss: {
      tight: 3,
      medium: 5,
      loose: 8,
    },
    holdTime: {
      min: 30000,
      max: 360000, // 6 min
      safe: 120000, // 2 min
    },
  },

  strong_runner: {
    type: 'strong_runner',
    avgTimeToFailure: 45 * 60 * 1000, // 45 minutes
    failureSignatures: ['stabilization', 'volume decline', 'holder growth'],
    stopLoss: {
      tight: 8,
      medium: 12,
      loose: 15,
    },
    holdTime: {
      min: 300000,
      max: 2700000, // 45 min
      safe: 900000, // 15 min
    },
  },

  bagholder_trap: {
    type: 'bagholder_trap',
    avgTimeToFailure: 15 * 60 * 1000, // 15 minutes
    failureSignatures: ['fake volume', 'holder pump', 'influencer silence'],
    stopLoss: {
      tight: 2,
      medium: 4,
      loose: 6,
    },
    holdTime: {
      min: 60000,
      max: 900000, // 15 min
      safe: 180000, // 3 min
    },
  },

  sandwich: {
    type: 'sandwich',
    avgTimeToFailure: 2 * 60 * 1000, // 2 minutes
    failureSignatures: ['instant spike', 'instant dump', 'liquidation'],
    stopLoss: {
      tight: 1,
      medium: 2,
      loose: 3,
    },
    holdTime: {
      min: 10000,
      max: 120000, // 2 min
      safe: 30000, // 30 sec
    },
  },
};

class TimeToFailureAnalyzer {
  private tradeHistory: Array<{
    token: string;
    entryPrice: number;
    peakPrice: number;
    failurePrice: number;
    failureTime: number;
    pattern: string;
    signals: string[];
  }> = [];

  /**
   * ANALYZE TRADE FOR PATTERN
   */
  analyzeTradePattern(
    token: string,
    entryPrice: number,
    currentPrice: number,
    priceHistory: number[],
    volume: number[],
    holdTime: number,
    signals: string[],
  ): { pattern: string; riskLevel: 'low' | 'medium' | 'high' | 'extreme'; timeToFailure: number } {
    let bestPattern = 'unknown';
    let bestScore = 0;

    for (const [patternName, pattern] of Object.entries(FAILURE_PATTERNS)) {
      const score = this.scorePattern(pattern, priceHistory, volume, holdTime, signals);

      if (score > bestScore) {
        bestScore = score;
        bestPattern = patternName;
      }
    }

    const pattern = FAILURE_PATTERNS[bestPattern];
    const timeToFailure = pattern ? pattern.avgTimeToFailure : 30 * 60 * 1000;

    // Risk level based on time remaining
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    const timeRemaining = timeToFailure - holdTime;

    if (timeRemaining < 60000) riskLevel = 'extreme'; // < 1 min left
    else if (timeRemaining < 300000) riskLevel = 'high'; // < 5 min
    else if (timeRemaining < 900000) riskLevel = 'medium'; // < 15 min
    else riskLevel = 'low';

    return {
      pattern: bestPattern,
      riskLevel,
      timeToFailure,
    };
  }

  /**
   * SCORE PATTERN MATCH
   */
  private scorePattern(
    pattern: FailurePattern,
    priceHistory: number[],
    volume: number[],
    holdTime: number,
    signals: string[],
  ): number {
    let score = 0;

    // Check signature presence
    for (const sig of pattern.failureSignatures) {
      if (signals.includes(sig)) {
        score += 30;
      }
    }

    // Check hold time match
    if (holdTime >= pattern.holdTime.min && holdTime <= pattern.holdTime.max) {
      score += 40;
    } else if (holdTime > pattern.holdTime.max) {
      score += 10; // partial match
    }

    // Check price volatility pattern
    if (priceHistory.length > 5) {
      const recentVolatility = this.calculateVolatility(priceHistory.slice(-5));
      const expectedVolatility = pattern.type === 'fake_runner' ? 'high' : 'medium';

      if ((expectedVolatility === 'high' && recentVolatility > 5) || (expectedVolatility === 'medium' && recentVolatility > 3)) {
        score += 30;
      }
    }

    return Math.min(100, score);
  }

  /**
   * GET FAILURE PATTERN
   */
  getFailurePattern(pattern: string): FailurePattern | null {
    return FAILURE_PATTERNS[pattern] || null;
  }

  /**
   * RECOMMENDED STOP PLACEMENT
   * Based on identified pattern
   */
  getRecommendedStop(
    pattern: string,
    entryPrice: number,
    riskLevel: 'low' | 'medium' | 'high' | 'extreme',
  ): number {
    const patternData = FAILURE_PATTERNS[pattern];
    if (!patternData) return entryPrice * 0.97; // default: 3%

    let stopPercent = patternData.stopLoss.medium;

    if (riskLevel === 'extreme' || riskLevel === 'high') {
      stopPercent = patternData.stopLoss.tight;
    } else if (riskLevel === 'low') {
      stopPercent = patternData.stopLoss.loose;
    }

    return entryPrice * (1 - stopPercent / 100);
  }

  /**
   * LOG TRADE OUTCOME
   */
  logTradeOutcome(
    token: string,
    entryPrice: number,
    peakPrice: number,
    failurePrice: number,
    failureTime: number,
    pattern: string,
    signals: string[],
  ): void {
    this.tradeHistory.push({
      token,
      entryPrice,
      peakPrice,
      failurePrice,
      failureTime,
      pattern,
      signals,
    });
  }

  /**
   * CALCULATE VOLATILITY
   */
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;

    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
      changes.push(change);
    }

    return changes.reduce((a, b) => a + b) / changes.length;
  }

  /**
   * GET PATTERN STATISTICS
   */
  getPatternStats(pattern: string) {
    const matches = this.tradeHistory.filter((t) => t.pattern === pattern);

    if (matches.length === 0) return null;

    const avgFailureTime = matches.reduce((sum, t) => sum + t.failureTime, 0) / matches.length;
    const successRate = matches.filter((t) => t.peakPrice > t.entryPrice).length / matches.length;

    return {
      pattern,
      occurrences: matches.length,
      avgFailureTime,
      successRate: (successRate * 100).toFixed(1) + '%',
    };
  }
}

export const timeToFailureAnalyzer = new TimeToFailureAnalyzer();