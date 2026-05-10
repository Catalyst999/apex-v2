// src/services/intelligence/revival-engine/revival-engine.ts
/**
 * REVIVAL ENGINE ORCHESTRATOR
 * Coordinates all revival detection components
 * Event-driven integration with system
 */

import { runtimeState } from '../../../core/state/runtime-state';
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';
import { dormancyDetector } from './dormancy-detector';
import { reactivationVelocityDetector } from './reactivation-velocity';
import { walletCoordinationAnalyzer } from './wallet-coordination';
import { liquidityTrustScorer } from './liquidity-trust-scorer';
import { attentionIgnitionEngine } from './attention-ignition';
import { lifecycleStateMachine } from './lifecycle-state-machine';
import { behavioralInterpreter } from './behavioral-interpreter';
import { signalEscalation } from './signal-escalation';
import { revivalWatchlist } from './revival-watchlist';
import { REVIVAL_ENGINE } from '../../../core/config';

class RevivalEngine {
  private isRunning: boolean = false;

  /**
   * INITIALIZE
   */
  async initialize(): Promise<void> {
    console.log('[RevivalEngine] Initializing...');

    if (!REVIVAL_ENGINE.ENABLE_REVIVAL_ENGINE) {
      console.log('[RevivalEngine] Disabled in config');
      return;
    }

    // Subscribe to relevant events
    eventOrchestrator.subscribe('SIGNAL_DETECTED', (event: any) => {
      this.onSignalDetected(event);
    });

    eventOrchestrator.subscribe('MARKET_DATA_UPDATED', (event: any) => {
      this.onMarketDataUpdated(event);
    });

    this.isRunning = true;
    console.log('[RevivalEngine] ✓ Initialized');
  }

  /**
   * ANALYZE TOKEN
   */
  async analyzeToken(
    token: string,
    tokenData: {
      marketData: any;
      holderData: any;
      socialData: any;
      liquidityData: any;
    },
  ): Promise<void> {
    console.log(`[RevivalEngine] Analyzing ${token}...`);

    // Get scores from all modules
    const dormancy = await dormancyDetector.analyzeDormancy(
      token,
      tokenData.marketData,
      [tokenData.holderData],
    );

    if (dormancy.dormancyScore < 50) {
      // Not dormant enough
      return;
    }

    // If dormant, analyze further
    const velocity = await reactivationVelocityDetector.detectReactivation(
      token,
      tokenData.marketData,
      {},
    );

    const coordination = await walletCoordinationAnalyzer.analyzeCoordination(
      token,
      tokenData.holderData.buyers || [],
      tokenData.holderData.amounts || [],
    );

    const liquidity = await liquidityTrustScorer.scoreLiquidityTrust(
      token,
      tokenData.liquidityData,
    );

    const ignition = await attentionIgnitionEngine.detectIgnition(
      token,
      tokenData.socialData,
      [],
    );

    // Interpret behavior
    const behavior = await behavioralInterpreter.interpretBehavior(token, {
      dormancy: dormancy.dormancyScore,
      velocity: velocity.velocityScore,
      coordination: coordination.coordinationScore,
      ignition: ignition.ignitionScore,
      liquidity: liquidity.trustScore,
    });

    // Assess asymmetry
    const asymmetry = behavioralInterpreter.assessAsymmetry({
      dormancy: dormancy.dormancyScore,
      velocity: velocity.velocityScore,
      coordination: coordination.coordinationScore,
      ignition: ignition.ignitionScore,
      liquidity: liquidity.trustScore,
    });

    // Escalate signal
    const escalation = await signalEscalation.escalateSignal(token, {
      dormancy: dormancy.dormancyScore,
      velocity: velocity.velocityScore,
      coordination: coordination.coordinationScore,
      ignition: ignition.ignitionScore,
      liquidity: liquidity.trustScore,
      asymmetry,
    });

    // Determine lifecycle state
    const state = lifecycleStateMachine.determineState(
      dormancy.dormancyScore,
      velocity.velocityScore,
      ignition.ignitionScore,
    );

    // Update runtime state
    const candidate = runtimeState.getRevivalCandidate(token) || {
      id: `revival-${token}-${Date.now()}`,
      token,
      dormancyScore: dormancy.dormancyScore,
      reactivationVelocity: velocity.velocityScore,
      walletCoordinationScore: coordination.coordinationScore,
      liquidityTrustScore: liquidity.trustScore,
      attentionIgnitionScore: ignition.ignitionScore,
      lifecycleState: state,
      escalationLevel: escalation.escalationLevel,
      detectedAt: Date.now(),
      lastUpdated: Date.now(),
      expiresAt: Date.now() + 86400000, // 24h TTL
    };

    runtimeState.addRevivalCandidate(candidate);

    console.log(
      `[RevivalEngine] ✓ ${token}: ${state} (Level: ${escalation.escalationLevel}, Asymmetry: ${asymmetry})`,
    );
  }

  /**
   * EVENT HANDLERS
   */
  private async onSignalDetected(event: any): Promise<void> {
    // When a signal is detected, check if it's a revival candidate
    const { token } = event.payload;
    // Will be analyzed in next cycle
  }

  private async onMarketDataUpdated(event: any): Promise<void> {
    // Update analysis for watched tokens
    const watched = revivalWatchlist.getWatchlist();
    for (const entry of watched) {
      // Could analyze here, but prefer periodic analysis
    }
  }

  /**
   * GET STATUS
   */
  getStatus() {
    return {
      running: this.isRunning,
      candidates: runtimeState.getRevivalStats(),
      watchlist: revivalWatchlist.getSize(),
      type: 'REVIVAL_ENGINE',
    };
  }

  /**
   * SHUTDOWN
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    console.log('[RevivalEngine] Shutdown complete');
  }
}

export const revivalEngine = new RevivalEngine();