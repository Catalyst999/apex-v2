/**
 * SIGNAL QUALITY SCOREBOARD
 * Tracks performance of every intelligence module
 * Enables adaptive weighting based on regime and historical performance
 */

export interface ModuleMetrics {
  moduleName: string;
  winRate: number; // % of signals that were profitable
  falsePositives: number; // % that went against prediction
  avgROI: number; // average return
  avgHoldTime: number; // milliseconds
  totalSignals: number;
  profitableSignals: number;
  lossSignals: number;
  trustScore: number; // 0-100, higher = more reliable
  lastUpdated: number;
  performanceByRegime: {
    mania: ModuleMetrics;
    chop: ModuleMetrics;
    trending: ModuleMetrics;
    dump: ModuleMetrics;
  };
}

export interface ConvictionScore {
  signal: string;
  baseConviction: number; // 0-100 from module
  moduleWeight: number; // how much to trust this module (adaptive)
  regimeMultiplier: number; // boost/reduce based on current regime
  finalConviction: number; // baseConviction * moduleWeight * regimeMultiplier
  confidence: number; // how certain are we in this conviction
  reasoning: string;
}

class SignalQualityScoreboard {
  private metrics: Map<string, ModuleMetrics> = new Map();
  private signalHistory: Array<{ signal: string; prediction: number; outcome: number; timestamp: number }> = [];

  /**
   * REGISTER MODULE
   * Initialize tracking for a signal module
   */
  registerModule(moduleName: string): void {
    const metrics: ModuleMetrics = {
      moduleName,
      winRate: 0,
      falsePositives: 0,
      avgROI: 0,
      avgHoldTime: 0,
      totalSignals: 0,
      profitableSignals: 0,
      lossSignals: 0,
      trustScore: 50, // neutral until proven
      lastUpdated: Date.now(),
      performanceByRegime: {
        mania: { ...this.emptyMetrics() },
        chop: { ...this.emptyMetrics() },
        trending: { ...this.emptyMetrics() },
        dump: { ...this.emptyMetrics() },
      },
    };

    this.metrics.set(moduleName, metrics);
    console.log(`[Scoreboard] Registered module: ${moduleName}`);
  }

  /**
   * LOG SIGNAL OUTCOME
   * Called when a signal resolves (trade closes)
   */
  logSignalOutcome(
    moduleName: string,
    signal: string,
    conviction: number,
    entryPrice: number,
    exitPrice: number,
    holdTime: number,
    regime: string,
  ): void {
    const roi = ((exitPrice - entryPrice) / entryPrice) * 100;
    const isProfitable = roi > 0;

    const metrics = this.metrics.get(moduleName);
    if (!metrics) {
      console.warn(`Module ${moduleName} not registered`);
      return;
    }

    // Update overall metrics
    metrics.totalSignals++;
    metrics.avgROI = (metrics.avgROI * (metrics.totalSignals - 1) + roi) / metrics.totalSignals;
    metrics.avgHoldTime = (metrics.avgHoldTime * (metrics.totalSignals - 1) + holdTime) / metrics.totalSignals;

    if (isProfitable) {
      metrics.profitableSignals++;
    } else {
      metrics.lossSignals++;
    }

    metrics.winRate = (metrics.profitableSignals / metrics.totalSignals) * 100;

    // Update regime-specific metrics
    const regimeMetrics = metrics.performanceByRegime[regime as keyof typeof metrics.performanceByRegime];
    if (regimeMetrics) {
      regimeMetrics.totalSignals++;
      regimeMetrics.avgROI = (regimeMetrics.avgROI * (regimeMetrics.totalSignals - 1) + roi) / regimeMetrics.totalSignals;
      regimeMetrics.winRate = isProfitable
        ? ((regimeMetrics.profitableSignals || 0) + 1) / regimeMetrics.totalSignals * 100
        : (regimeMetrics.profitableSignals || 0) / regimeMetrics.totalSignals * 100;
    }

    // Update trust score (0-100)
    metrics.trustScore = Math.min(100, Math.max(0, metrics.winRate * 0.7 + (metrics.avgROI / 10) * 0.3));
    metrics.lastUpdated = Date.now();

    // Track in history
    this.signalHistory.push({
      signal,
      prediction: conviction,
      outcome: roi,
      timestamp: Date.now(),
    });

    console.log(`[Scoreboard] ${moduleName} outcome: ${signal} ${isProfitable ? '✅' : '❌'} ${roi.toFixed(2)}%`);
  }

