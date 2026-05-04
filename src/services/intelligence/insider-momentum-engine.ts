/**
 * FILE PATH: src/services/intelligence/insider-momentum-engine.ts
 * 
 * IMPORT THIS FILE IN:
 * - src/services/scoring/router.ts
 * 
 * COPY THIS FILE TO:
 * - src/services/intelligence/insider-momentum-engine.ts
 * 
 * INSIDER MOMENTUM INTELLIGENCE ENGINE
 * Detects pre-explosive insider-style accumulation patterns
 * 
 * Focus: Dead → Viral tokens (PEPE/SHIBA style early phase detection)
 * Architecture: Deterministic + Statistical (AI validation only)
 * Token Efficiency: Minimal AI usage (Grok for social only, Claude for validation)
 */

import { supabase } from '../../db/supabase';
import { INTELLIGENCE } from '../../core/config'; // CORRECT PATH
import { walletManager } from '../wallet/wallet-manager'; // CORRECT PATH

import {
  InsiderMomentumScore,
  DormancySignal,
  WalletCoordinationSignal,
  HolderRetentionSignal,
  LiquidityExplosionSignal,
  SocialIgnitionSignal,
  InsiderMomentumContext,
  BeastCandidateLabel,
} from './types/insider-momentum-types'; // CORRECT PATH

// ============================================================================
// DETECTOR STATE
// ============================================================================

interface TokenMomentumState {
  tokenAddress: string;
  walletId: string;

  // Historical tracking
  dormancyPhaseStart: number;
  dormancyDurationMs: number;
  dormancyVolatility: number;
  dormancyVolume: number;

  // Smart wallet tracking
  coordinatedWallets: Set<string>;
  walletEntryTimes: Map<string, number>;
  profitableWalletCount: number;
  walletClusteringScore: number;

  // Holder dynamics
  holderCountChange: number;
  holderRetentionRate: number;
  sellPressureScore: number;
  diamondHandScore: number;

  // Liquidity tracking
  lpGrowthRate: number;
  liquidityAddedVsRemoved: number;
  marketCapVelocity: number;
  liquidityExplosionScore: number;

  // Social signals
  socialMentionVelocity: number;
  sentimentPolarity: number;
  engagementAcceleration: number;
  socialIgnitionScore: number;

  // Composite scoring
  insiderMomentumScore: number;
  beastLabel: BeastCandidateLabel | null;

  // Timing
  scoreUpdatedAt: number;
  lastAlertAt: number;
}

class InsiderMomentumEngine {
  private tokenStates: Map<string, TokenMomentumState> = new Map();
  private walletHistory: Map<string, number[]> = new Map(); // walletAddr -> win timestamps
  private patternLibrary: Map<string, number> = new Map(); // patternHash -> confidence

  // Configuration
  readonly DORMANCY_MIN_DURATION_MS = 3600000; // 1 hour
  readonly DORMANCY_MAX_VOLUME = 50000; // Low volume threshold
  readonly DORMANCY_MAX_VOLATILITY = 0.05; // 5% volatility = dead
  readonly WALLET_CLUSTER_TIME_WINDOW = 600000; // 10 minutes
  readonly WALLET_CLUSTER_MIN_COUNT = 3;
  readonly HOLDER_RETENTION_MIN = 0.75; // 75% retention = diamond hands
  readonly LP_EXPLOSION_THRESHOLD = 10; // 10x growth in short time
  readonly LIQUIDITY_IGNITION_VELOCITY = 100; // market cap growth per minute threshold

  /**
   * Analyze token for insider momentum signals
   * 
   * USAGE IN router.ts:
   * const insiderScore = await insiderMomentumEngine.analyzeToken(
   *   tokenAddress,
   *   walletId,
   *   currentMetrics
   * );
   */
  async analyzeToken(
    tokenAddress: string,
    walletId: string,
    currentMetrics: any
  ): Promise<InsiderMomentumScore> {
    const key = `${tokenAddress}:${walletId}`;
    let state = this.tokenStates.get(key);

    if (!state) {
      state = this.initializeTokenState(tokenAddress, walletId);
      this.tokenStates.set(key, state);
    }

    // Update all signals
    await this.updateDormancySignal(state, currentMetrics);
    await this.updateWalletCoordinationSignal(state, currentMetrics);
    await this.updateHolderRetentionSignal(state, currentMetrics);
    await this.updateLiquidityExplosionSignal(state, currentMetrics);
    await this.updateSocialIgnitionSignal(state, currentMetrics);

    // Composite scoring
    const score = this.calculateCompositeScore(state);
    state.insiderMomentumScore = score.score;
    state.beastLabel = this.classifyBeastCandidate(score.score);
    state.scoreUpdatedAt = Date.now();

    // Alert if threshold exceeded
    if (score.score >= 70) {
      await this.raiseAlert(state, score);
    }

    return score;
  }

