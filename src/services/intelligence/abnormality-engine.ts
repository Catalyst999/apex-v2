/**
 * ABNORMALITY ENGINE
 * The market pays for abnormality, not normal patterns
 * Find: what behavior is statistically weird?
 */

export interface AbnormalityScore {
  token: string;
  overallScore: number; // 0-100
  components: {
    walletClustering: number;
    holderRetention: number;
    liquidityStickiness: number;
    socialAcceleration: number;
    volumeAttentionRatio: number;
  };
  abnormalities: string[];
  severity: 'low' | 'medium' | 'high' | 'extreme';
  confidence: number;
}

class AbnormalityEngine {
  private baselineMetrics = {
    walletClustering: 0.5,
    holderRetention: 0.6,
    liquidityStickiness: 0.4,
    socialVelocity: 0.3,
    volumeAttentionRatio: 0.5,
  };

  /**
   * ABNORMAL WALLET CLUSTERING
   * Same wallets buying repeatedly (sign of coordination)
   */
  analyzeWalletClustering(walletActivity: Map<string, number>): { score: number; abnormal: boolean; reason: string } {
    if (walletActivity.size === 0) return { score: 0, abnormal: false, reason: 'No wallet data' };

    // Calculate concentration: how many of buys come from top wallets
    const sorted = Array.from(walletActivity.values()).sort((a, b) => b - a);
    const top5Percent = Math.ceil(sorted.length * 0.05);
    const top5Share = sorted.slice(0, Math.max(1, top5Percent)).reduce((a, b) => a + b, 0);
    const totalBuys = sorted.reduce((a, b) => a + b, 0);
    const concentration = totalBuys > 0 ? top5Share / totalBuys : 0;

    // Normal: top 5% wallets account for 30-40% of volume
    // Abnormal: top 5% accounts for >60% (coordinated buying)
    const abnormal = concentration > 0.6;
    const score = Math.min(100, concentration * 100);

    return {
      score,
      abnormal,
      reason: `Top 5% wallets: ${(concentration * 100).toFixed(0)}% of volume${abnormal ? ' (ABNORMAL)' : ''}`,
    };
  }

  /**
   * ABNORMAL HOLDER RETENTION
   * Holders not selling = bag holding or conviction
   */
  analyzeHolderRetention(
    holderGrowth: number,
    sellingPressure: number,
    churn: number,
  ): { score: number; abnormal: boolean; reason: string } {
    // Normal: holders grow but some sell (5-15% churn)
    // Abnormal: high growth + low churn (strong hands) OR high growth + high sell (bagholder fomo)

    const retentionRate = 1 - churn;

    // Strong hands pattern: growth + low churn
    const strongHands = holderGrowth > 0.1 && churn < 0.05;

    // Bagholder pattern: growth + high selling pressure
    const bagholder = holderGrowth > 0.15 && sellingPressure > 0.7;

    const abnormal = strongHands || bagholder;
    const score = abnormal ? 75 : Math.max(0, retentionRate * 60);

    return {
      score,
      abnormal,
      reason: strongHands ? 'Strong hands detected' : bagholder ? 'Bagholder pattern' : 'Normal retention',
    };
  }

  /**
   * ABNORMAL LIQUIDITY STICKINESS
   * Liquidity staying in despite volatile price
   */
  analyzeLiquidityStickiness(
    liquidityDepth: number,
    priceVolatility: number,
    liquidityMigration: number,
  ): { score: number; abnormal: boolean; reason: string } {
    // Normal: liquidity decreases with volatility
    // Abnormal: high depth + high volatility (someone maintaining it)

    const stickiness = liquidityDepth / (priceVolatility + 1);
    const abnormal = stickiness > 2 && liquidityMigration < 0.1;
    const score = Math.min(100, stickiness * 20);

    return {
      score,
      abnormal,
      reason: abnormal ? 'Liquidity being maintained artificially' : 'Normal liquidity patterns',
    };
  }

  /**
   * ABNORMAL SOCIAL ACCELERATION
   * Social activity ramping faster than normal
   */
  analyzeSocialAcceleration(
    mentionVelocity: number, // mentions/hour
    influencerCount: number,
    influencerGrowth: number,
    engagementGrowth: number,
  ): { score: number; abnormal: boolean; reason: string } {
    // Normal: steady social growth
    // Abnormal: sudden spikes, influencer coordination, rapid growth

    const isSpike = influencerGrowth > 0.5; // 50%+ growth in influencers
    const isCoordinated = influencerCount > 20 && mentionVelocity > 500;
    const isAccelerating = engagementGrowth > 2; // 2x growth

    const abnormal = isSpike || isCoordinated || isAccelerating;
    const score = abnormal ? Math.min(100, (mentionVelocity / 100) * 50 + influencerGrowth * 50) : mentionVelocity * 5;

    return {
      score,
      abnormal,
      reason: isCoordinated ? 'Coordinated influencer activity' : isSpike ? 'Sudden influencer spike' : 'Normal social growth',
    };
  }

