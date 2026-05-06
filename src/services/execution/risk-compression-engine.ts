// File path: src/services/execution/risk-compression-engine.ts
/**
 * RISK COMPRESSION ENGINE
 * Portfolio-wide risk management
 * Prevents over-leverage, correlated exposure
 */

import { runtimeState } from '../../core/state/runtime-state';
import { positionManager } from './position-manager';

interface PortfolioRiskMetrics {
  totalExposure: number; // % of wallet
  concentrationRisk: number; // largest position %
  leverageRisk: number; // total leverage
  correlationRisk: number; // token correlation
  maximumRiskPercent: number; // max allowable
  isHealthy: boolean;
  recommendations: string[];
}

class RiskCompressionEngine {
  private maxPortfolioExposure = 80; // max 80% of wallet exposed
  private maxSinglePosition = 30; // max 30% in one position
  private maxTotalLeverage = 5; // max 5x combined leverage

  /**
   * ASSESS PORTFOLIO RISK
   */
  assessPortfolioRisk(walletId: string): PortfolioRiskMetrics {
    const positions = positionManager.getWalletPositions(walletId);
    const wallet = runtimeState.getWallet(walletId);

    if (!wallet || positions.length === 0) {
      return {
        totalExposure: 0,
        concentrationRisk: 0,
        leverageRisk: 0,
        correlationRisk: 0,
        maximumRiskPercent: this.maxPortfolioExposure,
        isHealthy: true,
        recommendations: [],
      };
    }

    // Calculate metrics
    const totalExposure = positions.reduce((sum, p) => sum + (p.positionSize * p.leverage) / 100, 0);
    const exposurePercent = totalExposure;
    const concentrationRisk = Math.max(...positions.map((p) => (p.positionSize / 100)));
    const leverageRisk = positions.reduce((sum, p) => sum + p.leverage, 0) / positions.length;
    const correlationRisk = this.calculateCorrelationRisk(positions);

    const isHealthy =
      exposurePercent <= this.maxPortfolioExposure &&
      concentrationRisk <= this.maxSinglePosition &&
      leverageRisk <= this.maxTotalLeverage;

    const recommendations = this.generateRecommendations(
      exposurePercent,
      concentrationRisk,
      leverageRisk,
      positions,
    );

    return {
      totalExposure: exposurePercent,
      concentrationRisk,
      leverageRisk,
      correlationRisk,
      maximumRiskPercent: this.maxPortfolioExposure,
      isHealthy,
      recommendations,
    };
  }

  /**
   * CALCULATE CORRELATION RISK
   * Are positions moving together?
   */
  private calculateCorrelationRisk(positions: any[]): number {
    // Placeholder - in production would calculate actual correlation
    // Returns 0-100 score
    return Math.random() * 50;
  }

  /**
   * GENERATE RECOMMENDATIONS
   */
  private generateRecommendations(
    exposure: number,
    concentration: number,
    leverage: number,
    positions: any[],
  ): string[] {
    const recs: string[] = [];

    if (exposure > this.maxPortfolioExposure) {
      recs.push(
        `⚠️ Portfolio exposure ${exposure.toFixed(0)}% exceeds ${this.maxPortfolioExposure}% limit`,
      );
    }

    if (concentration > this.maxSinglePosition) {
      recs.push(
        `⚠️ Largest position ${concentration.toFixed(0)}% exceeds ${this.maxSinglePosition}% limit`,
      );
    }

    if (leverage > this.maxTotalLeverage) {
      recs.push(
        `⚠️ Average leverage ${leverage.toFixed(1)}x exceeds ${this.maxTotalLeverage}x limit`,
      );
    }

    if (positions.length > 5) {
      recs.push('📊 Consider consolidating positions (currently ${positions.length})');
    }

    return recs;
  }

  /**
   * CAN OPEN NEW POSITION
   * Check if portfolio has room
   */
  canOpenPosition(walletId: string, requestedExposure: number): boolean {
    const risk = this.assessPortfolioRisk(walletId);
    return risk.totalExposure + requestedExposure <= this.maxPortfolioExposure && !risk.recommendations.length;
  }

  /**
   * GET MAXIMUM POSITION SIZE
   * What's the biggest position allowed?
   */
  getMaximumPositionSize(walletId: string): number {
    const wallet = runtimeState.getWallet(walletId);
    if (!wallet) return 0;

    const risk = this.assessPortfolioRisk(walletId);
    const remaining = this.maxPortfolioExposure - risk.totalExposure;

    return Math.min(this.maxSinglePosition, remaining);
  }

  /**
   * STRESS TEST
   * What if market crashes 20%?
   */
  stressTest(positions: any[]): {
    scenario: string;
    portfolioPnL: number;
    wouldTriggerStops: string[];
  } {
    const wouldTriggerStops: string[] = [];
    let totalPnL = 0;

    for (const pos of positions) {
      const crashedPrice = pos.currentPrice * 0.8; // 20% drop
      const positionPnL = (crashedPrice - pos.entryPrice) * pos.positionSize;
      totalPnL += positionPnL;

      if (crashedPrice <= pos.stopLoss) {
        wouldTriggerStops.push(pos.token);
      }
    }

    return {
      scenario: '20% market crash',
      portfolioPnL: totalPnL,
      wouldTriggerStops,
    };
  }
}

export const riskCompressionEngine = new RiskCompressionEngine();