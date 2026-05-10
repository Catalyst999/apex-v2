// File path: src/services/intelligence/ignition-engine.ts
/**
 * IGNITION ENGINE
 * Detect when attention is FORMING (pre-momentum)
 * Most powerful alpha: catch before breakout
 */

import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export interface IgnitionSignal {
  token: string;
  ignitionScore: number; // 0-100
  stages: {
    silentAccumulation: boolean;
    walletClustering: boolean;
    liquidityPrep: boolean;
    holderRetention: boolean;
    socialAcceleration: boolean;
  };
  estimatedBreakoutDays: number;
  confidence: number;
}

class IgnitionEngine {
  /**
   * DETECT IGNITION
   * Pre-momentum detection
   */
  detectIgnition(token: any): IgnitionSignal | null {
    const signal: IgnitionSignal = {
      token: token.symbol,
      ignitionScore: 0,
      stages: {
        silentAccumulation: false,
        walletClustering: false,
        liquidityPrep: false,
        holderRetention: false,
        socialAcceleration: false,
      },
      estimatedBreakoutDays: 0,
      confidence: 0,
    };

    // STAGE 1: Silent Accumulation
    if (this.detectSilentAccumulation(token)) {
      signal.stages.silentAccumulation = true;
      signal.ignitionScore += 20;
    }

    // STAGE 2: Wallet Clustering
    if (this.detectWalletClustering(token)) {
      signal.stages.walletClustering = true;
      signal.ignitionScore += 20;
    }

    // STAGE 3: Liquidity Preparation
    if (this.detectLiquidityPrep(token)) {
      signal.stages.liquidityPrep = true;
      signal.ignitionScore += 20;
    }

    // STAGE 4: Holder Retention
    if (this.detectHolderRetention(token)) {
      signal.stages.holderRetention = true;
      signal.ignitionScore += 20;
    }

    // STAGE 5: Social Acceleration
    if (this.detectSocialAcceleration(token)) {
      signal.stages.socialAcceleration = true;
      signal.ignitionScore += 20;
    }

    // Validate minimum stages
    const stagesActive = Object.values(signal.stages).filter((s) => s).length;
    if (stagesActive < 2) {
      return null; // Not enough ignition
    }

    // Calculate confidence
    signal.confidence = (stagesActive / 5) * 100;
    signal.estimatedBreakoutDays = Math.max(1, 7 - stagesActive); // Sooner if more stages

    return signal.ignitionScore > 0 ? signal : null;
  }

  /**
   * STAGE 1: SILENT ACCUMULATION
   * Price flat, volume building, smart money entering
   */
  private detectSilentAccumulation(token: any): boolean {
    if (!token.priceChange) return false;

    const m5Change = Math.abs(token.priceChange.m5 || 0);
    const h1Change = Math.abs(token.priceChange.h1 || 0);

    // Price is stable (< 3% move in last hour)
    const isPriceFlat = h1Change < 3;

    // But volume is present
    const volumePresent = (token.volume?.m5 || 0) > 1000;

    return isPriceFlat && volumePresent;
  }

  /**
   * STAGE 2: WALLET CLUSTERING
   * Same wallets buying repeatedly
   */
  private detectWalletClustering(token: any): boolean {
    if (!token.walletActivity) return false;

    // Look for repeat buyers
    const buyerFrequency = token.walletActivity.topBuyerFrequency || 0;
    const clusteringScore = token.walletActivity.clusteringCoefficient || 0;

    return buyerFrequency > 3 && clusteringScore > 0.6;
  }

  /**
   * STAGE 3: LIQUIDITY PREPARATION
   * Liquidity being added before move
   */
  private detectLiquidityPrep(token: any): boolean {
    if (!token.liquidity) return false;

    const liquidityAdded = (token.liquidity.addedRecently || false);
    const depthIncreasing = (token.liquidity.depth || 0) > 50000;

    return liquidityAdded && depthIncreasing;
  }

  /**
   * STAGE 4: HOLDER RETENTION
   * Existing holders not selling
   */
  private detectHolderRetention(token: any): boolean {
    if (!token.holders) return false;

    // Growth in holders (accumulation phase)
    const holderGrowth = (token.holders.growthPercent || 0) > 2;

    // But low churn (not selling)
    const lowChurn = (token.holders.churnPercent || 0) < 5;

    return holderGrowth && lowChurn;
  }

  /**
   * STAGE 5: SOCIAL ACCELERATION
   * Social activity starting to rise
   */
  private detectSocialAcceleration(token: any): boolean {
    if (!token.social) return false;

    // Early stage social acceleration (not explosive yet, but building)
    const mentionVelocity = (token.social.mentionVelocity || 0) > 10;
    const influencerBuildup = (token.social.influencerCount || 0) > 3;

    return mentionVelocity && influencerBuildup;
  }

  /**
   * GET IGNITION STRENGTH
   * Interpret the score
   */
  getIgnitionStrength(score: number): string {
    if (score > 80) return '🚀 IMMINENT IGNITION';
    if (score > 60) return '⚡ STRONG IGNITION';
    if (score > 40) return '📈 MODERATE IGNITION';
    if (score > 20) return '🌱 EARLY IGNITION';
    return '👀 WATCH';
  }

  /**
   * EMIT IGNITION ALERT
   */
  async emitIgnitionAlert(signal: IgnitionSignal): Promise<void> {
    await eventOrchestrator.emit(
      'IGNITION_DETECTED',
      signal,
      'ignition-engine',
      'HIGH',
    );

    console.log(`[Ignition] 🚀 ${signal.token} ignition at ${signal.ignitionScore}/100`);
  }
}

export const ignitionEngine = new IgnitionEngine();