  /**
   * SIGNAL 1: Dormancy Compression Detection
   * 
   * Detects: Dead charts suddenly awakening
   * - Low volatility period → sudden volume spike
   * - Flat price action → aggressive buy pressure
   */
  private async updateDormancySignal(
    state: TokenMomentumState,
    metrics: any
  ): Promise<void> {
    const { volatility, volume, volumeChangePercent, priceChangePercent } = metrics;

    // Detect dormancy phase
    if (volatility < this.DORMANCY_MAX_VOLATILITY && volume < this.DORMANCY_MAX_VOLUME) {
      if (state.dormancyPhaseStart === 0) {
        state.dormancyPhaseStart = Date.now();
      }
      state.dormancyDurationMs = Date.now() - state.dormancyPhaseStart;
      state.dormancyVolatility = volatility;
      state.dormancyVolume = volume;
    }

    // Detect awakening
    const hadDormancy = state.dormancyDurationMs > this.DORMANCY_MIN_DURATION_MS;
    const volumeSpiked = volumeChangePercent > 200; // 3x volume increase
    const priceSurged = priceChangePercent > 5; // 5%+ price movement

    if (hadDormancy && (volumeSpiked || priceSurged)) {
      console.log(
        `[Insider] DORMANT_BREAKOUT: ${state.tokenAddress} waking after ${
          state.dormancyDurationMs / 60000
        }m dormancy`
      );
    }
  }

  /**
   * SIGNAL 2: Smart Wallet Synchronization
   * 
   * Detects: Coordinated entries by profitable wallets
   * - Multiple smart money wallets entering within time window
   * - Wallet clustering indicates coordination
   */
  private async updateWalletCoordinationSignal(
    state: TokenMomentumState,
    metrics: any
  ): Promise<void> {
    const { incomingWallets, uniqueHolders } = metrics;

    // Track wallet entries
    const now = Date.now();
    const windowStart = now - this.WALLET_CLUSTER_TIME_WINDOW;

    for (const wallet of incomingWallets || []) {
      if (!state.walletEntryTimes.has(wallet)) {
        state.walletEntryTimes.set(wallet, now);

        // Check if wallet is "profitable" (has history of winning trades)
        const walletWins = this.walletHistory.get(wallet) || [];
        const recentWins = walletWins.filter((t) => t > windowStart).length;

        if (recentWins >= 2) {
          state.coordinatedWallets.add(wallet);
          state.profitableWalletCount++;
        }
      }
    }

    // Count entries in current window
    const recentEntries = Array.from(state.walletEntryTimes.values()).filter(
      (t) => t > windowStart
    ).length;

    // Clustering score
    if (recentEntries >= this.WALLET_CLUSTER_MIN_COUNT) {
      state.walletClusteringScore = Math.min(100, (recentEntries / 10) * 100);

      console.log(
        `[Insider] COORDINATED_ENTRY: ${state.tokenAddress} - ${recentEntries} wallets in 10m window`
      );
    }

    // Clean old entries
    for (const [wallet, time] of state.walletEntryTimes.entries()) {
      if (time < windowStart) {
        state.walletEntryTimes.delete(wallet);
      }
    }
  }

  /**
   * SIGNAL 3: Holder Retention Strength
   * 
   * Detects: Diamond hand formation
   * - Holders NOT exiting during expansion
   * - Increasing holder count = retail entering
   * - Low sell pressure = conviction
   */
  private async updateHolderRetentionSignal(
    state: TokenMomentumState,
    metrics: any
  ): Promise<void> {
    const { holderCount, holderCountChange, sellVolume, buyVolume, priceChangePercent } =
      metrics;

    state.holderCountChange = holderCountChange;

    // Calculate retention rate
    // If price up 50% but holders didn't exit = high retention
    if (priceChangePercent > 10) {
      const expectedExits = holderCount * 0.15; // Expect 15% to exit on 50% pump
      const actualExits = Math.max(0, sellVolume / (buyVolume + sellVolume));
      state.holderRetentionRate = 1 - actualExits;

      // Sell pressure score (lower = better)
      state.sellPressureScore = actualExits * 100;
    }

    // Diamond hand score
    // Strong retention + increasing holders + low sell pressure = cult formation
    if (
      state.holderRetentionRate > this.HOLDER_RETENTION_MIN &&
      holderCountChange > 0 &&
      state.sellPressureScore < 20
    ) {
      state.diamondHandScore = Math.min(100, state.holderRetentionRate * 100);
      console.log(
        `[Insider] DIAMOND_HAND_FORMATION: ${state.tokenAddress} retention=${(
          state.holderRetentionRate * 100
        ).toFixed(1)}%`
      );
    }
  }

