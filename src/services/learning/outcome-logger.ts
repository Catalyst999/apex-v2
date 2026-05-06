// File path: src/services/learning/outcome-logger.ts
/**
 * OUTCOME LOGGER
 * Tracks every trade result for learning and analysis
 * Foundation for anti-pattern memory and confidence adjustment
 */

import { supabase } from '../../db/supabase';
import { emit } from '../events/event-bus';

export interface TradeOutcome {
  id: string;
  walletId: string;
  token: string;
  entryPrice: number;
  entryConviction: number;
  entryMode: 'AGGRESSIVE' | 'CAUTIOUS' | 'DEFENSIVE' | 'OBSERVATION' | 'INACTIVE';
  entrySignals: string[]; // which signals fired
  emotionState: string;
  marketRegime: string;
  narrativeContext: string;
  abnormalityScore: number;

  exitPrice: number;
  exitReason: string;
  pnl: number; // actual profit/loss
  pnlPercent: number;
  holdTime: number; // seconds

  outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN';
  confidence: number; // how confident we were
  expectedValue: number; // what we thought EV was

  // Learning data
  falseLiquiditySignal: boolean; // did liquidity trap us?
  fakeSocialSignal: boolean; // was social spike fake?
  whaleExitDetected: boolean; // did whale exit?
  manipulationDetected: boolean; // was it a pump?

  timestamp: number;
  completedAt: number;
}

export interface OutcomeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number;
  avgPnL: number;
  avgHoldTime: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  sharpeRatio: number;
}

class OutcomeLogger {
  private outcomes: TradeOutcome[] = [];

  /**
   * Log a completed trade
   */
  async logOutcome(outcome: TradeOutcome): Promise<void> {
    try {
      // Determine outcome type
      if (outcome.pnl > 0) {
        outcome.outcome = 'WIN';
      } else if (outcome.pnl < 0) {
        outcome.outcome = 'LOSS';
      } else {
        outcome.outcome = 'BREAK_EVEN';
      }

      // Store locally
      this.outcomes.push(outcome);

      // Store in database
      await supabase.from('trade_outcomes').insert({
        id: outcome.id,
        wallet_id: outcome.walletId,
        token: outcome.token,
        entry_price: outcome.entryPrice,
        entry_conviction: outcome.entryConviction,
        entry_mode: outcome.entryMode,
        entry_signals: outcome.entrySignals,
        emotion_state: outcome.emotionState,
        market_regime: outcome.marketRegime,
        narrative_context: outcome.narrativeContext,
        abnormality_score: outcome.abnormalityScore,
        exit_price: outcome.exitPrice,
        exit_reason: outcome.exitReason,
        pnl: outcome.pnl,
        pnl_percent: outcome.pnlPercent,
        hold_time: outcome.holdTime,
        outcome: outcome.outcome,
        confidence: outcome.confidence,
        expected_value: outcome.expectedValue,
        false_liquidity_signal: outcome.falseLiquiditySignal,
        fake_social_signal: outcome.fakeSocialSignal,
        whale_exit_detected: outcome.whaleExitDetected,
        manipulation_detected: outcome.manipulationDetected,
        created_at: new Date(outcome.timestamp).toISOString(),
        completed_at: new Date(outcome.completedAt).toISOString(),
      });

      // Emit outcome event
      await emit({
        type: 'OUTCOME_LOGGED',
        tradeId: outcome.id,
        token: outcome.token,
        walletId: outcome.walletId,
        outcome: outcome.outcome,
        pnl: outcome.pnl,
        learnings: this.extractLearnings(outcome),
        timestamp: outcome.completedAt,
      });

      console.log(`[OutcomeLogger] ${outcome.outcome} logged: ${outcome.token} | ${outcome.pnlPercent.toFixed(2)}%`);
    } catch (error) {
      console.error('[OutcomeLogger] Failed to log outcome:', error);
    }
  }

  /**
   * Extract learnings from outcome
   */
  private extractLearnings(outcome: TradeOutcome): string[] {
    const learnings: string[] = [];

    if (outcome.outcome === 'LOSS') {
      if (outcome.falseLiquiditySignal) {
        learnings.push('Liquidity signal was false');
      }
      if (outcome.fakeSocialSignal) {
        learnings.push('Social signal was fake');
      }
      if (outcome.whaleExitDetected) {
        learnings.push('Whale exited - insider dumping');
      }
      if (outcome.manipulationDetected) {
        learnings.push('Token was manipulated/pumped');
      }
      if (outcome.holdTime < 300) {
        learnings.push('Exited too quickly');
      }
    }

    if (outcome.outcome === 'WIN') {
      learnings.push(`Pattern worked: ${outcome.entrySignals.join(',')}`);
      if (outcome.confidence > 70) {
        learnings.push('High conviction entry was correct');
      }
    }

    return learnings;
  }