  /**
   * ABNORMAL VOLUME-TO-ATTENTION RATIO
   * Volume without corresponding attention = pump
   * Attention without volume = hype
   */
  analyzeVolumeAttentionRatio(
    volume: number,
    socialMentions: number,
    holderCount: number,
  ): { score: number; abnormal: boolean; reason: string } {
    // Normalize both to 0-1
    const volumeScore = Math.min(1, volume / 10000000); // 10M = normalized 1
    const attentionScore = Math.min(1, (socialMentions + holderCount) / 1000);

    const ratio = volumeScore / Math.max(0.1, attentionScore);

    // Abnormal if ratio is extreme in either direction
    const abnormal = ratio > 3 || ratio < 0.3; // 3x deviation = abnormal
    const score = abnormal ? Math.min(100, Math.abs(ratio - 1) * 33) : 20;

    const reason = ratio > 3 ? 'Volume without attention (pump)' : ratio < 0.3 ? 'Attention without volume (hype)' : 'Balanced';

    return { score, abnormal, reason };
  }

  /**
   * CALCULATE OVERALL ABNORMALITY
   */
  calculateAbnormality(
    walletActivity: Map<string, number>,
    holderGrowth: number,
    sellingPressure: number,
    churn: number,
    liquidityDepth: number,
    priceVolatility: number,
    liquidityMigration: number,
    mentionVelocity: number,
    influencerCount: number,
    influencerGrowth: number,
    engagementGrowth: number,
    volume: number,
    socialMentions: number,
    holderCount: number,
    token: string,
  ): AbnormalityScore {
    const walletScore = this.analyzeWalletClustering(walletActivity);
    const holderScore = this.analyzeHolderRetention(holderGrowth, sellingPressure, churn);
    const liquidityScore = this.analyzeLiquidityStickiness(liquidityDepth, priceVolatility, liquidityMigration);
    const socialScore = this.analyzeSocialAcceleration(mentionVelocity, influencerCount, influencerGrowth, engagementGrowth);
    const volumeScore = this.analyzeVolumeAttentionRatio(volume, socialMentions, holderCount);

    const scores = [walletScore.score, holderScore.score, liquidityScore.score, socialScore.score, volumeScore.score];
    const overallScore = scores.reduce((a, b) => a + b) / scores.length;

    const abnormalities: string[] = [];
    if (walletScore.abnormal) abnormalities.push(walletScore.reason);
    if (holderScore.abnormal) abnormalities.push(holderScore.reason);
    if (liquidityScore.abnormal) abnormalities.push(liquidityScore.reason);
    if (socialScore.abnormal) abnormalities.push(socialScore.reason);
    if (volumeScore.abnormal) abnormalities.push(volumeScore.reason);

    let severity: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    if (overallScore > 75) severity = 'extreme';
    else if (overallScore > 60) severity = 'high';
    else if (overallScore > 40) severity = 'medium';

    return {
      token,
      overallScore: Math.min(100, overallScore),
      components: {
        walletClustering: walletScore.score,
        holderRetention: holderScore.score,
        liquidityStickiness: liquidityScore.score,
        socialAcceleration: socialScore.score,
        volumeAttentionRatio: volumeScore.score,
      },
      abnormalities,
      severity,
      confidence: Math.min(1, abnormalities.length / 3), // more abnormalities = higher confidence
    };
  }

  /**
   * IS TRADE-WORTHY ABNORMALITY?
   * Some abnormalities are good (smart money accumulation)
   * Some are bad (pump and dump setup)
   */
  isTradeWorthyAbnormality(score: AbnormalityScore): { tradeable: boolean; reason: string; confidence: number } {
    if (score.severity === 'low') {
      return { tradeable: false, reason: 'Insufficient abnormality', confidence: 0.2 };
    }

    // Check for GOOD abnormalities (smart money signals)
    const hasSmartMoneySignals = score.abnormalities.some((a) => a.includes('Strong hands') || a.includes('maintained'));

    // Check for BAD abnormalities (dump setup)
    const hasDumpSignals = score.abnormalities.some((a) => a.includes('Bagholder') || a.includes('pump'));

    if (hasSmartMoneySignals && !hasDumpSignals) {
      return { tradeable: true, reason: 'Smart money accumulation pattern', confidence: 0.8 };
    }

    if (hasDumpSignals) {
      return { tradeable: false, reason: 'Dump/pump setup detected', confidence: 0.7 };
    }

    // Mixed signals = moderate tradability
    return { tradeable: true, reason: 'Abnormal but mixed signals', confidence: 0.5 };
  }
}

export const abnormalityEngine = new AbnormalityEngine();