// File path: src/services/risk/drawdown-tracker.ts
/**
 * DRAWDOWN TRACKER
 * Monitor maximum portfolio drawdown
 * Critical risk metric for trading
 */

import { supabase } from '../../core/db/supabase';
import { runtimeState } from '../../core/state/runtime-state';

interface DrawdownEvent {
  timestamp: number;
  peakValue: number;
  troughValue: number;
  drawdownPercent: number;
  recoveryDays?: number;
  recoveredAt?: number;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE' | 'CATASTROPHIC';
}

class DrawdownTracker {
  private peakPortfolioValue = 0;
  private currentDrawdown = 0;
  private maxDrawdown = 0;
  private drawdownEvents: DrawdownEvent[] = [];
  private alerts: string[] = [];

  /**
   * UPDATE WITH CURRENT VALUE
   */
  updatePortfolioValue(currentValue: number): void {
    // Update peak
    if (currentValue > this.peakPortfolioValue) {
      this.peakPortfolioValue = currentValue;
    }

    // Calculate current drawdown
    const drawdownPercent = ((this.peakPortfolioValue - currentValue) / this.peakPortfolioValue) * 100;
    this.currentDrawdown = drawdownPercent;

    // Track max
    if (drawdownPercent > this.maxDrawdown) {
      this.maxDrawdown = drawdownPercent;
    }

    // Check thresholds
    this.checkDrawdownAlerts(drawdownPercent);
  }

  /**
   * CHECK ALERTS
   */
  private checkDrawdownAlerts(currentDD: number): void {
    this.alerts = [];

    if (currentDD > 30) {
      this.alerts.push('🔴 CRITICAL: Drawdown exceeds 30%');
    } else if (currentDD > 20) {
      this.alerts.push('🟠 SEVERE: Drawdown exceeds 20%');
    } else if (currentDD > 10) {
      this.alerts.push('🟡 WARNING: Drawdown exceeds 10%');
    }
  }

  /**
   * RECORD DRAWDOWN EVENT
   */
  recordDrawdownEvent(troughValue: number): DrawdownEvent {
    const drawdownPercent = ((this.peakPortfolioValue - troughValue) / this.peakPortfolioValue) * 100;

    let severity: 'MINOR' | 'MODERATE' | 'SEVERE' | 'CATASTROPHIC';
    if (drawdownPercent > 30) severity = 'CATASTROPHIC';
    else if (drawdownPercent > 20) severity = 'SEVERE';
    else if (drawdownPercent > 10) severity = 'MODERATE';
    else severity = 'MINOR';

    const event: DrawdownEvent = {
      timestamp: Date.now(),
      peakValue: this.peakPortfolioValue,
      troughValue,
      drawdownPercent,
      severity,
    };

    this.drawdownEvents.push(event);
    console.log(`[DrawdownTracker] DD Event: ${drawdownPercent.toFixed(2)}% (${severity})`);

    return event;
  }

  /**
   * MARK RECOVERY
   */
  markRecovery(recoveredValue: number): void {
    if (this.drawdownEvents.length === 0) return;

    const lastDD = this.drawdownEvents[this.drawdownEvents.length - 1];
    if (!lastDD.recoveredAt) {
      lastDD.recoveredAt = Date.now();
      lastDD.recoveryDays = Math.floor((lastDD.recoveredAt - lastDD.timestamp) / (24 * 60 * 60 * 1000));

      console.log(
        `[DrawdownTracker] Recovered in ${lastDD.recoveryDays} days from ${lastDD.drawdownPercent.toFixed(2)}%`,
      );
    }
  }

  /**
   * GET CURRENT METRICS
   */
  getCurrentMetrics() {
    return {
      peakPortfolioValue: this.peakPortfolioValue,
      currentDrawdown: this.currentDrawdown,
      maxDrawdown: this.maxDrawdown,
      alerts: this.alerts,
      isInDrawdown: this.currentDrawdown > 0,
      severity:
        this.currentDrawdown > 30
          ? 'CATASTROPHIC'
          : this.currentDrawdown > 20
            ? 'SEVERE'
            : this.currentDrawdown > 10
              ? 'MODERATE'
              : 'MINOR',
    };
  }

  /**
   * GET DRAWDOWN HISTORY
   */
  getDrawdownHistory(limit: number = 10) {
    return this.drawdownEvents
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * AVERAGE RECOVERY TIME
   */
  getAverageRecoveryTime(): number {
    const recovered = this.drawdownEvents.filter((e) => e.recoveryDays);
    if (recovered.length === 0) return 0;
    return recovered.reduce((sum, e) => sum + (e.recoveryDays || 0), 0) / recovered.length;
  }

  /**
   * WORST DRAWDOWN
   */
  getWorstDrawdown(): DrawdownEvent | null {
    return this.drawdownEvents.reduce((worst, current) =>
      current.drawdownPercent > worst.drawdownPercent ? current : worst,
    ) || null;
  }

  /**
   * SHOULD PAUSE TRADING
   * Based on drawdown severity
   */
  shouldPauseTrading(): boolean {
    return this.currentDrawdown > 25; // Pause at 25% DD
  }
}

export const drawdownTracker = new DrawdownTracker();