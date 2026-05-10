/**
 * ASYMMETRIC ENTRY ENGINE
 * This is the key difference between pros and retail
 * 
 * Retail thinks: "highest probability win"
 * Pros think: "small downside, massive upside"
 * 
 * Example:
 * - Retail: 80% win prob, 1.5x upside = pass
 * - Pro: 15% win prob, 120x upside = PERFECT
 */

export interface AsymmetricOpportunity {
  token: string;
  entryPrice: number;
  stopLoss: number;
  profitTarget: number;

  // Asymmetry metrics
  downside: number; // % to stop loss
  upside: number; // % to profit target
  riskRewardRatio: number; // upside / downside
  asymmetryScore: number; // 0-100, how asymmetric?

  // Probability (estimated)
  winProbability: number; // 0-100
  expectedValue: number; // (prob * upside) - ((1-prob) * downside)

  // Classification
  isAsymmetric: boolean;
  asymmetryType: 'extreme_edge' | 'strong_edge' | 'slight_edge' | 'balanced' | 'risky_symmetric';
}

class AsymmetricEntryEngine {
  /**
   * EVALUATE ENTRY FOR ASYMMETRY
   */
  evaluateAsymmetry(
    token: string,
    entryPrice: number,
    stopLoss: number,
    profitTarget: number,
    estimatedWinProbability: number,
  ): AsymmetricOpportunity {
    const downside = Math.abs((stopLoss - entryPrice) / entryPrice) * 100;
    const upside = Math.abs((profitTarget - entryPrice) / entryPrice) * 100;

    const riskRewardRatio = downside > 0 ? upside / downside : 0;

    // Asymmetry score: how skewed to the upside?
    // Formula: (upside - downside) normalized
    const asymmetryScore = Math.min(100, Math.max(0, ((upside - downside) / upside) * 100));

    // Calculate expected value
    // EV = (prob of win * upside) - (prob of loss * downside)
    const probWin = estimatedWinProbability / 100;
    const probLoss = 1 - probWin;
    const expectedValue = probWin * upside - probLoss * downside;

    // Classify
    let isAsymmetric = false;
    let asymmetryType: 'extreme_edge' | 'strong_edge' | 'slight_edge' | 'balanced' | 'risky_symmetric';

    if (riskRewardRatio >= 5) {
      isAsymmetric = true;
      asymmetryType = 'extreme_edge';
    } else if (riskRewardRatio >= 3) {
      isAsymmetric = true;
      asymmetryType = 'strong_edge';
    } else if (riskRewardRatio >= 1.5) {
      isAsymmetric = true;
      asymmetryType = 'slight_edge';
    } else if (riskRewardRatio >= 0.8 && riskRewardRatio < 1.2) {
      asymmetryType = 'balanced';
    } else {
      asymmetryType = 'risky_symmetric';
    }

    return {
      token,
      entryPrice,
      stopLoss,
      profitTarget,
      downside,
      upside,
      riskRewardRatio,
      asymmetryScore,
      winProbability: estimatedWinProbability,
      expectedValue,
      isAsymmetric,
      asymmetryType,
    };
  }

  /**
   * RANK OPPORTUNITIES BY ASYMMETRY
   */
  rankByAsymmetry(opportunities: AsymmetricOpportunity[]): AsymmetricOpportunity[] {
    return opportunities.sort((a, b) => {
      // Sort by risk/reward ratio (higher is better)
      if (a.riskRewardRatio !== b.riskRewardRatio) {
        return b.riskRewardRatio - a.riskRewardRatio;
      }

      // Tiebreaker: expected value
      return b.expectedValue - a.expectedValue;
    });
  }

  /**
   * SHOULD ENTER TRADE?
   * Returns true if asymmetry is favorable
   */
  shouldEnterTrade(opp: AsymmetricOpportunity, minRiskReward: number = 2): { should: boolean; reason: string; confidence: number } {
    // Must have at least some asymmetry
    if (!opp.isAsymmetric) {
      return {
        should: false,
        reason: `Low asymmetry: R:R = ${opp.riskRewardRatio.toFixed(2)}:1`,
        confidence: 0.2,
      };
    }

    // Risk/reward must exceed minimum
    if (opp.riskRewardRatio < minRiskReward) {
      return {
        should: false,
        reason: `Risk/reward below threshold: ${opp.riskRewardRatio.toFixed(2)} < ${minRiskReward}`,
        confidence: 0.3,
      };
    }

    // Expected value should be positive
    if (opp.expectedValue < 0) {
      return {
        should: false,
        reason: `Negative expected value: ${opp.expectedValue.toFixed(2)}%`,
        confidence: 0.4,
      };
    }

    // Go for asymmetric trades even with low win probability
    const confidence = Math.min(1, (opp.riskRewardRatio / 5) * 0.7 + (opp.expectedValue / 50) * 0.3);

    return {
      should: true,
      reason: `Asymmetric edge: ${opp.riskRewardRatio.toFixed(1)}:1, EV: ${opp.expectedValue.toFixed(1)}%`,
      confidence,
    };
  }

  /**
   * COMPARE OPPORTUNITIES
   * "Is this better than that?"
   */
  compare(opp1: AsymmetricOpportunity, opp2: AsymmetricOpportunity): string {
    const score1 = opp1.riskRewardRatio * (opp1.winProbability / 100);
    const score2 = opp2.riskRewardRatio * (opp2.winProbability / 100);

    if (Math.abs(score1 - score2) < 0.1) {
      return `Equivalent opportunities`;
    }

    return score1 > score2
      ? `${opp1.token} is better (${score1.toFixed(2)} vs ${score2.toFixed(2)})`
      : `${opp2.token} is better (${score2.toFixed(2)} vs ${score1.toFixed(2)})`;
  }

  /**
   * MENTAL FRAMEWORK
   */
  getMentalFramework(): string {
    return `
    ASYMMETRIC ENTRY FRAMEWORK
    
    What most traders see:
    - "80% win rate, 1.5x upside"
    - Decision: PASS
    
    What asymmetric traders see:
    - "10% win rate, 150x upside"
    - EV: (0.1 * 150) - (0.9 * 5) = 15 - 4.5 = +10.5%
    - Decision: SIZE UP
    
    The difference: thinking in EV, not probability
    
    Expected Value = (P(win) * upside) - (P(loss) * downside)
    
    High probability + low upside = poor trade
    Low probability + high upside = asymmetric gem
    
    You only need ONE right asymmetric trade per day
    to make outsized returns.
    `;
  }
}

export const asymmetricEntryEngine = new AsymmetricEntryEngine();