// src/services/intelligence/revival-engine/reactivation-velocity.ts
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';

export interface ReactivationVelocity {
  token: string;
  velocityScore: number; // 0-100
  volumeSpike: number;
  buyBurst: number;
  holderAcceleration: number;
  timeWindow: number;
}

class ReactivationVelocityDetector {
  async detectReactivation(
    token: string,
    currentData: any,
    previousData: any,
  ): Promise<ReactivationVelocity> {
    const volumeSpike = (currentData.volume?.m5 || 0) / (previousData.volume?.m5 || 1);
    const buyBurst = (currentData.txns?.m5?.buys || 0) - (previousData.txns?.m5?.buys || 0);
    const holderAccel = (currentData.holders?.count || 0) - (previousData.holders?.count || 0);

    let velocityScore = 0;

    if (volumeSpike > 5) velocityScore += 40;
    else if (volumeSpike > 2) velocityScore += 25;
    else if (volumeSpike > 1.5) velocityScore += 10;

    if (buyBurst > 50) velocityScore += 30;
    else if (buyBurst > 20) velocityScore += 15;

    if (holderAccel > 10) velocityScore += 20;
    else if (holderAccel > 5) velocityScore += 10;

    const result: ReactivationVelocity = {
      token,
      velocityScore: Math.min(100, velocityScore),
      volumeSpike,
      buyBurst,
      holderAcceleration: holderAccel,
      timeWindow: Date.now(),
    };

    if (velocityScore > 50) {
      await eventOrchestrator.revivalEvent(
        'ESCALATION',
        token,
        {
          oldLevel: 0,
          newLevel: velocityScore,
          reason: 'reactivation_velocity',
          priority: 'HIGH',
        },
      );
    }

    return result;
  }
}

export const reactivationVelocityDetector = new ReactivationVelocityDetector();