  /**
   * SIGNAL 4: Liquidity Expansion Velocity
   * 
   * Detects: Explosive LP growth
   * - LP added vs removed ratio
   * - Market cap velocity (growth per minute)
   * - 7k → 2.6m in 30 min = MAX ALERT
   */
  private async updateLiquidityExplosionSignal(
    state: TokenMomentumState,
    metrics: any
  ): Promise<void> {
    const { lpGrowthRatio, marketCap, marketCapChange1h, buyPressure, liquidityUSD } = metrics;

    state.lpGrowthRate = lpGrowthRatio;
    state.liquidityAddedVsRemoved = buyPressure > 0.7 ? 1 : 0.5; // Ratio estimation

    // Market cap velocity (growth per minute)
    const growthMinutes = 60; // 1 hour window
    state.marketCapVelocity = marketCapChange1h / growthMinutes;

    // Explosion detection
    if (lpGrowthRatio > this.LP_EXPLOSION_THRESHOLD) {
      console.log(
        `[Insider] LIQUIDITY_IGNITION: ${state.tokenAddress} - ${lpGrowthRatio}x LP growth`
      );

      state.liquidityExplosionScore = Math.min(100, (lpGrowthRatio / 20) * 100);
    }

    // Check for generational runner pattern (7k → 2.6m velocity)
    if (marketCap > 1000000 && marketCapChange1h > 100000 && state.marketCapVelocity > 50) {
      console.log(
        `[Insider] POTENTIAL GENERATIONAL_RUNNER: ${state.tokenAddress} velocity=${
          state.marketCapVelocity
        }/min`
      );
    }
  }

  /**
   * SIGNAL 5: Social Ignition Detection
   * 
   * Detects: Viral momentum building
   * Uses: Lightweight social metrics + Grok for trend extraction
   * NOT: Claude Haiku (save for final validation only)
   */
  private async updateSocialIgnitionSignal(
    state: TokenMomentumState,
    metrics: any
  ): Promise<void> {
    const { socialMentions, socialMentionChange, engagement, engagementChange, sentiment } =
      metrics;

    // Calculate mention velocity
    state.socialMentionVelocity = socialMentionChange || 0;
    state.sentimentPolarity = sentiment || 0.5; // 0-1 scale
    state.engagementAcceleration = engagementChange || 0;

    // Lightweight detection (no AI)
    const mentionSpiked = state.socialMentionVelocity > 200; // 3x increase
    const engagementHot = state.engagementAcceleration > 150; // 2.5x increase
    const sentimentBullish = state.sentimentPolarity > 0.6;

    if (mentionSpiked || engagementHot || sentimentBullish) {
      // Only trigger Grok for trend extraction (not full analysis)
      if (mentionSpiked) {
        // Grok Task: Extract trending keywords/narratives ONLY
        await this.extractSocialTrends(state.tokenAddress, socialMentions);
      }

      state.socialIgnitionScore = Math.min(100, state.socialMentionVelocity * 0.5);
      console.log(
        `[Insider] SOCIAL_IGNITION: ${state.tokenAddress} mentions=${state.socialMentionVelocity}x`
      );
    }
  }

  /**
   * Extract social trends using Grok (lightweight, trend-only)
   * 
   * Task: Extract keywords, narrative themes, engagement type
   * NOT: Full reasoning, trade decisions, conviction scoring
   */
  private async extractSocialTrends(
    tokenAddress: string,
    mentions: any[]
  ): Promise<void> {
    // This would call Grok API with:
    // Input: Recent mentions/tweets about token
    // Task: "Extract trending keywords, meme themes, and engagement classification"
    // Output: { keywords: [], themes: [], engagementType: "" }
    //
    // Keep it lightweight: 1 API call per social spike, cached for 5 minutes

    console.log(`[Insider] Grok: Extracting social trends for ${tokenAddress}`);
    // Grok call would go here (Delivery 2)
  }

  /**
   * Calculate composite insider momentum score (0-100)
   */
  private calculateCompositeScore(state: TokenMomentumState): InsiderMomentumScore {
    // Weighted scoring
    const weights = {
      dormancy: 0.15,
      coordination: 0.20,
      retention: 0.20,
      liquidity: 0.25,
      social: 0.20,
    };

    const compositeScore =
      (state.dormancyDurationMs > this.DORMANCY_MIN_DURATION_MS ? 20 : 0) +
      state.walletClusteringScore * weights.coordination +
      state.diamondHandScore * weights.retention +
      state.liquidityExplosionScore * weights.liquidity +
      state.socialIgnitionScore * weights.social;

    const finalScore = Math.min(100, compositeScore);

    return {
      score: finalScore,
      dormancyScore: state.dormancyDurationMs > this.DORMANCY_MIN_DURATION_MS ? 20 : 0,
      coordinationScore: state.walletClusteringScore,
      retentionScore: state.diamondHandScore,
      liquidityScore: state.liquidityExplosionScore,
      socialScore: state.socialIgnitionScore,
      timestamp: Date.now(),
    };
  }

