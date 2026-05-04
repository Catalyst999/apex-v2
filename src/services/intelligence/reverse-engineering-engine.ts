/**
 * FILE PATH: src/services/intelligence/reverse-engineering-engine.ts
 * 
 * IMPORT THIS FILE IN:
 * - src/services/scoring/router.ts
 * 
 * COPY THIS FILE TO:
 * - src/services/intelligence/reverse-engineering-engine.ts
 * 
 * POST-100x REVERSE ENGINEERING ENGINE
 * Behavioral learning framework based on missed runners
 * 
 * Philosophy: Psychology reconstruction + opportunity pattern extraction
 */

import { supabase } from '../../db/supabase';
import { walletManager } from '../wallet/wallet-manager'; // CORRECT PATH

import {
  ReverseEngineerContext,
  ConvictionTrigger,
  HistoricalRunnerPattern,
  BehavioralFingerprint,
  PatternRepeatingConditions,
  BeastModeAlignment,
  ConvictionTriggerType,
} from './types/reverse-engineering-types'; // CORRECT PATH

// ============================================================================
// REVERSE ENGINEERING ENGINE
// ============================================================================

class ReverseEngineeringEngine {
  private historyCache: Map<string, HistoricalRunnerPattern> = new Map();
  private triggerLibrary: Map<string, ConvictionTrigger[]> = new Map(); // By token
  private patternFingerprints: BehavioralFingerprint[] = [];

  /**
   * Main entry point: Analyze a historical runner
   * 
   * USAGE:
   * const context = await reverseEngineeringEngine.analyzeHistoricalRunner(
   *   'PEPE_ADDRESS',
   *   historicalData
   * );
   */
  async analyzeHistoricalRunner(
    tokenAddress: string,
    historicalData: any // { candles, holders, liquidity, social, wallets }
  ): Promise<ReverseEngineerContext> {
    console.log(`[ReverseEng] Analyzing historical runner: ${tokenAddress}`);

    // Step 1: Load and validate data
    const context = this.initializeContext(tokenAddress, historicalData);

    // Step 2: Replay chart without hindsight bias
    const replayResult = await this.replayChartWithoutHindsight(context, historicalData);

    // Step 3: Extract conviction triggers
    const triggers = this.extractConvictionTriggers(context, replayResult);

    // Step 4: Identify pattern repetitions
    const patterns = this.detectPatternRepetitions(triggers, context);

    // Step 5: Store and integrate patterns
    await this.integratePatterns(context, triggers, patterns);

    return context;
  }

  /**
   * STEP 1: Initialize replay context
   */
  private initializeContext(
    tokenAddress: string,
    data: any
  ): ReverseEngineerContext {
    return {
      tokenAddress,
      analysisStartedAt: Date.now(),

      // Historical metrics
      initialMarketCap: data.candles[0]?.marketCap || 0,
      peakMarketCap: Math.max(...(data.candles.map((c: any) => c.marketCap) || [0])),
      timeToExplosion: 0, // Will be calculated
      totalROI: 0, // Will be calculated

      // Tracking
      convictionTriggersFound: [],
      behavioralFingerprints: [],
      repeatingPatterns: [],
      beastModeAlignment: null,

      // Metadata
      walletId: '', // Can be set if analyzing per-wallet
      comparisonTokens: [], // PEPE, SHIBA, BONK, etc.
    };
  }

