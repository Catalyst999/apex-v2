// src/services/intelligence/revival-engine/attention-ignition.ts
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';

export interface AttentionIgnition {
  token: string;
  ignitionScore: number; // 0-100
  telegramVelocity: number;
  xVelocity: number;
  dexscreenerVelocity: number;
  searchVelocity: number;
  confidenceLevel: number;
}

class AttentionIgnitionEngine {
  async detectIgnition(
    token: string,
    socialData: any,
    socialHistory: any[],
  ): Promise<AttentionIgnition> {
    let ignitionScore = 0;

    // Telegram velocity (mentions/min)
    const telVelocity = socialData.telegram?.velocity || 0;
    if (telVelocity > 10) ignitionScore += 30;
    else if (telVelocity > 5) ignitionScore += 15;
    else if (telVelocity > 1) ignitionScore += 5;

    // X (Twitter) acceleration
    const xVelocity = socialData.twitter?.velocity || 0;
    if (xVelocity > 5) ignitionScore += 25;
    else if (xVelocity > 2) ignitionScore += 12;

    // DEXScreener attention velocity
    const dexVelocity = socialData.dexscreener?.watchlistVelocity || 0;
    if (dexVelocity > 20) ignitionScore += 20;
    else if (dexVelocity > 10) ignitionScore += 10;

    // Search velocity (Google Trends equivalent)
    const searchVel = socialData.search?.velocity || 0;
    if (searchVel > 3) ignitionScore += 15;
    else if (searchVel > 1) ignitionScore += 5;

    ignitionScore = Math.min(100, ignitionScore);

    const result: AttentionIgnition = {
      token,
      ignitionScore,
      telegramVelocity: telVelocity,
      xVelocity: xVelocity,
      dexscreenerVelocity: dexVelocity,
      searchVelocity: searchVel,
      confidenceLevel: ignitionScore > 60 ? 0.9 : ignitionScore > 40 ? 0.6 : 0.3,
    };

    if (ignitionScore > 75) {
      await eventOrchestrator.revivalEvent(
        'IGNITION',
        token,
        {
          attentionVelocity: ignitionScore,
          confidence: result.confidenceLevel,
          sources: {
            telegram: telVelocity,
            twitter: xVelocity,
            dexscreener: dexVelocity,
            search: searchVel,
          },
          priority: 'HIGH',
        },
      );
    }

    return result;
  }
}

export const attentionIgnitionEngine = new AttentionIgnitionEngine();