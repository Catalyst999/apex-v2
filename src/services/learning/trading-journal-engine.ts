// File path: src/services/learning/trading-journal-engine.ts
/**
 * TRADING JOURNAL ENGINE
 * Comprehensive trade logging with context
 * Foundation for learning and adaptation
 */

import { supabase } from '../../core/db/supabase';
import { runtimeState } from '../../core/state/runtime-state';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export interface JournalEntry {
  id: string;
  walletId: string;
  token: string;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  pnl: number;
  pnlPercent: number;
  holdTime: number;
  
  // Context
  entrySignals: string[];
  entryConviction: number;
  entryMode: string;
  regime: string;
  narrative: string;
  
  // Exit details
  exitReason: string;
  exitSignal?: string;
  
  // Outcome analysis
  wouldHaveBeenBetter?: number; // if exited at different time
  missedOpportunity?: boolean;
  falseSignal?: boolean;
  
  // Lessons
  keysToSuccess: string[];
  failures: string[];
  
  createdAt: number;
  updatedAt: number;
}

class TradingJournalEngine {
  private entries: Map<string, JournalEntry> = new Map();

  /**
   * LOG TRADE
   * Create journal entry for completed trade
   */
  async logTrade(
    walletId: string,
    token: string,
    entryPrice: number,
    exitPrice: number,
    positionSize: number,
    entrySignals: string[],
    entryConviction: number,
    exitReason: string,
    holdTime: number,
  ): Promise<JournalEntry | null> {
    try {
      const pnl = (exitPrice - entryPrice) * positionSize;
      const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

      const regime = runtimeState.getRegime();
      const narrative = runtimeState.getNarrativeState();

      const entry: JournalEntry = {
        id: `journal-${Date.now()}`,
        walletId,
        token,
        entryPrice,
        exitPrice,
        positionSize,
        pnl,
        pnlPercent,
        holdTime,
        entrySignals,
        entryConviction,
        entryMode: 'AUTO', // or MANUAL
        regime: regime?.regime || 'UNKNOWN',
        narrative: narrative?.activeNarratives[0]?.name || 'UNKNOWN',
        exitReason,
        keysToSuccess: this.analyzeSuccess(pnlPercent, holdTime),
        failures: this.analyzeFailures(pnlPercent, entryConviction),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.entries.set(entry.id, entry);

      // Save to database
      await supabase.from('trading_journal').insert({
        id: entry.id,
        wallet_id: walletId,
        token,
        entry_price: entryPrice,
        exit_price: exitPrice,
        position_size: positionSize,
        pnl,
        pnl_percent: pnlPercent,
        hold_time_minutes: Math.floor(holdTime / 60000),
        entry_signals: entrySignals,
        entry_conviction: entryConviction,
        regime: entry.regime,
        narrative: entry.narrative,
        exit_reason: exitReason,
        created_at: new Date().toISOString(),
      });

      console.log(
        `[Journal] Logged trade: ${token} ${pnlPercent > 0 ? '✅' : '❌'} ${pnlPercent.toFixed(2)}%`,
      );

      return entry;
    } catch (error) {
      console.error('[Journal] Log error:', error);
      return null;
    }
  }

  /**
   * ANALYZE SUCCESS
   * What led to this win?
   */
  private analyzeSuccess(pnlPercent: number, holdTime: number): string[] {
    const keys: string[] = [];

    if (pnlPercent > 20) keys.push('Strong conviction entry');
    if (pnlPercent > 10) keys.push('Good risk/reward ratio');
    if (holdTime < 60 * 60 * 1000 && pnlPercent > 5) keys.push('Quick wins');
    if (pnlPercent > 50) keys.push('Exceptional runner - scale-in worked');

    return keys.length > 0 ? keys : ['Positive outcome'];
  }

  /**
   * ANALYZE FAILURES
   * What went wrong?
   */
  private analyzeFailures(pnlPercent: number, conviction: number): string[] {
    const issues: string[] = [];

    if (pnlPercent < -10) issues.push('Large loss - conviction was wrong');
    if (pnlPercent < -5 && conviction > 70) issues.push('High conviction but failed');
    if (conviction < 40 && pnlPercent < -3) issues.push('Low conviction entry lost');

    return issues;
  }

  /**
   * GET JOURNAL ENTRY
   */
  getEntry(entryId: string): JournalEntry | undefined {
    return this.entries.get(entryId);
  }

  /**
   * GET WALLET JOURNAL
   */
  getWalletJournal(walletId: string, limit: number = 20): JournalEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.walletId === walletId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * JOURNAL STATISTICS
   */
  getJournalStats(walletId: string) {
    const journal = this.getWalletJournal(walletId, 100);

    const wins = journal.filter((e) => e.pnl > 0);
    const losses = journal.filter((e) => e.pnl < 0);

    const totalPnL = journal.reduce((sum, e) => sum + e.pnl, 0);
    const avgWin = wins.length > 0 ? wins.reduce((sum, e) => sum + e.pnl, 0) / wins.length : 0;
    const avgLoss =
      losses.length > 0 ? losses.reduce((sum, e) => sum + e.pnl, 0) / losses.length : 0;
    const avgHoldTime = journal.length > 0 ? journal.reduce((sum, e) => sum + e.holdTime, 0) / journal.length : 0;

    return {
      tradesLogged: journal.length,
      wins: wins.length,
      losses: losses.length,
      winRate: journal.length > 0 ? (wins.length / journal.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor: avgWin !== 0 ? Math.abs(avgWin / avgLoss) : 0,
      avgHoldTime,
      bestTrade: Math.max(...journal.map((e) => e.pnl)),
      worstTrade: Math.min(...journal.map((e) => e.pnl)),
    };
  }

  /**
   * COMMON MISTAKES
   * Identify recurring issues
   */
  getCommonMistakes(walletId: string) {
    const losses = this.getWalletJournal(walletId, 100).filter((e) => e.pnl < 0);

    const mistakes: Record<string, number> = {};

    for (const loss of losses) {
      for (const failure of loss.failures) {
        mistakes[failure] = (mistakes[failure] || 0) + 1;
      }
    }

    return Object.entries(mistakes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }

  /**
   * WINNING PATTERNS
   * Identify what works
   */
  getWinningPatterns(walletId: string) {
    const wins = this.getWalletJournal(walletId, 100).filter((e) => e.pnl > 0);

    const patterns: Record<string, number> = {};

    for (const win of wins) {
      for (const signal of win.entrySignals) {
        patterns[signal] = (patterns[signal] || 0) + 1;
      }
    }

    return Object.entries(patterns)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }
}

export const tradingJournalEngine = new TradingJournalEngine();