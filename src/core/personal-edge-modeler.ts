/**
 * PERSONAL EDGE MODELING
 * You're accidentally building a system around YOUR intuition patterns
 * That's rare and powerful if done right
 * 
 * Track: what YOU liked, what YOU ignored, what YOU regretted missing
 * Compare against outcomes
 * You're training a digital reflection of your asymmetric instincts
 */

export interface EdgePattern {
  pattern: string;
  frequency: number;
  successRate: number;
  avgROI: number;
  confidence: number;
  examples: string[];
}

export interface PersonalEdgeProfile {
  userId: string;
  totalTrades: number;
  winRate: number;
  favoritePatterns: EdgePattern[];
  weakPatterns: EdgePattern[];
  blindSpots: string[];
  strengths: string[];
  personalMoatItems: string[];
  lastUpdated: number;
}

class PersonalEdgeModeler {
  private userEdits: Array<{
    timestamp: number;
    action: 'liked' | 'ignored' | 'regretted_missing' | 'regretted_taking' | 'felt_uncertain' | 'felt_confident';
    token: string;
    reason: string;
    price?: number;
    outcome?: number;
  }> = [];

  private tradeOutcomes: Map<
    string,
    {
      entry: number;
      exit: number;
      pnl: number;
      signals: string[];
      wasManual: boolean;
      userFeeling: string;
    }
  > = new Map();

  /**
   * LOG USER ACTION
   * Track manual decisions
   */
  logUserAction(
    action: 'liked' | 'ignored' | 'regretted_missing' | 'regretted_taking' | 'felt_uncertain' | 'felt_confident',
    token: string,
    reason: string,
    price?: number,
  ): void {
    this.userEdits.push({
      timestamp: Date.now(),
      action,
      token,
      reason,
      price,
    });

    console.log(`[PersonalEdge] User ${action}: ${token} - "${reason}"`);
  }

  /**
   * LOG TRADE OUTCOME WITH USER FEELING
   */
  logTradeOutcome(
    token: string,
    entry: number,
    exit: number,
    signals: string[],
    userFeeling: string,
    isManual: boolean,
  ): void {
    const pnl = exit - entry;

    this.tradeOutcomes.set(token, {
      entry,
      exit,
      pnl,
      signals,
      wasManual: isManual,
      userFeeling,
    });
  }

