/**
 * FILE PATH: src/services/intelligence/bull-run-intelligence-engine.ts
 * 
 * IMPORT THIS FILE IN:
 * - src/services/scoring/router.ts
 * 
 * COPY THIS FILE TO:
 * - src/services/intelligence/bull-run-intelligence-engine.ts
 * 
 * BULL RUN INTELLIGENCE ENGINE
 * Market regime detection and risk scaling
 * 
 * Focus: Detect bull run phases vs cooling phases
 * Adjusts position sizing and aggression based on regime
 */

import { supabase } from '../../db/supabase';
import { MARKET_REGIME } from '../../core/config'; // CORRECT PATH

import {
  BullRunRegime,
  BullRunPhase,
  RegimeMetrics,
  RegimeScore,
  RiskMultiplier,
  BullRunContext,
} from './types/bull-run-types'; // CORRECT PATH

// ============================================================================
// BULL RUN INTELLIGENCE ENGINE
// ============================================================================

class BullRunIntelligenceEngine {
  private regimeHistory: Map<string, RegimeMetrics[]> = new Map(); // walletId -> history
  private phaseCache: Map<string, BullRunPhase> = new Map();

  // Configuration thresholds
  readonly GROWTH_PHASE_MIN_MOMENTUM = 0.65; // 65% momentum threshold
  readonly COOLING_PHASE_MAX_MOMENTUM = 0.45; // Below 45% = cooling
  readonly DISTRIBUTION_PHASE_MAX_MOMENTUM = 0.25; // Below 25% = distribution

  readonly VOLATILITY_EXTREME_THRESHOLD = 0.25; // 25% volatility = extreme
  readonly VOLATILITY_HIGH_THRESHOLD = 0.15; // 15% volatility = high
  readonly VOLATILITY_NORMAL_THRESHOLD = 0.08; // 8% volatility = normal

  readonly POSITIVE_WIN_RATE_THRESHOLD = 0.65; // 65% winning trades
  readonly WHALE_ACCUMULATION_THRESHOLD = 0.7; // 70% whale buying pressure

  /**
   * Analyze current market regime
   * 
   * USAGE IN router.ts:
   * const regime = await bullRunIntelligenceEngine.analyzeRegime(
   *   walletId,
   *   currentMetrics
   * );
   * 
   * Then apply risk multiplier:
   * finalPosition = basePosition * regime.riskMultiplier;
   */
  async analyzeRegime(walletId: string, currentMetrics: any): Promise<RegimeScore> {
    console.log(`[BullRun] Analyzing regime for wallet: ${walletId}`);

    // Step 1: Calculate individual regime signals
    const cumulativeMomentum = this.calculateCumulativeMomentum(walletId, currentMetrics);
    const volatilitySignal = this.analyzeVolatility(currentMetrics.volatility);
    const whaleSignal = this.analyzeWhaleBehavior(walletId, currentMetrics);
    const winRateSignal = this.calculateWinRateStrength(walletId);
    const liquiditySignal = this.analyzeLiquidityEnvironment(currentMetrics);

    // Step 2: Composite regime score
    const regimeScore = this.calculateCompositeRegimeScore({
      momentum: cumulativeMomentum,
      volatility: volatilitySignal,
      whaleBehavior: whaleSignal,
      winRate: winRateSignal,
      liquidity: liquiditySignal,
    });

    // Step 3: Classify phase
    const phase = this.classifyRegimePhase(regimeScore);

    // Step 4: Calculate risk multiplier
    const riskMultiplier = this.calculateRiskMultiplier(regimeScore, phase, volatilitySignal);

    // Step 5: Store regime record
    await this.storeRegimeAnalysis(walletId, regimeScore, phase, riskMultiplier);

    // Step 6: Check for regime transitions (alerts)
    await this.checkRegimeTransitions(walletId, phase);

    return {
      regimeScore,
      phase,
      riskMultiplier,
      momentumStrength: cumulativeMomentum,
      volatilityLevel: volatilitySignal.level,
      whaleBuyPressure: whaleSignal.buyPressure,
      marketWinRate: winRateSignal,
      liquidityHealth: liquiditySignal,
      timestamp: Date.now(),
    };
  }

  /**
   * SIGNAL 1: Cumulative Momentum Analysis
   * 
   * Tracks: How many tokens are currently running (expanding market cap)
   * Logic: If 50%+ of tracked tokens are up 5%+ → high momentum
   */
  private calculateCumulativeMomentum(walletId: string, metrics: any): number {
    const { marketCapChange1h, marketCapChange4h, priceChangePercent, volumeIncrease } = metrics;

    // Components of momentum
    const priceUptrend = priceChangePercent > 0 ? Math.min(1, priceChangePercent / 50) : 0;
    const mcUptrend = marketCapChange1h > 0 ? Math.min(1, marketCapChange1h / 100000) : 0;
    const volumeExpansion = volumeIncrease > 1.5 ? Math.min(1, volumeIncrease / 5) : 0;

    // Average momentum
    const momentum = (priceUptrend + mcUptrend + volumeExpansion) / 3;

    return Math.min(1, momentum);
  }

