// src/services/intelligence/revival-engine/lifecycle-state-machine.ts
import { runtimeState } from '../../../core/state/runtime-state';
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';

type LifecycleState = 'DEAD' | 'DORMANT' | 'REACTIVATING' | 'IGNITING' | 'EXPLODING' | 'EXHAUSTION';

export interface StateTransition {
  token: string;
  from: LifecycleState;
  to: LifecycleState;
  trigger: string;
  timestamp: number;
}

class LifecycleStateMachine {
  /**
   * DETERMINE STATE FROM METRICS
   */
  determineState(
    dormancyScore: number,
    velocityScore: number,
    ignitionScore: number,
  ): LifecycleState {
    // DEAD: Very dormant, no activity
    if (dormancyScore > 85 && velocityScore < 10 && ignitionScore < 20) {
      return 'DEAD';
    }

    // DORMANT: Silent but existing
    if (dormancyScore > 60 && velocityScore < 20) {
      return 'DORMANT';
    }

    // REACTIVATING: Waking up
    if (velocityScore > 30 && ignitionScore < 50) {
      return 'REACTIVATING';
    }

    // IGNITING: Strong attention surge
    if (ignitionScore > 65 && velocityScore > 40) {
      return 'IGNITING';
    }

    // EXPLODING: Peak activity
    if (ignitionScore > 80 && velocityScore > 60) {
      return 'EXPLODING';
    }

    // EXHAUSTION: Declining from peak
    if (ignitionScore < 40 && dormancyScore < 30) {
      return 'EXHAUSTION';
    }

    // Default
    return 'DORMANT';
  }

  /**
   * TRANSITION STATE
   */
  async transitionState(
    token: string,
    newState: LifecycleState,
    trigger: string,
  ): Promise<void> {
    const candidate = runtimeState.getRevivalCandidate(token);
    if (!candidate) return;

    const oldState = candidate.lifecycleState;

    if (oldState === newState) return; // No change

    console.log(`[LifecycleSM] ${token}: ${oldState} → ${newState} (${trigger})`);

    runtimeState.updateRevivalLifecycle(token, newState);

    await eventOrchestrator.revivalEvent(
      'LIFECYCLE_CHANGE',
      token,
      {
        oldState,
        newState,
        trigger,
        priority: this.getPriorityForState(newState),
      },
    );
  }

  /**
   * GET PRIORITY FOR STATE
   */
  private getPriorityForState(state: LifecycleState): string {
    switch (state) {
      case 'IGNITING':
      case 'EXPLODING':
        return 'HIGH';
      case 'REACTIVATING':
        return 'NORMAL';
      case 'DORMANT':
      case 'EXHAUSTION':
        return 'LOW';
      case 'DEAD':
      default:
        return 'LOW';
    }
  }

  /**
   * IS EXECUTION READY
   */
  isExecutionReady(state: LifecycleState): boolean {
    return state === 'IGNITING' || state === 'EXPLODING';
  }
}

export const lifecycleStateMachine = new LifecycleStateMachine();