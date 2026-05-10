/**
 * DON'T TRADE INTELLIGENCE
 * Most systems ask: "What should we buy?"
 * Elite systems ask: "Should we even be trading today?"
 * 
 * Sometimes the highest ROI move is: doing nothing
 */

export interface TradeDecision {
  shouldTrade: boolean;
  confidence: number; // 0-100
  reasons: string[];
  riskFactors: string[];
  opportunityScore: number; // 0-100, how good is this environment
  recommendation: 'AGGRESSIVE' | 'CONSERVATIVE' | 'PAUSE' | 'WAIT';
  expectedROI: number; // estimated return if we trade
}

class DontTradeIntelligence {
  private readonly recentTrades: Array<{ timestamp: number; result: number }> = [];
  private readonly maxRecentWindow = 60 * 60 * 1000; // 1 hour

  /**
   * LOW CONFIDENCE DETECTION
   * When signals are weak, conflicting, or uncertain
   */
  private detectLowConfidence(signals: any[]): { detected: boolean; reason: string } {
    if (!signals || signals.length === 0) {
      return { detected: true, reason: 'No signals detected' };
    }

    const avgConfidence = signals.reduce((sum, s) => sum + (s.conviction || 0), 0) / signals.length;

    if (avgConfidence < 50) {
      return { detected: true, reason: `Low avg conviction: ${avgConfidence.toFixed(0)}%` };
    }

    // Check for conflicting signals (some up, some down)
    const upSignals = signals.filter((s) => s.direction === 'up').length;
    const downSignals = signals.filter((s) => s.direction === 'down').length;

    if (upSignals > 0 && downSignals > 0) {
      return { detected: true, reason: 'Conflicting signal directions' };
    }

    return { detected: false, reason: '' };
  }

  /**
   * CHOP DETECTION
   * When market is ranging, not trending
   * Trades get stopped out quickly
   */
  private detectChop(recentPriceAction: { high: number; low: number; close: number }[]): {
    detected: boolean;
    score: number;
    reason: string;
  } {
    if (!recentPriceAction || recentPriceAction.length < 10) {
      return { detected: false, score: 0, reason: 'Insufficient data' };
    }

    // Calculate true range for last 10 candles
    const ranges = recentPriceAction.slice(-10).map((p) => p.high - p.low);
    const avgRange = ranges.reduce((a, b) => a + b) / ranges.length;
    const stdev = Math.sqrt(ranges.reduce((sum, r) => sum + Math.pow(r - avgRange, 2), 0) / ranges.length);

    // High std dev in range = chop (varying sizes)
    const chopScore = Math.min(100, (stdev / avgRange) * 100);

    if (chopScore > 60) {
      return { detected: true, score: chopScore, reason: `High chop score: ${chopScore.toFixed(0)}%` };
    }

    return { detected: false, score: chopScore, reason: '' };
  }

  /**
   * EXHAUSTION DETECTION
   * Too many trades in short time = market exhaustion
   * Next moves will likely fail
   */
  private detectExhaustion(recentTradeCount: number, timeWindowMs: number): {
    detected: boolean;
    reason: string;
  } {
    const tradesPerHour = (recentTradeCount / timeWindowMs) * 60 * 60 * 1000;

    // If more than 10 trades per hour, market is exhausted
    if (tradesPerHour > 10) {
      return { detected: true, reason: `Market exhaustion: ${tradesPerHour.toFixed(1)} trades/hour` };
    }

    return { detected: false, reason: '' };
  }

  /**
   * FAKE VOLUME DETECTION
   * Volume without conviction = fake
   * Watch for volume spikes without corresponding price movement
   */
  private detectFakeVolume(volume: number, priceChange: number): { detected: boolean; reason: string } {
    // High volume but low price change = fake
    const volumeEfficiency = Math.abs(priceChange) / (volume / 1000000); // approx

    if (volume > 50000 && volumeEfficiency < 0.01) {
      return { detected: true, reason: 'High volume but minimal price movement' };
    }

    return { detected: false, reason: '' };
  }

  /**
   * OVERFARMED META DETECTION
   * When everyone is doing the same thing
   * Trades become crowded and fail
   */
  private detectOverfarmedMeta(
    narrativeRepetition: number,
    influencerSaturation: number,
    cloneCount: number,
  ): { detected: boolean; reason: string } {
    let score = 0;

    // Too many people chasing same narrative
    if (narrativeRepetition > 8) {
      score += 30;
    }

    // Too many similar tokens (clones)
    if (cloneCount > 5) {
      score += 30;
    }

    // Too many influencers talking about it
    if (influencerSaturation > 0.8) {
      score += 40;
    }

    if (score > 60) {
      return { detected: true, reason: `Overfarmed meta detected (score: ${score})` };
    }

    return { detected: false, reason: '' };
  }

