// src/services/intelligence/revival-engine/signal-escalation.ts
import { runtimeState } from '../../../core/state/runtime-state';
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';
import { REVIVAL_ENGINE } from '../../../core/config';

class SignalEscalation {
  /**
   * ESCALATE SIGNAL
   * Route based on conviction level
   */
  async escalateSignal(
    token: string,
    metrics: {
      dormancy: number;
      velocity: number;
      coordination: number;
      ignition: number;
      liquidity: number;
      asymmetry: number;
    },
  ): Promise<{
    escalationLevel: number;
    action: 'MONITOR' | 'WATCH' | 'ENRICH' | 'EXECUTE';
  }> {
    // Calculate composite score
    const score =
      (metrics.dormancy * 0.15 +
        metrics.velocity * 0.2 +
        metrics.coordination * 0.2 +
        metrics.ignition * 0.25 +
        metrics.liquidity * 0.1 +
        metrics.asymmetry * 0.1) /
      100;

    const escalationLevel = Math.round(score * 100);

    // Determine action
    let action: 'MONITOR' | 'WATCH' | 'ENRICH' | 'EXECUTE' = 'MONITOR';

    if (escalationLevel > REVIVAL_ENGINE.SIGNAL_THRESHOLD) {
      action = 'EXECUTE'; // High conviction
    } else if (escalationLevel > REVIVAL_ENGINE.SIGNAL_THRESHOLD - 15) {
      action = 'ENRICH'; // Medium-high conviction
    } else if (escalationLevel > REVIVAL_ENGINE.SIGNAL_THRESHOLD - 30) {
      action = 'WATCH'; // Medium conviction
    }

    const candidate = runtimeState.getRevivalCandidate(token);
    if (candidate) {
      runtimeState.updateRevivalEscalation(token, escalationLevel);
    }

    console.log(
      `[Escalation] ${token}: Level ${escalationLevel} → ${action}`,
    );

    await eventOrchestrator.revivalEvent(
      'ESCALATION',
      token,
      {
        escalationLevel,
        action,
        metrics,
        priority: action === 'EXECUTE' ? 'CRITICAL' : action === 'ENRICH' ? 'HIGH' : 'NORMAL',
      },
    );

    return { escalationLevel, action };
  }

  /**
   * SHOULD ENRICH (Helius API call)
   */
  shouldEnrich(escalationLevel: number): boolean {
    return escalationLevel > 65;
  }

  /**
   * SHOULD EXECUTE
   */
  shouldExecute(escalationLevel: number): boolean {
    return escalationLevel > REVIVAL_ENGINE.SIGNAL_THRESHOLD;
  }

  /**
   * GET POSITION SIZE MULTIPLIER
   */
  getPositionSizeMultiplier(escalationLevel: number): number {
    if (escalationLevel > 90) return 2.0;
    if (escalationLevel > 80) return 1.5;
    if (escalationLevel > 70) return 1.0;
    return 0.5;
  }
}

export const signalEscalation = new SignalEscalation();