  /**
   * Get statistics for wallet
   */
  async getStats(walletId: string): Promise<OutcomeStats> {
    try {
      const { data } = await supabase
        .from('trade_outcomes')
        .select('*')
        .eq('wallet_id', walletId);

      if (!data || data.length === 0) {
        return {
          totalTrades: 0,
          wins: 0,
          losses: 0,
          breakEven: 0,
          winRate: 0,
          avgPnL: 0,
          avgHoldTime: 0,
          bestTrade: 0,
          worstTrade: 0,
          profitFactor: 0,
          sharpeRatio: 0,
        };
      }

      const totalTrades = data.length;
      const wins = data.filter((d: any) => d.outcome === 'WIN').length;
      const losses = data.filter((d: any) => d.outcome === 'LOSS').length;
      const breakEven = data.filter((d: any) => d.outcome === 'BREAK_EVEN').length;

      const pnls = data.map((d: any) => d.pnl);
      const avgPnL = pnls.reduce((a: number, b: number) => a + b, 0) / totalTrades;
      const bestTrade = Math.max(...pnls);
      const worstTrade = Math.min(...pnls);

      const winPnLs = data.filter((d: any) => d.outcome === 'WIN').map((d: any) => d.pnl);
      const lossPnLs = data.filter((d: any) => d.outcome === 'LOSS').map((d: any) => Math.abs(d.pnl));

      const avgWin = winPnLs.length > 0 ? winPnLs.reduce((a: number, b: number) => a + b, 0) / winPnLs.length : 0;
      const avgLoss = lossPnLs.length > 0 ? lossPnLs.reduce((a: number, b: number) => a + b, 0) / lossPnLs.length : 0;

      const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

      const holdTimes = data.map((d: any) => d.hold_time || 0);
      const avgHoldTime = holdTimes.reduce((a: number, b: number) => a + b, 0) / totalTrades;

      // Simplified Sharpe (would need more data in production)
      const variance = pnls.reduce((sum: number, pnl: number) => sum + Math.pow(pnl - avgPnL, 2), 0) / totalTrades;
      const stdDev = Math.sqrt(variance);
      const sharpeRatio = stdDev > 0 ? avgPnL / stdDev : 0;

      return {
        totalTrades,
        wins,
        losses,
        breakEven,
        winRate: totalTrades > 0 ? wins / totalTrades : 0,
        avgPnL,
        avgHoldTime,
        bestTrade,
        worstTrade,
        profitFactor,
        sharpeRatio,
      };
    } catch (error) {
      console.error('[OutcomeLogger] Failed to get stats:', error);
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        breakEven: 0,
        winRate: 0,
        avgPnL: 0,
        avgHoldTime: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        sharpeRatio: 0,
      };
    }
  }

  /**
   * Get winning signals (which signals predict wins?)
   */
  async getWinningSignals(walletId: string, limit: number = 5): Promise<Array<{ signal: string; winRate: number }>> {
    try {
      const { data } = await supabase
        .from('signal_correlation')
        .select('signal_type, win_count, total_count')
        .eq('wallet_id', walletId)
        .order('win_rate', { ascending: false })
        .limit(limit);

      if (!data) return [];

      return data.map((d: any) => ({
        signal: d.signal_type,
        winRate: d.total_count > 0 ? d.win_count / d.total_count : 0,
      }));
    } catch (error) {
      console.error('[OutcomeLogger] Failed to get winning signals:', error);
      return [];
    }
  }

  /**
   * Get anti-patterns (what caused losses?)
   */
  async getAntiPatterns(walletId: string, limit: number = 5): Promise<Array<{ pattern: string; frequency: number }>> {
    try {
      const { data } = await supabase
        .from('anti_patterns')
        .select('pattern_type, occurrence_count')
        .eq('wallet_id', walletId)
        .order('occurrence_count', { ascending: false })
        .limit(limit);

      if (!data) return [];

      return data.map((d: any) => ({
        pattern: d.pattern_type,
        frequency: d.occurrence_count,
      }));
    } catch (error) {
      console.error('[OutcomeLogger] Failed to get anti-patterns:', error);
      return [];
    }
  }

  /**
   * Get recent outcomes
   */
  getRecentOutcomes(limit: number = 10): TradeOutcome[] {
    return this.outcomes.slice(-limit);
  }

  /**
   * Get local stats
   */
  getLocalStats(): {
    totalLogged: number;
    wins: number;
    losses: number;
  } {
    const totalLogged = this.outcomes.length;
    const wins = this.outcomes.filter((o) => o.outcome === 'WIN').length;
    const losses = this.outcomes.filter((o) => o.outcome === 'LOSS').length;

    return { totalLogged, wins, losses };
  }
}

export const outcomeLogger = new OutcomeLogger();