  /**
   * IDENTIFY WINNING PATTERNS
   * What does this user do well?
   */
  identifyWinningPatterns(): EdgePattern[] {
    const patterns: Map<string, { count: number; wins: number; rois: number[] }> = new Map();

    for (const outcome of this.tradeOutcomes.values()) {
      for (const signal of outcome.signals) {
        if (!patterns.has(signal)) {
          patterns.set(signal, { count: 0, wins: 0, rois: [] });
        }

        const pattern = patterns.get(signal)!;
        pattern.count++;
        if (outcome.pnl > 0) pattern.wins++;
        pattern.rois.push(outcome.pnl);
      }
    }

    const winningPatterns: EdgePattern[] = [];

    for (const [patternName, data] of patterns.entries()) {
      if (data.count < 3) continue; // need at least 3 trades

      const successRate = data.wins / data.count;
      const avgROI = data.rois.reduce((a, b) => a + b, 0) / data.rois.length;

      if (successRate > 0.5 || avgROI > 5) {
        // winning pattern
        winningPatterns.push({
          pattern: patternName,
          frequency: data.count,
          successRate: successRate * 100,
          avgROI,
          confidence: Math.min(100, successRate * 100 * 0.7 + (data.count / 20) * 30),
          examples: [], // would be token examples
        });
      }
    }

    return winningPatterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * IDENTIFY WEAK PATTERNS
   * Where does this user struggle?
   */
  identifyWeakPatterns(): EdgePattern[] {
    const patterns: Map<string, { count: number; losses: number; rois: number[] }> = new Map();

    for (const outcome of this.tradeOutcomes.values()) {
      for (const signal of outcome.signals) {
        if (!patterns.has(signal)) {
          patterns.set(signal, { count: 0, losses: 0, rois: [] });
        }

        const pattern = patterns.get(signal)!;
        pattern.count++;
        if (outcome.pnl < 0) pattern.losses++;
        pattern.rois.push(outcome.pnl);
      }
    }

    const weakPatterns: EdgePattern[] = [];

    for (const [patternName, data] of patterns.entries()) {
      if (data.count < 2) continue; // need at least 2 trades

      const lossRate = data.losses / data.count;
      const avgROI = data.rois.reduce((a, b) => a + b, 0) / data.rois.length;

      if (lossRate > 0.5 || avgROI < -3) {
        // losing pattern
        weakPatterns.push({
          pattern: patternName,
          frequency: data.count,
          successRate: (1 - lossRate) * 100,
          avgROI,
          confidence: Math.min(100, lossRate * 100 * 0.7 + (data.count / 10) * 30),
          examples: [],
        });
      }
    }

    return weakPatterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * IDENTIFY BLIND SPOTS
   * Signals user keeps missing
   */
  identifyBlindSpots(): string[] {
    const missedOpportunities = this.userEdits.filter((e) => e.action === 'regretted_missing');

    const tokenCounts: Record<string, number> = {};
    for (const miss of missedOpportunities) {
      tokenCounts[miss.token] = (tokenCounts[miss.token] || 0) + 1;
    }

    return Object.entries(tokenCounts)
      .filter(([, count]) => count >= 2)
      .map(([token]) => token);
  }

  /**
   * IDENTIFY STRENGTHS
   * What comes naturally to this user?
   */
  identifyStrengths(): string[] {
    const likes = this.userEdits.filter((e) => e.action === 'liked');

    const reasonCounts: Record<string, number> = {};
    for (const like of likes) {
      reasonCounts[like.reason] = (reasonCounts[like.reason] || 0) + 1;
    }

    return Object.entries(reasonCounts)
      .filter(([, count]) => count >= 2)
      .map(([reason]) => reason)
      .sort((a, b) => reasonCounts[b] - reasonCounts[a]);
  }

  /**
   * GENERATE PERSONAL EDGE PROFILE
   */
  generateEdgeProfile(userId: string): PersonalEdgeProfile {
    const winning = this.identifyWinningPatterns();
    const weak = this.identifyWeakPatterns();
    const blindSpots = this.identifyBlindSpots();
    const strengths = this.identifyStrengths();

    const totalTrades = this.tradeOutcomes.size;
    const profitableTrades = Array.from(this.tradeOutcomes.values()).filter((t) => t.pnl > 0).length;
    const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

    // Personal moat: things only this trader does well
    const personalMoat = winning
      .filter((w) => w.successRate > 60 && w.frequency >= 3)
      .map((w) => `${w.pattern} (${w.successRate.toFixed(0)}% win rate)`);

    return {
      userId,
      totalTrades,
      winRate,
      favoritePatterns: winning.slice(0, 5),
      weakPatterns: weak.slice(0, 3),
      blindSpots,
      strengths,
      personalMoatItems: personalMoat,
      lastUpdated: Date.now(),
    };
  }

  /**
   * GET USER INSTRUCTION
   * What should this person do more/less of?
   */
  getPersonalInstruction(userId: string): string {
    const profile = this.generateEdgeProfile(userId);

    let instruction = `📊 Personal Trading Profile for ${userId}\n\n`;

    instruction += `✅ WHAT YOU DO WELL:\n`;
    for (const pattern of profile.favoritePatterns.slice(0, 3)) {
      instruction += `  • ${pattern.pattern} (${pattern.successRate.toFixed(0)}% win rate)\n`;
    }

    instruction += `\n❌ WHAT TO AVOID:\n`;
    for (const pattern of profile.weakPatterns.slice(0, 2)) {
      instruction += `  • ${pattern.pattern} (${pattern.successRate.toFixed(0)}% win rate)\n`;
    }

    instruction += `\n⚠️ YOUR BLIND SPOTS:\n`;
    for (const spot of profile.blindSpots.slice(0, 3)) {
      instruction += `  • You keep missing: ${spot}\n`;
    }

    instruction += `\n🎯 YOUR PERSONAL MOAT:\n`;
    for (const moat of profile.personalMoatItems) {
      instruction += `  • ${moat}\n`;
    }

    return instruction;
  }
}

export const personalEdgeModeler = new PersonalEdgeModeler();