  /**
   * STEP 2: Replay chart without hindsight bias
   */
  private async replayChartWithoutHindsight(
    context: ReverseEngineerContext,
    data: any
  ): Promise<any> {
    const candles = data.candles || [];
    const holders = data.holders || [];
    const liquidity = data.liquidity || [];
    const social = data.social || [];
    const wallets = data.wallets || [];

    const replayStates: any[] = [];
    let explosionDetected = false;
    let explosionStartIndex = -1;

    // Process candles chronologically
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const timestamp = candle.timestamp;

      // Get metrics UP TO this point (no future peeking)
      const historicalMetrics = {
        marketCap: candle.marketCap,
        marketCapChange: i > 0 ? candle.marketCap / candles[i - 1].marketCap - 1 : 0,
        price: candle.close,
        volume: candle.volume,
        volumeChange: i > 0 ? candle.volume / candles[i - 1].volume - 1 : 0,
        volatility: this.calculateVolatility(candles.slice(Math.max(0, i - 20), i + 1)),
        holderCount: holders[i]?.count || 0,
        holderCountChange:
          i > 0 ? (holders[i]?.count || 0) / (holders[i - 1]?.count || 1) - 1 : 0,
        liquidityUSD: liquidity[i]?.usd || 0,
        liquidityChange: i > 0 ? liquidity[i]?.usd / liquidity[i - 1]?.usd - 1 : 0,
        buyVolume: candle.buyVolume || 0,
        sellVolume: candle.sellVolume || 0,
        buyPressure: candle.buyVolume / (candle.buyVolume + candle.sellVolume) || 0,
        socialMentions: social[i]?.mentions || 0,
        socialMentionChange:
          i > 0 ? (social[i]?.mentions || 0) / (social[i - 1]?.mentions || 1) - 1 : 0,
        incomingWallets: wallets[i]?.incoming || [],
        profitableWalletsEntering: wallets[i]?.profitableCount || 0,
      };

      // Detect early-phase decision windows
      const isEarlyPhase = candle.marketCap < 500000; // First 500k
      const isAccumulationPhase = candle.marketCap < 5000000; // Up to 5M

      // Check for explosion detection point
      if (i > 0 && !explosionDetected) {
        const previousMC = candles[i - 1].marketCap;
        const mcGrowth = candle.marketCap / previousMC;

        // Explosion = 10x growth in single candle
        if (mcGrowth > 10 && isAccumulationPhase) {
          explosionDetected = true;
          explosionStartIndex = i;
          context.timeToExplosion = timestamp - candles[0].timestamp;
          context.totalROI = candle.marketCap / context.initialMarketCap;
        }
      }

      replayStates.push({
        index: i,
        timestamp,
        metrics: historicalMetrics,
        isEarlyPhase,
        isAccumulationPhase,
        isExplosionStart: i === explosionStartIndex,
        timeUntilExplosion: explosionDetected ? timestamp - candles[i].timestamp : null,
      });
    }

