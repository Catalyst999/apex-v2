/**
 * META SATURATION DETECTOR
 * Identifies when a narrative/trade is overcrowded
 * Late entries = blowups
 * This prevents FOMO trades
 */

export interface MetaSaturation {
  narrative: string;
  saturationScore: number; // 0-100
  indicators: {
    tokenClones: number;
    influencerCount: number;
    engagementFlattening: number; // 0-100, how flat is growth?
    launchesPerHour: number;
    competitorCount: number;
  };
  isSaturated: boolean;
  crowdednessLevel: 'fresh' | 'warm' | 'hot' | 'burning' | 'overdone';
  recommendation: string;
}

class MetaSaturationDetector {
  private narrativeHistory: Map<string, { timestamp: number; launches: number }[]> = new Map();
  private readonly TRACKING_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * DETECT META SATURATION
   */
  detectMetaSaturation(
    narrative: string,
    tokenClones: number,
    influencerCount: number,
    recentEngagement: number[],
    launchesInNarrative: number,
    competitorTokens: number,
  ): MetaSaturation {
    // Track launches
    if (!this.narrativeHistory.has(narrative)) {
      this.narrativeHistory.set(narrative, []);
    }

    const history = this.narrativeHistory.get(narrative)!;
    history.push({ timestamp: Date.now(), launches: launchesInNarrative });

    // Clean old entries
    const cutoff = Date.now() - this.TRACKING_WINDOW;
    const idx = history.findIndex((h) => h.timestamp > cutoff);
    if (idx > 0) history.splice(0, idx);

    // Calculate metrics
    const engagementFlattening = this.calculateEngagementFlattening(recentEngagement);
    const launchesPerHour = (launchesInNarrative / 60) * 60;

    // Calculate saturation score (0-100)
    let saturationScore = 0;

    // Factor 1: Token clones (if > 10, very saturated)
    saturationScore += Math.min(30, (tokenClones / 10) * 30);

    // Factor 2: Influencer count (if > 50, very saturated)
    saturationScore += Math.min(25, (influencerCount / 50) * 25);

    // Factor 3: Engagement flattening (if engagement not growing, saturated)
    saturationScore += engagementFlattening * 0.25;

    // Factor 4: Launch velocity (if > 5/hour, very saturated)
    saturationScore += Math.min(20, launchesPerHour * 4);

    // Determine crowdedness level
    let crowdednessLevel: 'fresh' | 'warm' | 'hot' | 'burning' | 'overdone';
    if (saturationScore < 20) crowdednessLevel = 'fresh';
    else if (saturationScore < 40) crowdednessLevel = 'warm';
    else if (saturationScore < 60) crowdednessLevel = 'hot';
    else if (saturationScore < 80) crowdednessLevel = 'burning';
    else crowdednessLevel = 'overdone';

    const isSaturated = saturationScore > 65;

    const recommendation = this.generateRecommendation(crowdednessLevel, saturationScore, competitorTokens);

    return {
      narrative,
      saturationScore: Math.min(100, saturationScore),
      indicators: {
        tokenClones,
        influencerCount,
        engagementFlattening,
        launchesPerHour,
        competitorCount: competitorTokens,
      },
      isSaturated,
      crowdednessLevel,
      recommendation,
    };
  }

  /**
   * CALCULATE ENGAGEMENT FLATTENING
   * Is growth slowing down? = saturation
   */
  private calculateEngagementFlattening(recentEngagement: number[]): number {
    if (recentEngagement.length < 10) return 0;

    // Compare first half vs second half
    const midpoint = Math.floor(recentEngagement.length / 2);
    const firstHalf = recentEngagement.slice(0, midpoint);
    const secondHalf = recentEngagement.slice(midpoint);

    const avgFirst = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

    // If second half is lower than first, engagement is flattening
    const flatteningPercent = Math.max(0, 1 - avgSecond / avgFirst);

    return Math.min(100, flatteningPercent * 100);
  }

  /**
   * GENERATE RECOMMENDATION
   */
  private generateRecommendation(
    crowdedness: 'fresh' | 'warm' | 'hot' | 'burning' | 'overdone',
    saturation: number,
    competitors: number,
  ): string {
    if (crowdedness === 'fresh') {
      return '🌱 FRESH - Early stage, good entry opportunity';
    } else if (crowdedness === 'warm') {
      return '🔥 WARM - Still early, reasonable entry';
    } else if (crowdedness === 'hot') {
      return '🌡️ HOT - Getting crowded, only best signals';
    } else if (crowdedness === 'burning') {
      return '🔥 BURNING - Very crowded, high risk, exit soon';
    } else {
      return '💀 OVERDONE - Extreme saturation, do NOT enter, consider exiting';
    }
  }

  /**
   * SHOULD ENTER TRADE?
   * Based on saturation
   */
  shouldEnter(saturation: MetaSaturation, minConviction: number): { allowed: boolean; maxPosition: number; reason: string } {
    if (saturation.isSaturated) {
      return {
        allowed: false,
        maxPosition: 0,
        reason: `${saturation.recommendation} - Trading blocked`,
      };
    }

    // Reduce position size as saturation increases
    const maxPosition = 100 - saturation.saturationScore; // 0-100

    return {
      allowed: true,
      maxPosition,
      reason: saturation.recommendation,
    };
  }

  /**
   * GET NARRATIVE HISTORY
   */
  getNarrativeAge(narrative: string): number {
    const history = this.narrativeHistory.get(narrative);
    if (!history || history.length === 0) return 0;

    // Age in hours since first launch in this narrative
    const oldestEntry = history[0].timestamp;
    return (Date.now() - oldestEntry) / (60 * 60 * 1000);
  }
}

export const metaSaturationDetector = new MetaSaturationDetector();