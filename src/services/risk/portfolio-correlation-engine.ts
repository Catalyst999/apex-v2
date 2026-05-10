// File path: src/services/risk/portfolio-correlation-engine.ts
/**
 * PORTFOLIO CORRELATION ENGINE
 * Detect and prevent correlated positions
 * Ensures true diversification
 */

import { positionManager } from '../execution/position-manager';

interface TokenCorrelation {
  token1: string;
  token2: string;
  correlation: number; // 0-100
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface CorrelationMatrix {
  timestamp: number;
  correlations: TokenCorrelation[];
  portfolioRisk: 'DIVERSIFIED' | 'CORRELATED' | 'HIGHLY_CORRELATED';
  recommendation: string;
}

class PortfolioCorrelationEngine {
  private correlationCache: Map<string, number> = new Map();

  /**
   * ANALYZE PORTFOLIO CORRELATION
   */
  analyzePortfolioCorrelation(): CorrelationMatrix {
    const positions = positionManager.getAllPositions();
    const correlations: TokenCorrelation[] = [];

    // Compare each pair
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const corr = this.estimateCorrelation(
          positions[i].token,
          positions[j].token,
          positions[i],
          positions[j],
        );

        correlations.push({
          token1: positions[i].token,
          token2: positions[j].token,
          correlation: corr,
          risk: corr > 75 ? 'HIGH' : corr > 50 ? 'MEDIUM' : 'LOW',
        });
      }
    }

    const highRiskCount = correlations.filter((c) => c.risk === 'HIGH').length;
    const avgCorrelation = correlations.length > 0 ? correlations.reduce((s, c) => s + c.correlation, 0) / correlations.length : 0;

    let portfolioRisk: 'DIVERSIFIED' | 'CORRELATED' | 'HIGHLY_CORRELATED' = 'DIVERSIFIED';
    if (highRiskCount > 2) {
      portfolioRisk = 'HIGHLY_CORRELATED';
    } else if (highRiskCount > 0) {
      portfolioRisk = 'CORRELATED';
    }

    const recommendation = this.generateRecommendation(portfolioRisk, highRiskCount, correlations);

    return {
      timestamp: Date.now(),
      correlations,
      portfolioRisk,
      recommendation,
    };
  }

  /**
   * ESTIMATE CORRELATION
   * Between two tokens
   */
  private estimateCorrelation(token1: string, token2: string, pos1: any, pos2: any): number {
    const cacheKey = `${token1}-${token2}`;
    if (this.correlationCache.has(cacheKey)) {
      return this.correlationCache.get(cacheKey)!;
    }

    // Factors that indicate correlation
    let score = 0;

    // Same narrative = high correlation
    if (pos1.narrative === pos2.narrative) {
      score += 60;
    }

    // Similar conviction = might be correlated
    const convictionDiff = Math.abs(pos1.conviction - pos2.conviction);
    score += Math.max(0, 50 - convictionDiff);

    // Same entry period = might move together
    const entryDiff = Math.abs(pos1.entryTime - pos2.entryTime);
    if (entryDiff < 60 * 60 * 1000) {
      // within 1 hour
      score += 30;
    }

    // Normalize
    const correlation = Math.min(100, score);
    this.correlationCache.set(cacheKey, correlation);

    return correlation;
  }

  /**
   * CAN ADD POSITION
   * Check if new position correlates
   */
  canAddPosition(newToken: string, narrative: string): boolean {
    const positions = positionManager.getAllPositions();

    const sameNarrative = positions.filter((p) => p.narrative === narrative);
    if (sameNarrative.length > 2) {
      console.warn(`[Correlation] Too many positions in ${narrative} narrative`);
      return false;
    }

    const correlations = this.analyzePortfolioCorrelation();
    const highRisk = correlations.correlations.filter((c) => c.risk === 'HIGH');
    if (highRisk.length > 3) {
      console.warn('[Correlation] Portfolio already highly correlated');
      return false;
    }

    return true;
  }

  /**
   * REDUCE CORRELATION
   * Suggest which position to close
   */
  suggestCorrelationReduction(): string | null {
    const correlations = this.analyzePortfolioCorrelation();

    // Find highest correlation pair
    const highestCorr = correlations.correlations
      .filter((c) => c.risk === 'HIGH')
      .sort((a, b) => b.correlation - a.correlation)[0];

    if (!highestCorr) return null;

    // Suggest closing smaller position
    const pos1 = positionManager.getAllPositions().find((p) => p.token === highestCorr.token1);
    const pos2 = positionManager.getAllPositions().find((p) => p.token === highestCorr.token2);

    if (!pos1 || !pos2) return null;

    return pos1.pnl < pos2.pnl ? pos1.token : pos2.token;
  }

  /**
   * GENERATE RECOMMENDATION
   */
  private generateRecommendation(
    risk: 'DIVERSIFIED' | 'CORRELATED' | 'HIGHLY_CORRELATED',
    highRiskCount: number,
    correlations: TokenCorrelation[],
  ): string {
    if (risk === 'HIGHLY_CORRELATED') {
      return `⚠️ CRITICAL: ${highRiskCount} highly correlated pairs found. Recommend closing smaller positions to reduce risk.`;
    } else if (risk === 'CORRELATED') {
      return `📊 CAUTION: ${highRiskCount} correlated pairs detected. Monitor position sizes.`;
    } else {
      return '✅ Portfolio is well-diversified. Continue current strategy.';
    }
  }

  /**
   * GET CORRELATION MATRIX
   */
  getCorrelationMatrix(): any[] {
    const correlations = this.analyzePortfolioCorrelation().correlations;

    return correlations.map((c) => ({
      tokens: `${c.token1} ↔ ${c.token2}`,
      correlation: c.correlation,
      risk: c.risk,
      riskEmoji: c.risk === 'HIGH' ? '🔴' : c.risk === 'MEDIUM' ? '🟡' : '🟢',
    }));
  }

  /**
   * CLEAR CACHE
   */
  clearCache(): void {
    this.correlationCache.clear();
  }
}

export const portfolioCorrelationEngine = new PortfolioCorrelationEngine();