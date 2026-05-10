/**
 * INTEGRATION 1 HARMONIZER
 * Connects 10 new Intelligence modules to D7 core systems
 * Philosophy: Intelligence feeds execution, not vice versa
 */

import { supabase } from './core/db/supabase';
import { runtimeState, MarketRegimeState, ActiveSignal } from './core/state/runtime-state';
import { regimeDetector, RegimeState } from './core/regime-detector';

// Import Integration 1 modules (once they exist)
// import { SignalQualityScoreboard } from './signal-quality-scoreboard';
// import { DontTradeIntelligence } from './dont-trade-intelligence';
// import { AbnormalityEngine } from '../services/intelligence/abnormality-engine';
// import { MetaSaturationDetector } from '../services/intelligence/meta-saturation-detector';
// import { TimeToFailureAnalyzer } from '../services/intelligence/time-to-failure-analyzer';
// import { AsymmetricEntryEngine } from '../services/intelligence/asymmetric-entry-engine';
// import { InformationCompressor } from '../services/intelligence/information-compressor';
// import { SelfTuningThresholds } from './self-tuning-thresholds';
// import { PersonalEdgeModeler } from './personal-edge-modeler';

interface Integration1State {
  isInitialized: boolean;
  lastHarmonizeTime: number;
  lastRegimeState: RegimeState | null;
}

class Integration1Harmonizer {
  private state: Integration1State = {
    isInitialized: false,
    lastHarmonizeTime: 0,
    lastRegimeState: null,
  };

  async initialize(): Promise<void> {
    try {
      console.log('[INT1] Initializing Integration 1 harmonizer...');

      // Register harmonizer with event system
      runtimeState.on('signal:added', (signal: ActiveSignal) => {
        this.harmonizeNewSignal(signal);
      });

      this.state.isInitialized = true;
      console.log('[INT1] ✅ Integration 1 harmonizer initialized');
    } catch (error) {
      console.error('[INT1] ❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * HARMONIZE REGIME INTO RUNTIME STATE
   * Convert RegimeState from detector into MarketRegimeState for runtime
   */
  private regimeStateToMarketRegimeState(regimeState: RegimeState): MarketRegimeState {
    // Map detector regime to runtime regime format
    let mappedRegime: 'HEALTHY' | 'WARMING' | 'COLD';

    switch (regimeState.regime) {
      case 'mania':
        mappedRegime = 'WARMING';
        break;
      case 'trending':
        mappedRegime = 'HEALTHY';
        break;
      case 'chop':
        mappedRegime = 'WARMING';
        break;
      case 'dump':
        mappedRegime = 'COLD';
        break;
      case 'sleeping':
        mappedRegime = 'COLD';
        break;
      default:
        mappedRegime = 'HEALTHY';
    }

    return {
      regime: mappedRegime,
      score: Math.round(regimeState.confidence * 100),
      reason: `Market regime: ${regimeState.regime} (volatility: ${regimeState.volatility.toFixed(1)}, signals: ${regimeState.signalCount})`,
      lastUpdate: regimeState.transitionTime,
      multiplier: this.getRegimeMultiplier(regimeState.regime),
    };
  }

  /**
   * GET RISK MULTIPLIER BASED ON REGIME
   */
  private getRegimeMultiplier(regime: string): number {
    const multipliers: { [key: string]: number } = {
      mania: 1.5,
      trending: 1.2,
      chop: 0.5,
      dump: 0.2,
      sleeping: 0.7,
    };
    return multipliers[regime] || 1.0;
  }

  /**
   * DETECT AND SYNC REGIME WITH RUNTIME STATE
   */
  async detectAndSyncRegime(data: {
    signalCount: number;
    avgHoldTime: number;
    profitRate: number;
    volatility: number;
    dominantNarrative: string;
  }): Promise<void> {
    try {
      // Run regime detection
      const regimeState = regimeDetector.detectRegime(
        data.signalCount,
        data.avgHoldTime,
        data.profitRate,
        data.volatility,
        data.dominantNarrative
      );

      this.state.lastRegimeState = regimeState;

      // Convert to MarketRegimeState format
      const marketRegimeState = this.regimeStateToMarketRegimeState(regimeState);

      // Sync to runtime state
      runtimeState.setRegime(marketRegimeState);

      console.log(
        `[INT1] Regime synced: ${regimeState.regime} → ${marketRegimeState.regime} (confidence: ${(regimeState.confidence * 100).toFixed(0)}%)`
      );
    } catch (error) {
      console.error('[INT1] Error detecting and syncing regime:', error);
    }
  }

  /**
   * HARMONIZE NEW SIGNAL WITH REGIME CONTEXT
   */
  private harmonizeNewSignal(signal: ActiveSignal): void {
    if (!this.state.isInitialized) return;

    try {
      // Get current regime
      const runtimeRegime = runtimeState.getRegime();
      if (!runtimeRegime) return;

      // Get detector regime for detailed rules
      const detectorRegime = regimeDetector.getCurrentRegime();
      const behavior = regimeDetector.getBehavior();

      // Apply regime-specific conviction filtering
      let adjustedConviction = signal.conviction;

      // Tighten in choppy/dump markets
      if (runtimeRegime.regime === 'COLD') {
        adjustedConviction = signal.conviction * 0.8; // reduce conviction in cold markets
      }
      // Loosen in hot markets
      else if (runtimeRegime.regime === 'WARMING') {
        adjustedConviction = signal.conviction * 1.2; // increase conviction in hot markets
      }

      // Clamp to 0-100
      adjustedConviction = Math.max(0, Math.min(100, adjustedConviction));

      // Check if we should skip based on regime rules
      if (
        adjustedConviction < behavior.entryFilters.minConviction ||
        adjustedConviction < 50 && detectorRegime.regime === 'dump'
      ) {
        runtimeState.updateSignalStatus(
          signal.id,
          'SKIPPED',
          `Regime-filtered (${detectorRegime.regime} market, min conviction: ${behavior.entryFilters.minConviction})`
        );
        return;
      }

      // Update signal with regime adjustment
      runtimeState.updateSignalStatus(signal.id, 'SCORED');

      console.log(`[INT1] Signal harmonized: ${signal.token} (conviction: ${signal.conviction}% → ${adjustedConviction.toFixed(0)}%)`);
    } catch (error) {
      console.error('[INT1] Error harmonizing signal:', error);
    }
  }

  /**
   * GET CURRENT REGIME INFO
   */
  getCurrentRegimeInfo(): {
    detector: RegimeState | null;
    runtime: MarketRegimeState | null;
    multiplier: number;
  } {
    const detectorRegime = regimeDetector.getCurrentRegime();
    const runtimeRegime = runtimeState.getRegime();

    return {
      detector: detectorRegime,
      runtime: runtimeRegime,
      multiplier: runtimeRegime?.multiplier ?? 1.0,
    };
  }

  /**
   * GET BEHAVIOR RULES FOR CURRENT REGIME
   */
  getBehaviorRules() {
    return regimeDetector.getBehavior();
  }

  /**
   * CHECK IF SHOULD TRADE BASED ON REGIME
   */
  shouldTradeNow(): boolean {
    return regimeDetector.shouldTrade();
  }

  /**
   * GET STATUS
   */
  getStatus(): {
    isInitialized: boolean;
    lastHarmonizeTime: number;
    lastRegime: string | null;
  } {
    return {
      isInitialized: this.state.isInitialized,
      lastHarmonizeTime: this.state.lastHarmonizeTime,
      lastRegime: this.state.lastRegimeState?.regime ?? null,
    };
  }
}

export const integration1Harmonizer = new Integration1Harmonizer();