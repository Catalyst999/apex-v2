/**
 * REGIME DETECTOR
 * Identifies current market regime
 * Adapts signal generation, filtering, and execution rules
 */

export type MarketRegime = 'mania' | 'chop' | 'trending' | 'dump' | 'sleeping';

export interface RegimeState {
  regime: MarketRegime;
  confidence: number; // 0-100
  signalCount: number; // signals in last hour
  volatility: number; // 0-100
  trendStrength: number; // 0-100
  volumeActivity: number; // 0-100
  dominantNarrative: string;
  transitionTime: number; // when did we enter this regime
  indicators: RegimeIndicators;
}

export interface RegimeIndicators {
  newTokensLaunched: number;
  graduationsPerHour: number;
  avgHoldTime: number;
  profitRateThisHour: number;
  volatilityScore: number;
  correlationScore: number; // tokens moving together
}

export interface RegimeBehavior {
  regime: MarketRegime;
  entryFilters: {
    minConviction: number;
    maxExposure: number;
    maxSize: number;
  };
  exitRules: {
    takeProfitPercent: number;
    stopLossPercent: number;
    maxHoldTime: number;
  };
  signalGeneration: {
    looseningFactor: number; // 0.5 = loosen filters 50%
    timeoutMs: number; // rescan frequency
  };
  riskMultiplier: number; // 0.5 = half risk, 2 = double risk
}

class RegimeDetector {
  private currentRegime: RegimeState;
  private regimeBehaviors: Map<MarketRegime, RegimeBehavior> = new Map();
  private regimeHistory: RegimeState[] = [];
  private readonly REGIME_CHANGE_THRESHOLD = 0.6; // 60% confidence needed to switch

  constructor() {
    this.currentRegime = {
      regime: 'sleeping',
      confidence: 0.8,
      signalCount: 0,
      volatility: 0,
      trendStrength: 0,
      volumeActivity: 0,
      dominantNarrative: 'none',
      transitionTime: Date.now(),
      indicators: {
        newTokensLaunched: 0,
        graduationsPerHour: 0,
        avgHoldTime: 0,
        profitRateThisHour: 0,
        volatilityScore: 0,
        correlationScore: 0,
      },
    };

    this.setupRegimeBehaviors();
  }

  /**
   * SETUP REGIME-SPECIFIC BEHAVIORS
   * Define rules for each market state
   */
  private setupRegimeBehaviors(): void {
    // MANIA: Euphoric, rapid launches, high win rates
    this.regimeBehaviors.set('mania', {
      regime: 'mania',
      entryFilters: {
        minConviction: 50, // LOOSEN - accept lower conviction
        maxExposure: 100, // more aggressive
        maxSize: 5000, // larger positions
      },
      exitRules: {
        takeProfitPercent: 50, // take profits faster
        stopLossPercent: 5, // tight stops
        maxHoldTime: 30 * 60 * 1000, // 30 min max
      },
      signalGeneration: {
        looseningFactor: 1.5, // loosen filters 50%
        timeoutMs: 2000, // scan more frequently
      },
      riskMultiplier: 1.5, // take more risk
    });

    // CHOP: Ranging, low conviction, choppy price
    this.regimeBehaviors.set('chop', {
      regime: 'chop',
      entryFilters: {
        minConviction: 80, // TIGHTEN - only best signals
        maxExposure: 40, // conservative
        maxSize: 1000, // small positions
      },
      exitRules: {
        takeProfitPercent: 10, // take small wins
        stopLossPercent: 3, // tight stops
        maxHoldTime: 10 * 60 * 1000, // 10 min max
      },
      signalGeneration: {
        looseningFactor: 0.7, // tighten filters 30%
        timeoutMs: 10000, // scan less frequently
      },
      riskMultiplier: 0.5, // reduce risk significantly
    });

    // TRENDING: Strong directional move
    this.regimeBehaviors.set('trending', {
      regime: 'trending',
      entryFilters: {
        minConviction: 65,
        maxExposure: 70,
        maxSize: 3000,
      },
      exitRules: {
        takeProfitPercent: 30,
        stopLossPercent: 8,
        maxHoldTime: 60 * 60 * 1000, // 1 hour
      },
      signalGeneration: {
        looseningFactor: 1.1,
        timeoutMs: 3000,
      },
      riskMultiplier: 1.2,
    });

    // DUMP: Market crashing, high volatility
    this.regimeBehaviors.set('dump', {
      regime: 'dump',
      entryFilters: {
        minConviction: 90, // VERY TIGHT
        maxExposure: 20,
        maxSize: 500,
      },
      exitRules: {
        takeProfitPercent: 5,
        stopLossPercent: 2,
        maxHoldTime: 5 * 60 * 1000, // 5 min
      },
      signalGeneration: {
        looseningFactor: 0.5, // tighten significantly
        timeoutMs: 30000, // scan rarely
      },
      riskMultiplier: 0.2, // minimal risk
    });

    // SLEEPING: Dead market
    this.regimeBehaviors.set('sleeping', {
      regime: 'sleeping',
      entryFilters: {
        minConviction: 85,
        maxExposure: 30,
        maxSize: 1000,
      },
      exitRules: {
        takeProfitPercent: 20,
        stopLossPercent: 5,
        maxHoldTime: 120 * 60 * 1000, // 2 hours
      },
      signalGeneration: {
        looseningFactor: 0.8,
        timeoutMs: 15000,
      },
      riskMultiplier: 0.7,
    });
  }

