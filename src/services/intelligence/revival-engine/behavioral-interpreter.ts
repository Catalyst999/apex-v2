// src/services/intelligence/revival-engine/behavioral-interpreter.ts
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';

export interface BehavioralPattern {
  token: string;
  pattern: string;
  confidence: number;
  interpretation: string;
}

class BehavioralInterpreter {
  /**
   * INTERPRET REVIVAL BEHAVIOR
   * What is the market emotionally trying to do?
   * NOT just "volume increased" but "why coordinated activity sudden"
   */
  async interpretBehavior(
    token: string,
    metrics: {
      dormancy: number;
      velocity: number;
      coordination: number;
      ignition: number;
      liquidity: number;
    },
  ): Promise<BehavioralPattern> {
    let pattern = '';
    let interpretation = '';
    let confidence = 0.5;

    // Silent accumulation pattern
    if (metrics.dormancy > 70 && metrics.coordination > 70 && metrics.ignition < 50) {
      pattern = 'STEALTH_ACCUMULATION';
      interpretation =
        'Coordinated buying from dormant token - likely smart money positioning before announcement';
      confidence = 0.85;
    }

    // Liquidity preparation pattern
    if (metrics.dormancy > 60 && metrics.liquidity > 70 && metrics.velocity > 40) {
      pattern = 'LIQUIDITY_PREPARATION';
      interpretation = 'LP increase + wallet coordination - preparing for volume surge';
      confidence = 0.8;
    }

    // Attention ignition pattern
    if (metrics.ignition > 75 && metrics.velocity > 60) {
      pattern = 'ATTENTION_IGNITION';
      interpretation = 'Viral social surge + volume acceleration - early asymmetric window';
      confidence = 0.9;
    }

    // Fakeout pattern
    if (metrics.ignition > 70 && metrics.liquidity < 30) {
      pattern = 'FAKEOUT_RISK';
      interpretation = 'High attention + low liquidity stability - manipulation risk';
      confidence = 0.75;
    }

    // Exhaustion pattern
    if (metrics.ignition > 50 && metrics.velocity < 20) {
      pattern = 'NARRATIVE_EXHAUSTION';
      interpretation = 'Attention peaked, momentum declining - exit phase';
      confidence = 0.7;
    }

    return {
      token,
      pattern,
      confidence,
      interpretation,
    };
  }

  /**
   * ASSESS ASYMMETRY RATING
   * How asymmetric is this opportunity?
   */
  assessAsymmetry(metrics: {
    dormancy: number;
    velocity: number;
    ignition: number;
    coordination: number;
    liquidity: number;
  }): number {
    let asymmetryScore = 0;

    // Dormant + waking = asymmetric
    if (metrics.dormancy > 60 && metrics.velocity > 50) asymmetryScore += 30;

    // Coordination without attention yet = early = asymmetric
    if (metrics.coordination > 70 && metrics.ignition < 50) asymmetryScore += 25;

    // Liquidity stable + rising attention = safe asymmetry
    if (metrics.liquidity > 60 && metrics.ignition > 60) asymmetryScore += 20;

    // Multi-factor alignment = asymmetric
    const alignedFactors = [
      metrics.dormancy > 60,
      metrics.velocity > 50,
      metrics.coordination > 70,
      metrics.ignition > 60,
      metrics.liquidity > 60,
    ].filter(Boolean).length;

    asymmetryScore += alignedFactors * 10;

    return Math.min(100, asymmetryScore);
  }
}

export const behavioralInterpreter = new BehavioralInterpreter();