  /**
   * GET ADAPTIVE WEIGHT
   * What weight should this module have right now?
   */
  getModuleWeight(moduleName: string, currentRegime: string): number {
    const metrics = this.metrics.get(moduleName);
    if (!metrics) return 0.5; // neutral

    // Base weight from overall trust score
    let weight = metrics.trustScore / 100;

    // Adjust based on regime-specific performance
    const regimeMetrics = metrics.performanceByRegime[currentRegime as keyof typeof metrics.performanceByRegime];
    if (regimeMetrics && regimeMetrics.totalSignals > 10) {
      // Only use regime-specific weight if we have enough data
      const regimeWeight = regimeMetrics.winRate / 100;
      weight = weight * 0.5 + regimeWeight * 0.5; // blend with overall
    }

    return Math.max(0, Math.min(1, weight)); // clamp 0-1
  }

  /**
   * CALCULATE FINAL CONVICTION
   * Blend module conviction with trust + regime
   */
  calculateFinalConviction(moduleName: string, baseConviction: number, currentRegime: string): ConvictionScore {
    const metrics = this.metrics.get(moduleName);
    if (!metrics) {
      return {
        signal: moduleName,
        baseConviction,
        moduleWeight: 0.5,
        regimeMultiplier: 1,
        finalConviction: baseConviction * 0.5,
        confidence: 0.3,
        reasoning: 'Module not registered',
      };
    }

    const moduleWeight = this.getModuleWeight(moduleName, currentRegime);

    // Regime multiplier
    let regimeMultiplier = 1;
    const regimeMetrics = metrics.performanceByRegime[currentRegime as keyof typeof metrics.performanceByRegime];
    if (regimeMetrics && regimeMetrics.totalSignals > 10) {
      // Boost if this module performs well in current regime
      regimeMultiplier = 0.7 + (regimeMetrics.winRate / 100) * 0.6; // 0.7 to 1.3
    }

    const finalConviction = baseConviction * moduleWeight * regimeMultiplier;

    return {
      signal: moduleName,
      baseConviction,
      moduleWeight,
      regimeMultiplier,
      finalConviction: Math.min(100, Math.max(0, finalConviction)),
      confidence: moduleWeight * 0.8, // higher weight = higher confidence
      reasoning: `Base: ${baseConviction.toFixed(0)}, Weight: ${(moduleWeight * 100).toFixed(0)}%, Regime: ${(regimeMultiplier * 100).toFixed(0)}%`,
    };
  }

  /**
   * GET MODULE STATS
   */
  getModuleStats(moduleName: string) {
    return this.metrics.get(moduleName) || null;
  }

  /**
   * GET ALL MODULES RANKED
   */
  getAllModulesRanked(): ModuleMetrics[] {
    return Array.from(this.metrics.values()).sort((a, b) => b.trustScore - a.trustScore);
  }

  /**
   * ADAPTIVE WEIGHTING REPORT
   */
  getAdaptiveWeightingReport(currentRegime: string): any {
    const modules = this.getAllModulesRanked();
    return {
      regime: currentRegime,
      modules: modules.map((m) => ({
        name: m.moduleName,
        trustScore: m.trustScore.toFixed(1),
        winRate: m.winRate.toFixed(1) + '%',
        avgROI: m.avgROI.toFixed(2) + '%',
        weight: (this.getModuleWeight(m.moduleName, currentRegime) * 100).toFixed(0) + '%',
        regimeSpecificWR:
          m.performanceByRegime[currentRegime as keyof typeof m.performanceByRegime]?.winRate?.toFixed(1) || 'N/A',
      })),
    };
  }

  private emptyMetrics(): any {
    return {
      moduleName: '',
      winRate: 0,
      falsePositives: 0,
      avgROI: 0,
      avgHoldTime: 0,
      totalSignals: 0,
      profitableSignals: 0,
      lossSignals: 0,
      trustScore: 50,
      lastUpdated: Date.now(),
      performanceByRegime: {},
    };
  }
}

export const signalQualityScoreboard = new SignalQualityScoreboard();