  /**
   * WINNING STREAK TRAP
   * After big wins, next trades often fail (overconfidence)
   */
  private detectWinningStreakTrap(): { detected: boolean; reason: string } {
    const recentWindow = this.recentTrades.filter((t) => Date.now() - t.timestamp < this.maxRecentWindow);

    if (recentWindow.length < 3) {
      return { detected: false, reason: '' };
    }

    const lastThree = recentWindow.slice(-3);
    const recentWins = lastThree.filter((t) => t.result > 0).length;

    // 3 wins in a row = overconfidence zone
    if (recentWins === 3) {
      return { detected: true, reason: 'Winning streak trap - overconfidence likely' };
    }

    return { detected: false, reason: '' };
  }

  /**
   * EVALUATE TRADE DECISION
   * Should we trade right now?
   */
  evaluateTradeDecision(
    signals: any[],
    priceAction: any[],
    recentTradeCount: number,
    narrativeRepetition: number,
    influencerSaturation: number,
    cloneCount: number,
    volume: number,
    priceChange: number,
  ): TradeDecision {
    const reasons: string[] = [];
    const riskFactors: string[] = [];
    let shouldTrade = true;
    let opportunityScore = 100;

    // CHECK #1: Low Confidence
    const lowConf = this.detectLowConfidence(signals);
    if (lowConf.detected) {
      shouldTrade = false;
      riskFactors.push(lowConf.reason);
      opportunityScore -= 30;
    }

    // CHECK #2: Chop
    const chop = this.detectChop(priceAction);
    if (chop.detected) {
      shouldTrade = false;
      riskFactors.push(chop.reason);
      opportunityScore -= 25;
    }

    // CHECK #3: Exhaustion
    const exhaustion = this.detectExhaustion(recentTradeCount, this.maxRecentWindow);
    if (exhaustion.detected) {
      shouldTrade = false;
      riskFactors.push(exhaustion.reason);
      opportunityScore -= 20;
    }

    // CHECK #4: Fake Volume
    const fakeVol = this.detectFakeVolume(volume, priceChange);
    if (fakeVol.detected) {
      shouldTrade = false;
      riskFactors.push(fakeVol.reason);
      opportunityScore -= 15;
    }

    // CHECK #5: Overfarmed Meta
    const overfarmed = this.detectOverfarmedMeta(narrativeRepetition, influencerSaturation, cloneCount);
    if (overfarmed.detected) {
      shouldTrade = false;
      riskFactors.push(overfarmed.reason);
      opportunityScore -= 25;
    }

    // CHECK #6: Winning Streak Trap
    const trap = this.detectWinningStreakTrap();
    if (trap.detected) {
      shouldTrade = false;
      riskFactors.push(trap.reason);
      opportunityScore -= 20;
    }

    // Determine recommendation
    let recommendation: 'AGGRESSIVE' | 'CONSERVATIVE' | 'PAUSE' | 'WAIT';
    if (!shouldTrade && riskFactors.length >= 3) {
      recommendation = 'PAUSE';
    } else if (!shouldTrade) {
      recommendation = 'WAIT';
    } else if (opportunityScore > 80) {
      recommendation = 'AGGRESSIVE';
    } else {
      recommendation = 'CONSERVATIVE';
    }

    const expectedROI = shouldTrade ? opportunityScore * 0.5 : -5; // expected loss if trading in bad conditions

    return {
      shouldTrade,
      confidence: Math.max(0, opportunityScore / 100),
      reasons: reasons.length > 0 ? reasons : ['Conditions look favorable'],
      riskFactors,
      opportunityScore: Math.max(0, opportunityScore),
      recommendation,
      expectedROI,
    };
  }

  /**
   * LOG TRADE RESULT
   * Track for winning streak detection
   */
  logTradeResult(result: number): void {
    this.recentTrades.push({
      timestamp: Date.now(),
      result,
    });

    // Clean old trades
    const cutoff = Date.now() - this.maxRecentWindow;
    const idx = this.recentTrades.findIndex((t) => t.timestamp > cutoff);
    if (idx > 0) {
      this.recentTrades.splice(0, idx);
    }
  }

  /**
   * GET TRADE QUALITY ASSESSMENT
   */
  getRecentTradeQuality(): { winRate: number; avgReturn: number; consistency: number } {
    const trades = this.recentTrades.filter((t) => Date.now() - t.timestamp < this.maxRecentWindow);

    if (trades.length === 0) {
      return { winRate: 0, avgReturn: 0, consistency: 0 };
    }

    const wins = trades.filter((t) => t.result > 0).length;
    const winRate = (wins / trades.length) * 100;
    const avgReturn = trades.reduce((sum, t) => sum + t.result, 0) / trades.length;
    const variance = trades.reduce((sum, t) => sum + Math.pow(t.result - avgReturn, 2), 0) / trades.length;
    const consistency = Math.max(0, 100 - Math.sqrt(variance));

    return { winRate, avgReturn, consistency };
  }
}

export const dontTradeIntelligence = new DontTradeIntelligence();