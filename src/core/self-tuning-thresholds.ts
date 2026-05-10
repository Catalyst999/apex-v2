/**
 * SELF-TUNING THRESHOLDS
 * Static thresholds are WRONG
 * 
 * Problem:
 *   - Market hot: lots of signals, low conviction is ok
 *   - Market dead: few signals, need high conviction
 * 
 * Solution: Thresholds adapt to current conditions
 */

export interface ThresholdSet {
  minConviction: number; // 0-100
  minROI: number; // % expected return
  maxHoldTime: number; // milliseconds
  maxConcurrentPositions: number;
  maxExposurePercent: number;
  maxSinglePositionPercent: number;
}

export interface ThresholdMetrics {
  marketActivity: number; // 0-100
  signalFrequency: number; // signals per minute
  successRate: number; // % of recent trades profitable
  volatility: number; // 0-100
}

class SelfTuningThresholds {
  private baselineThresholds: ThresholdSet = {
    minConviction: 65,
    minROI: 10,
    maxHoldTime: 60 * 60 * 1000, // 1 hour
    maxConcurrentPositions: 5,
    maxExposurePercent: 50,
    maxSinglePositionPercent: 20,
  };

  private currentThresholds: ThresholdSet = { ...this.baselineThresholds };

  /**
   * UPDATE THRESHOLDS
   * Called periodically (every 5 min)
   */
  updateThresholds(metrics: ThresholdMetrics): void {
    // Calculate adjustment factors
    const activityFactor = metrics.marketActivity / 100; // 0-1
    const volatilityFactor = Math.max(0.5, 1 - metrics.volatility / 100); // 0.5 - 1

    // When market is very active: loosen conviction
    // When market is dead: tighten conviction
    this.currentThresholds.minConviction = Math.round(
      this.baselineThresholds.minConviction * (1.5 - activityFactor * 0.5), // range: 65-97
    );

    // Adjust position limits based on success rate
    // If we're losing: reduce size
    // If we're winning: increase size
    const successAdjustment = (metrics.successRate / 50 - 1) * 0.5; // -0.5 to 0.5
    this.currentThresholds.maxExposurePercent = Math.round(
      Math.max(20, Math.min(80, this.baselineThresholds.maxExposurePercent * (1 + successAdjustment))),
    );

    // When volatile: tighten everything
    this.currentThresholds.maxHoldTime = Math.round(
      this.baselineThresholds.maxHoldTime * volatilityFactor,
    );

    // Adjust concurrent positions based on signal frequency
    // High frequency: allow more positions
    // Low frequency: focus on best setups
    const concurrentAdjustment = Math.min(1, metrics.signalFrequency / 2); // 0 if < 2/min
    this.currentThresholds.maxConcurrentPositions = Math.round(
      this.baselineThresholds.maxConcurrentPositions * (0.5 + concurrentAdjustment * 0.5),
    );
  }

  /**
   * GET CURRENT THRESHOLDS
   */
  getCurrentThresholds(): ThresholdSet {
    return { ...this.currentThresholds };
  }

  /**
   * CHECK SIGNAL PASSES THRESHOLD
   */
  passesThreshold(conviction: number, roi: number, holdTime: number): { passes: boolean; failReasons: string[] } {
    const failures: string[] = [];

    if (conviction < this.currentThresholds.minConviction) {
      failures.push(`Conviction ${conviction} < ${this.currentThresholds.minConviction}`);
    }

    if (roi < this.currentThresholds.minROI) {
      failures.push(`ROI ${roi.toFixed(1)}% < ${this.currentThresholds.minROI}%`);
    }

    if (holdTime > this.currentThresholds.maxHoldTime) {
      failures.push(`Hold time ${(holdTime / 60000).toFixed(0)}m > ${(this.currentThresholds.maxHoldTime / 60000).toFixed(0)}m`);
    }

    return {
      passes: failures.length === 0,
      failReasons: failures,
    };
  }

  /**
   * GET THRESHOLD CHANGES
   */
  getThresholdChanges(): Record<string, { baseline: number; current: number; change: string }> {
    return {
      minConviction: {
        baseline: this.baselineThresholds.minConviction,
        current: this.currentThresholds.minConviction,
        change: `${((this.currentThresholds.minConviction / this.baselineThresholds.minConviction - 1) * 100).toFixed(0)}%`,
      },
      maxExposure: {
        baseline: this.baselineThresholds.maxExposurePercent,
        current: this.currentThresholds.maxExposurePercent,
        change: `${((this.currentThresholds.maxExposurePercent / this.baselineThresholds.maxExposurePercent - 1) * 100).toFixed(0)}%`,
      },
      maxHoldTime: {
        baseline: this.baselineThresholds.maxHoldTime,
        current: this.currentThresholds.maxHoldTime,
        change: `${((this.currentThresholds.maxHoldTime / this.baselineThresholds.maxHoldTime - 1) * 100).toFixed(0)}%`,
      },
    };
  }

  /**
   * RESET TO BASELINE
   */
  resetToBaseline(): void {
    this.currentThresholds = { ...this.baselineThresholds };
  }
}

export const selfTuningThresholds = new SelfTuningThresholds();