  /**
   * DETECT REGIME
   * Analyze market indicators and determine current regime
   */
  detectRegime(
    signalCount: number,
    avgHoldTime: number,
    profitRate: number,
    volatility: number,
    dominantNarrative: string,
  ): RegimeState {
    // Score each regime
    const scores = {
      mania: this.scoreForMania(signalCount, profitRate, volatility),
      chop: this.scoreForChop(volatility, avgHoldTime, profitRate),
      trending: this.scoreForTrending(signalCount, profitRate),
      dump: this.scoreForDump(profitRate, volatility),
      sleeping: this.scoreForSleeping(signalCount),
    };

    // Find winning regime
    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const topRegime = sorted[0][0] as MarketRegime;
    const topScore = sorted[0][1];

    // Only switch if confidence is high enough
    if (topScore >= this.REGIME_CHANGE_THRESHOLD || topRegime === 'sleeping') {
      if (topRegime !== this.currentRegime.regime) {
        console.log(`[Regime] Switch: ${this.currentRegime.regime} → ${topRegime} (confidence: ${(topScore * 100).toFixed(0)}%)`);
      }

      this.currentRegime = {
        regime: topRegime,
        confidence: topScore,
        signalCount,
        volatility,
        trendStrength: scores.trending * 100,
        volumeActivity: signalCount * 10,
        dominantNarrative,
        transitionTime: Date.now(),
        indicators: {
          newTokensLaunched: signalCount,
          graduationsPerHour: signalCount / 60,
          avgHoldTime,
          profitRateThisHour: profitRate,
          volatilityScore: volatility,
          correlationScore: volatility * 0.7,
        },
      };

      this.regimeHistory.push(this.currentRegime);
    }

    return this.currentRegime;
  }

  private scoreForMania(signals: number, profitRate: number, volatility: number): number {
    return Math.min(1, signals / 30 * 0.4 + profitRate / 100 * 0.4 + volatility / 100 * 0.2);
  }

  private scoreForChop(volatility: number, holdTime: number, profitRate: number): number {
    // High volatility but low profit = chop
    const choppyVolatility = volatility > 50 ? 0.7 : 0.3;
    const lowProfit = profitRate < 40 ? 0.7 : 0.2;
    return Math.min(1, choppyVolatility * 0.5 + lowProfit * 0.5);
  }

  private scoreForTrending(signals: number, profitRate: number): number {
    return Math.min(1, profitRate / 100 * 0.7 + signals / 20 * 0.3);
  }

  private scoreForDump(profitRate: number, volatility: number): number {
    // Dump = very low profit rate, high volatility
    const dump = profitRate < 20 ? 0.8 : 0.2;
    const volDump = volatility > 80 ? 0.9 : 0.3;
    return Math.min(1, dump * 0.6 + volDump * 0.4);
  }

  private scoreForSleeping(signals: number): number {
    // Very few signals = sleeping
    return Math.min(1, Math.max(0, 1 - signals / 10));
  }

  /**
   * GET CURRENT REGIME
   */
  getCurrentRegime(): RegimeState {
    return this.currentRegime;
  }

  /**
   * GET BEHAVIOR FOR CURRENT REGIME
   */
  getBehavior(): RegimeBehavior {
    return this.regimeBehaviors.get(this.currentRegime.regime) || this.regimeBehaviors.get('sleeping')!;
  }

  /**
   * GET BEHAVIOR FOR SPECIFIC REGIME
   */
  getBehaviorForRegime(regime: MarketRegime): RegimeBehavior {
    return this.regimeBehaviors.get(regime) || this.regimeBehaviors.get('sleeping')!;
  }

  /**
   * REGIME HISTORY
   */
  getRegimeHistory(): RegimeState[] {
    return this.regimeHistory.slice(-24); // last 24 regimes
  }

  /**
   * SHOULD WE TRADE NOW?
   * Based on regime, is it worth trading?
   */
  shouldTrade(): boolean {
    const behavior = this.getBehavior();
    // Don't trade in heavy dump, only at conviction > 90%
    if (this.currentRegime.regime === 'dump') {
      return false; // too risky
    }
    // Don't trade when sleeping unless very high conviction
    if (this.currentRegime.regime === 'sleeping') {
      return false; // wait for better opportunity
    }
    return true;
  }
}

export const regimeDetector = new RegimeDetector();