  /**
   * SIGNAL 2: Volatility Analysis
   * 
   * High volatility = market is stressed/choppy = COOLING phase
   * Low volatility + uptrend = sustained GROWTH
   * Extreme volatility = potential rug/manipulation
   */
  private analyzeVolatility(volatility: number): { level: string; score: number } {
    if (volatility > this.VOLATILITY_EXTREME_THRESHOLD) {
      return {
        level: 'EXTREME',
        score: 0.1, // Very dangerous
      };
    } else if (volatility > this.VOLATILITY_HIGH_THRESHOLD) {
      return {
        level: 'HIGH',
        score: 0.4, // Cooling phase
      };
    } else if (volatility > this.VOLATILITY_NORMAL_THRESHOLD) {
      return {
        level: 'NORMAL',
        score: 0.7, // Sustainable
      };
    } else {
      return {
        level: 'LOW',
        score: 0.9, // Accumulation phase
      };
    }
  }

  /**
   * SIGNAL 3: Whale Behavior Analysis
   * 
   * Tracks: Are smart wallets buying or selling?
   * Buy pressure > 70% from whales = accumulation phase
   * Sell pressure > 70% = distribution phase
   */
  private analyzeWhaleBehavior(
    walletId: string,
    metrics: any
  ): { buyPressure: number; phase: string } {
    const { whaleInflows, whaleOutflows, largeTransactions } = metrics;

    const totalFlow = (whaleInflows || 0) + (whaleOutflows || 0);
    const buyPressure = totalFlow > 0 ? whaleInflows / totalFlow : 0.5;

    let phase = 'NEUTRAL';
    if (buyPressure > this.WHALE_ACCUMULATION_THRESHOLD) {
      phase = 'ACCUMULATION';
    } else if (buyPressure < 1 - this.WHALE_ACCUMULATION_THRESHOLD) {
      phase = 'DISTRIBUTION';
    }

    return { buyPressure, phase };
  }

  /**
   * SIGNAL 4: Win Rate Strength
   * 
   * Tracks: What % of recent positions won?
   * If 70%+ win rate → market is favorable for your strategy
   * If <40% win rate → market is hostile
   */
  private calculateWinRateStrength(walletId: string): number {
    // This would come from your trade history
    // For now, returning neutral 0.5
    // In practice: fetch from walletManager.getRecentWinRate(walletId)

    return 0.5; // Placeholder
  }

  /**
   * SIGNAL 5: Liquidity Environment Analysis
   * 
   * Tracks: Is there healthy liquidity for entries/exits?
   * Low liquidity = slippage risk = adjust position sizing down
   */
  private analyzeLiquidityEnvironment(metrics: any): number {
    const { totalLiquidity, liquidityChange, liquidityRatio } = metrics;

    // If liquidity is growing = market is healthy
    const liquidityScore = Math.min(1, (liquidityChange || 1) / 2);

    return liquidityScore;
  }