    return {
      replayStates,
      explosionDetected,
      explosionStartIndex,
    };
  }

  /**
   * STEP 3: Extract conviction triggers
   */
  private extractConvictionTriggers(
    context: ReverseEngineerContext,
    replayResult: any
  ): ConvictionTrigger[] {
    const triggers: ConvictionTrigger[] = [];
    const { replayStates } = replayResult;

    for (let i = 0; i < replayStates.length; i++) {
      const state = replayStates[i];
      const { metrics, isEarlyPhase, timeUntilExplosion } = state;

      // Only analyze early/accumulation phases
      if (!isEarlyPhase && !state.isAccumulationPhase) continue;

      // Trigger 1: Dormant Chart Revival
      if (metrics.volatility < 0.05 && metrics.volume < 50000) {
        if (i > 0 && replayStates[i - 1].metrics.volume < 50000) {
          if (metrics.volumeChange > 2 || metrics.marketCapChange > 0.05) {
            triggers.push({
              type: 'DORMANT_CHART_REVIVAL',
              timestamp: state.timestamp,
              confidence: Math.min(1.0, metrics.volumeChange + Math.abs(metrics.marketCapChange)),
              timeUntilExplosion,
              metrics: {
                volumeChange: metrics.volumeChange,
                marketCapChange: metrics.marketCapChange,
                buyPressure: metrics.buyPressure,
              },
            });
          }
        }
      }

      // Trigger 2: Stealth Accumulation
      if (
        metrics.profitableWalletsEntering >= 3 &&
        metrics.marketCap < 1000000 &&
        metrics.buyPressure > 0.65
      ) {
        triggers.push({
          type: 'STEALTH_ACCUMULATION',
          timestamp: state.timestamp,
          confidence: (metrics.profitableWalletsEntering / 10) * metrics.buyPressure,
          timeUntilExplosion,
          metrics: {
            profitableWalletsEntering: metrics.profitableWalletsEntering,
            buyPressure: metrics.buyPressure,
            marketCap: metrics.marketCap,
          },
        });
      }

      // Trigger 3: High Signal Low Noise
      if (
        metrics.buyPressure > 0.7 &&
        metrics.liquidityChange > 2 &&
        metrics.volatility < 0.15 &&
        metrics.marketCap < 2000000
      ) {
        triggers.push({
          type: 'HIGH_SIGNAL_LOW_NOISE',
          timestamp: state.timestamp,
          confidence: (metrics.buyPressure + metrics.liquidityChange / 10) / 2,
          timeUntilExplosion,
          metrics: {
            buyPressure: metrics.buyPressure,
            liquidityChange: metrics.liquidityChange,
            volatility: metrics.volatility,
          },
        });
      }

      // Trigger 4: Social Velocity Spike
      if (metrics.socialMentionChange > 2 && metrics.marketCap < 5000000) {
        triggers.push({
          type: 'SOCIAL_VELOCITY_SPIKE',
          timestamp: state.timestamp,
          confidence: Math.min(1.0, metrics.socialMentionChange / 5),
          timeUntilExplosion,
          metrics: {
            socialMentionChange: metrics.socialMentionChange,
            socialMentions: metrics.socialMentions,
            marketCap: metrics.marketCap,
          },
        });
      }

      // Trigger 5: Liquidity Stability
      if (
        metrics.liquidityChange > 1 &&
        metrics.liquidityChange < 5 &&
        metrics.buyPressure > 0.6
      ) {
        triggers.push({
          type: 'LIQUIDITY_STABILITY',
          timestamp: state.timestamp,
          confidence: (metrics.liquidityChange / 5) * metrics.buyPressure,
          timeUntilExplosion,
          metrics: {
            liquidityChange: metrics.liquidityChange,
            buyPressure: metrics.buyPressure,
            liquidityUSD: metrics.liquidityUSD,
          },
        });
      }
    }

    context.convictionTriggersFound = triggers;
    return triggers;
  }

  /**
   * STEP 4: Detect pattern repetitions
   */
  private detectPatternRepetitions(
    triggers: ConvictionTrigger[],
    context: ReverseEngineerContext
  ): PatternRepeatingConditions {
    const triggersByType = new Map<ConvictionTriggerType, ConvictionTrigger[]>();

    for (const trigger of triggers) {
      if (!triggersByType.has(trigger.type)) {
        triggersByType.set(trigger.type, []);
      }
      triggersByType.get(trigger.type)!.push(trigger);
    }

    const triggerStrengths = new Map<ConvictionTriggerType, number>();

    for (const [type, typeTriggers] of triggersByType.entries()) {
      const strongTriggers = typeTriggers.filter(
        (t) => t.timeUntilExplosion !== null && t.timeUntilExplosion < 3600000
      );
      triggerStrengths.set(type, strongTriggers.length / typeTriggers.length);
    }

    const topTriggers = Array.from(triggerStrengths.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((e) => e[0]);

    return {
      triggersUsedInAnalysis: triggers.length,
      triggerTypesDetected: triggersByType.size,
      topPredictiveTriggers: topTriggers,
      triggerStrengthMap: triggerStrengths,
      averageTimeToExplosion:
        triggers.length > 0
          ? triggers.reduce((sum, t) => sum + (t.timeUntilExplosion || 0), 0) / triggers.length
          : 0,
    };
  }

  /**
   * STEP 5: Integrate patterns
   */
  private async integratePatterns(
    context: ReverseEngineerContext,
    triggers: ConvictionTrigger[],
    patterns: PatternRepeatingConditions
  ): Promise<void> {
    await this.storeReverseEngineeringResults(context, triggers, patterns);

    const fingerprint = this.buildBehavioralFingerprint(context, triggers, patterns);
    this.patternFingerprints.push(fingerprint);

    console.log(`[ReverseEng] Analyzed ${context.tokenAddress}`);
    console.log(`  Triggers found: ${triggers.length}`);
    console.log(`  Top patterns: ${patterns.topPredictiveTriggers.join(', ')}`);
  }

  /**
   * Build behavioral fingerprint
   */
  private buildBehavioralFingerprint(
    context: ReverseEngineerContext,
    triggers: ConvictionTrigger[],
    patterns: PatternRepeatingConditions
  ): BehavioralFingerprint {
    return {
      tokenAddress: context.tokenAddress,
      roi: context.totalROI,
      timeToExplosion: context.timeToExplosion,
      triggerPattern: patterns.topPredictiveTriggers,
      triggerCount: triggers.length,
      confidence: this.calculatePatternConfidence(triggers, patterns),
      analysisTimestamp: Date.now(),
    };
  }

  /**
   * Calculate pattern confidence
   */
  private calculatePatternConfidence(
    triggers: ConvictionTrigger[],
    patterns: PatternRepeatingConditions
  ): number {
    const triggerStrength = Math.min(1.0, triggers.length / 20);
    const patternConsistency =
      patterns.topPredictiveTriggers.length > 0
        ? patterns.triggerStrengthMap.get(patterns.topPredictiveTriggers[0] as any) || 0
        : 0;
    const speedConfidence = Math.min(1.0, 3600000 / (patterns.averageTimeToExplosion || 1));

    return (triggerStrength + patternConsistency + speedConfidence) / 3;
  }

  /**
   * Store results in database
   */
  private async storeReverseEngineeringResults(
    context: ReverseEngineerContext,
    triggers: ConvictionTrigger[],
    patterns: PatternRepeatingConditions
  ): Promise<void> {
    try {
      await supabase.from('reverse_engineering_analyses').insert({
        token_address: context.tokenAddress,
        initial_market_cap: context.initialMarketCap,
        peak_market_cap: context.peakMarketCap,
        time_to_explosion_ms: context.timeToExplosion,
        total_roi: context.totalROI,
        triggers_found: triggers.length,
        trigger_types_detected: patterns.triggerTypesDetected,
        top_predictive_triggers: patterns.topPredictiveTriggers,
        average_time_to_explosion_ms: patterns.averageTimeToExplosion,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[ReverseEng] Error storing results:', error);
    }
  }

  /**
   * Match new token against historical patterns
   * 
   * USAGE IN router.ts:
   * const patternMatch = await reverseEngineeringEngine.matchAgainstHistoricalPatterns(
   *   tokenAddress,
   *   currentMetrics
   * );
   */
  async matchAgainstHistoricalPatterns(
    tokenAddress: string,
    currentMetrics: any
  ): Promise<BeastModeAlignment | null> {
    if (this.patternFingerprints.length === 0) {
      return null; // No patterns learned yet
    }

    const matches: Array<{ fingerprint: BehavioralFingerprint; similarity: number }> = [];

    for (const fingerprint of this.patternFingerprints) {
      const similarity = this.calculatePatternSimilarity(
        fingerprint.triggerPattern,
        currentMetrics
      );

      if (similarity > 0.5) {
        matches.push({ fingerprint, similarity });
      }
    }

    if (matches.length === 0) {
      return null;
    }

    matches.sort((a, b) => b.similarity - a.similarity);

    return {
      tokenAddress,
      matchCount: matches.length,
      topMatch: matches[0].fingerprint,
      averageSimilarity: matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length,
      beastModeConfidence: Math.min(
        1.0,
        matches[0].similarity * (matches.length / Math.max(1, this.patternFingerprints.length))
      ),
    };
  }

  /**
   * Calculate pattern similarity
   */
  private calculatePatternSimilarity(triggerPattern: string[], currentMetrics: any): number {
    let similarity = 0;
    let matchCount = 0;

    for (const triggerType of triggerPattern) {
      if (this.metricsMatchTriggerType(triggerType, currentMetrics)) {
        matchCount++;
      }
    }

    similarity = matchCount / triggerPattern.length;
    return similarity;
  }

  /**
   * Check if metrics match trigger type
   */
  private metricsMatchTriggerType(triggerType: string, metrics: any): boolean {
    const { volatility, volume, holderCountChange, buyPressure, liquidityChange, socialMentionChange } = metrics;

    switch (triggerType) {
      case 'DORMANT_CHART_REVIVAL':
        return volatility < 0.05 && volume < 50000;
      case 'STEALTH_ACCUMULATION':
        return buyPressure > 0.65;
      case 'HIGH_SIGNAL_LOW_NOISE':
        return buyPressure > 0.7 && volatility < 0.15;
      case 'SOCIAL_VELOCITY_SPIKE':
        return socialMentionChange > 2;
      case 'LIQUIDITY_STABILITY':
        return liquidityChange > 1 && liquidityChange < 5;
      default:
        return false;
    }
  }

  /**
   * Calculate volatility
   */
  private calculateVolatility(candles: any[]): number {
    if (candles.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const ret = candles[i].close / candles[i - 1].close - 1;
      returns.push(ret);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }
}

export const reverseEngineeringEngine = new ReverseEngineeringEngine();