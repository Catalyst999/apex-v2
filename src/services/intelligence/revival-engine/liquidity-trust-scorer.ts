// src/services/intelligence/revival-engine/liquidity-trust-scorer.ts
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';

export interface LiquidityTrust {
  token: string;
  trustScore: number; // 0-100
  lpStability: number;
  rugRiskScore: number;
  liquidityAge: number;
  lockStatus: string;
}

class LiquidityTrustScorer {
  async scoreLiquidityTrust(
    token: string,
    liquidityData: any,
  ): Promise<LiquidityTrust> {
    let trustScore = 50; // Baseline

    // LP age matters
    const lpAgeMinutes = (Date.now() - liquidityData.lpCreatedAt) / (1000 * 60);
    if (lpAgeMinutes > 1440) trustScore += 20; // >24h
    else if (lpAgeMinutes > 480) trustScore += 10; // >8h
    else trustScore -= 15; // Fresh LP = risk

    // LP stability (changes indicate manipulation risk)
    if (liquidityData.lpChanges && liquidityData.lpChanges.length > 0) {
      const recentChanges = liquidityData.lpChanges.filter(
        (c: any) => Date.now() - c.timestamp < 3600000, // Last hour
      );
      if (recentChanges.length > 3) trustScore -= 20; // Too many changes
    }

    // Rug risk assessment
    if (liquidityData.topLpPercent && liquidityData.topLpPercent < 50) {
      trustScore += 15; // Well distributed
    } else if (liquidityData.topLpPercent && liquidityData.topLpPercent > 80) {
      trustScore -= 25; // High concentration = rug risk
    }

    // Mint/freeze authority
    if (liquidityData.mintAuthority === null) trustScore += 10;
    if (liquidityData.freezeAuthority === null) trustScore += 10;

    const trust: LiquidityTrust = {
      token,
      trustScore: Math.max(0, Math.min(100, trustScore)),
      lpStability: liquidityData.lpStability || 50,
      rugRiskScore: 100 - Math.max(0, Math.min(100, trustScore)),
      liquidityAge: lpAgeMinutes,
      lockStatus: liquidityData.lpLocked ? 'LOCKED' : 'UNLOCKED',
    };

    if (trust.rugRiskScore > 70) {
      console.warn(`[LiquidityTrust] ⚠️ High rug risk: ${token}`);
    }

    return trust;
  }
}

export const liquidityTrustScorer = new LiquidityTrustScorer();