  /**
   * Calculate composite regime score (0-100)
   */
  private calculateCompositeRegimeScore(signals: {
    momentum: number;
    volatility: { level: string; score: number };
    whaleBehavior: { buyPressure: number; phase: string };
    winRate: number;
    liquidity: number;
  }): number {
    const weights = {
      momentum: 0.35,
      volatility: 0.25,
      whale: 0.15,
      winRate: 0.15,
      liquidity: 0.1,
    };

    const score =
      signals.momentum * weights.momentum * 100 +
      signals.volatility.score * weights.volatility * 100 +
      signals.whaleBehavior.buyPressure * weights.whale * 100 +
      signals.winRate * weights.winRate * 100 +
      signals.liquidity * weights.liquidity * 100;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Classify regime phase
   */
  private classifyRegimePhase(score: number): BullRunPhase {
    if (score >= 80) {
      return 'BULL_RUN_ACCELERATING';
    } else if (score >= 65) {
      return 'BULL_RUN_SUSTAINED';
    } else if (score >= 50) {
      return 'GROWTH_PHASE';
    } else if (score >= 35) {
      return 'COOLING_PHASE';
    } else if (score >= 20) {
      return 'BEAR_WEAKNESS';
    } else {
      return 'BEAR_CRASH';
    }
  }

  /**
   * Calculate risk multiplier based on regime
   * 
   * This multiplier gets applied to position sizes:
   * finalPosition = basePosition * riskMultiplier
   */
  private calculateRiskMultiplier(
    score: number,
    phase: BullRunPhase,
    volatility: { level: string; score: number }
  ): number {
    let baseMultiplier = 1.0;

    // Phase-based multiplier
    switch (phase) {
      case 'BULL_RUN_ACCELERATING':
        baseMultiplier = 1.5; // AGGRESSIVE
        break;
      case 'BULL_RUN_SUSTAINED':
        baseMultiplier = 1.3; // Very aggressive
        break;
      case 'GROWTH_PHASE':
        baseMultiplier = 1.0; // Normal
        break;
      case 'COOLING_PHASE':
        baseMultiplier = 0.6; // Conservative
        break;
      case 'BEAR_WEAKNESS':
        baseMultiplier = 0.3; // Very conservative
        break;
      case 'BEAR_CRASH':
        baseMultiplier = 0.1; // Minimal (wait it out)
        break;
    }

    // Volatility adjustment (reduce multiplier for high volatility)
    if (volatility.level === 'EXTREME') {
      baseMultiplier *= 0.5; // Cut in half for extreme volatility
    } else if (volatility.level === 'HIGH') {
      baseMultiplier *= 0.7; // Reduce by 30% for high volatility
    }

    // Score-based fine-tuning (gradual scale)
    const scoreAdjustment = (score / 100) * 0.5; // Score adds 0-50% more aggressiveness
    const finalMultiplier = baseMultiplier * (1 + (scoreAdjustment - 0.25));

    return Math.min(2.0, Math.max(0.1, finalMultiplier));
  }

  /**
   * Store regime analysis in database
   */
  private async storeRegimeAnalysis(
    walletId: string,
    score: number,
    phase: BullRunPhase,
    riskMultiplier: number
  ): Promise<void> {
    try {
      await supabase.from('bull_run_regime_analysis').insert({
        wallet_id: walletId,
        regime_score: score,
        regime_phase: phase,
        risk_multiplier: riskMultiplier,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[BullRun] Error storing analysis:', error);
    }
  }

  /**
   * Check for regime transitions (alert user)
   */
  private async checkRegimeTransitions(walletId: string, currentPhase: BullRunPhase): Promise<void> {
    const lastRecord = await this.getLastRegimeRecord(walletId);

    if (lastRecord && lastRecord.regime_phase !== currentPhase) {
      console.log(
        `[BullRun] ⚠️ REGIME TRANSITION: ${walletId} from ${lastRecord.regime_phase} → ${currentPhase}`
      );

      // Alert severity depends on transition
      const isDowngrade =
        this.getPhaseRanking(currentPhase) < this.getPhaseRanking(lastRecord.regime_phase);

      if (isDowngrade) {
        console.log(`[BullRun] ⚠️ ALERT: Market cooling detected. Reducing position sizes.`);
      } else {
        console.log(`[BullRun] ✓ Market improving. Can increase aggression.`);
      }

      // Store transition event
      await this.storeRegimeTransition(walletId, lastRecord.regime_phase, currentPhase);
    }
  }

  private getPhaseRanking(phase: BullRunPhase): number {
    const ranking: Record<BullRunPhase, number> = {
      BULL_RUN_ACCELERATING: 100,
      BULL_RUN_SUSTAINED: 85,
      GROWTH_PHASE: 60,
      COOLING_PHASE: 40,
      BEAR_WEAKNESS: 20,
      BEAR_CRASH: 0,
    };
    return ranking[phase];
  }

  private async getLastRegimeRecord(walletId: string): Promise<any> {
    try {
      const { data } = await supabase
        .from('bull_run_regime_analysis')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false })
        .limit(1);

      return data?.[0] || null;
    } catch (error) {
      return null;
    }
  }

  private async storeRegimeTransition(
    walletId: string,
    fromPhase: BullRunPhase,
    toPhase: BullRunPhase
  ): Promise<void> {
    try {
      await supabase.from('bull_run_regime_transitions').insert({
        wallet_id: walletId,
        from_phase: fromPhase,
        to_phase: toPhase,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[BullRun] Error storing transition:', error);
    }
  }

  /**
   * Get current regime for display/monitoring
   */
  async getCurrentRegime(walletId: string): Promise<BullRunRegime | null> {
    try {
      const { data } = await supabase
        .from('bull_run_regime_analysis')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!data || data.length === 0) return null;

      const record = data[0];
      return {
        phase: record.regime_phase as BullRunPhase,
        score: record.regime_score,
        riskMultiplier: record.risk_multiplier,
        timestamp: new Date(record.created_at).getTime(),
      };
    } catch (error) {
      console.error('[BullRun] Error fetching current regime:', error);
      return null;
    }
  }

  /**
   * Get regime history for charting
   */
  async getRegimeHistory(walletId: string, hours: number = 24): Promise<any[]> {
    try {
      const fromTime = new Date(Date.now() - hours * 3600000);

      const { data } = await supabase
        .from('bull_run_regime_analysis')
        .select('*')
        .eq('wallet_id', walletId)
        .gte('created_at', fromTime.toISOString())
        .order('created_at', { ascending: true });

      return data || [];
    } catch (error) {
      console.error('[BullRun] Error fetching history:', error);
      return [];
    }
  }
}

export const bullRunIntelligenceEngine = new BullRunIntelligenceEngine();