  /**
   * Classify beast candidates based on score
   */
  private classifyBeastCandidate(score: number): BeastCandidateLabel | null {
    if (score >= 95) return 'GENERATIONAL_RUNNER';
    if (score >= 85) return 'BEAST_MODE_CANDIDATE';
    if (score >= 70) return 'HIGH_PRIORITY_ALERT';
    return null;
  }

  /**
   * Raise alert when thresholds exceeded
   */
  private async raiseAlert(state: TokenMomentumState, score: InsiderMomentumScore): Promise<void> {
    const now = Date.now();
    const timeSinceLastAlert = now - state.lastAlertAt;

    // Deduplicate alerts (max 1 per 5 minutes)
    if (timeSinceLastAlert < 300000) {
      return;
    }

    state.lastAlertAt = now;

    const alertMessage = `
📊 INSIDER MOMENTUM ALERT
Token: ${state.tokenAddress}
Score: ${score.score.toFixed(0)}/100
Beast Label: ${state.beastLabel || 'N/A'}

Signals:
• Dormancy: ${score.dormancyScore.toFixed(0)}
• Coordination: ${score.coordinationScore.toFixed(0)}
• Retention: ${score.retentionScore.toFixed(0)}
• Liquidity: ${score.liquidityScore.toFixed(0)}
• Social: ${score.socialScore.toFixed(0)}
    `.trim();

    console.log(alertMessage);

    // Store in database
    await this.storeAlertInDatabase(state, score);
  }

  private async storeAlertInDatabase(
    state: TokenMomentumState,
    score: InsiderMomentumScore
  ): Promise<void> {
    try {
      await supabase.from('insider_momentum_alerts').insert({
        wallet_id: state.walletId,
        token_address: state.tokenAddress,
        momentum_score: score.score,
        beast_label: state.beastLabel,
        dormancy_score: score.dormancyScore,
        coordination_score: score.coordinationScore,
        retention_score: score.retentionScore,
        liquidity_score: score.liquidityScore,
        social_score: score.socialScore,
        coordinated_wallets_count: state.coordinatedWallets.size,
        holder_retention_rate: state.holderRetentionRate,
        lp_growth_rate: state.lpGrowthRate,
        market_cap_velocity: state.marketCapVelocity,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Insider] Error storing alert:', error);
    }
  }

  /**
   * Initialize token state
   */
  private initializeTokenState(tokenAddress: string, walletId: string): TokenMomentumState {
    return {
      tokenAddress,
      walletId,
      dormancyPhaseStart: 0,
      dormancyDurationMs: 0,
      dormancyVolatility: 0,
      dormancyVolume: 0,
      coordinatedWallets: new Set(),
      walletEntryTimes: new Map(),
      profitableWalletCount: 0,
      walletClusteringScore: 0,
      holderCountChange: 0,
      holderRetentionRate: 0,
      sellPressureScore: 100,
      diamondHandScore: 0,
      lpGrowthRate: 0,
      liquidityAddedVsRemoved: 0.5,
      marketCapVelocity: 0,
      liquidityExplosionScore: 0,
      socialMentionVelocity: 0,
      sentimentPolarity: 0.5,
      engagementAcceleration: 0,
      socialIgnitionScore: 0,
      insiderMomentumScore: 0,
      beastLabel: null,
      scoreUpdatedAt: 0,
      lastAlertAt: 0,
    };
  }

  /**
   * Record wallet win for future coordination detection
   */
  recordWalletWin(walletAddress: string): void {
    if (!this.walletHistory.has(walletAddress)) {
      this.walletHistory.set(walletAddress, []);
    }
    this.walletHistory.get(walletAddress)!.push(Date.now());
  }

  /**
   * Get current score for token
   */
  getScore(tokenAddress: string, walletId: string): InsiderMomentumScore | null {
    const key = `${tokenAddress}:${walletId}`;
    const state = this.tokenStates.get(key);

    if (!state) return null;

    return {
      score: state.insiderMomentumScore,
      dormancyScore: state.dormancyDurationMs > this.DORMANCY_MIN_DURATION_MS ? 20 : 0,
      coordinationScore: state.walletClusteringScore,
      retentionScore: state.diamondHandScore,
      liquidityScore: state.liquidityExplosionScore,
      socialScore: state.socialIgnitionScore,
      timestamp: state.scoreUpdatedAt,
    };
  }
}

export const insiderMomentumEngine = new InsiderMomentumEngine();