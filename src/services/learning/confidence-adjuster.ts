// File path: src/services/learning/confidence-adjuster.ts
/**
 * CONFIDENCE ADJUSTER
 * Dynamically updates conviction thresholds and pattern confidence
 * based on historical win rate and accuracy
 */

import { supabase } from '../../db/supabase';
import { TradeOutcome } from './outcome-logger';

export interface ConfidenceAdjustment {
  convictionMultiplier: number; // 0.5x to 2.0x
  confidenceThreshold: number; // min conviction to trade
  positionSizeMultiplier: number; // adjust based on accuracy
  reason: string;
}

class ConfidenceAdjuster {
  /**
   * Adjust conviction based on recent performance
   */
  async adjustConviction(walletId: string, baseConviction: number): Promise<ConfidenceAdjustment> {
    try {
      // Get wallet stats
      const { data: analytics } = await supabase
        .from('wallet_analytics')
        .select('win_rate, total_trades, profit_factor')
        .eq('wallet_id', walletId)
        .single();

      if (!analytics || analytics.total_trades < 5) {
        // Not enough data, use defaults
        return {
          convictionMultiplier: 1.0,
          confidenceThreshold: 50,
          positionSizeMultiplier: 1.0,
          reason: 'Insufficient trade history (< 5 trades)',
        };
      }

      const winRate = analytics.win_rate || 0;
      const profitFactor = analytics.profit_factor || 0;

      let convictionMultiplier = 1.0;
      let confidenceThreshold = 50;
      let positionSizeMultiplier = 1.0;
      let reason = '';

      // ─── ADJUST BASED ON WIN RATE ──────────────────────────────────────

      if (winRate < 0.25) {
        // Losing record - very cautious
        convictionMultiplier = 0.5;
        confidenceThreshold = 80; // need very high conviction
        positionSizeMultiplier = 0.5;
        reason = `Low win rate (${(winRate * 100).toFixed(0)}%) - reducing aggression`;
      } else if (winRate < 0.35) {
        // Below 35% win rate - still cautious
        convictionMultiplier = 0.7;
        confidenceThreshold = 65;
        positionSizeMultiplier = 0.7;
        reason = `Below-average win rate (${(winRate * 100).toFixed(0)}%) - slightly cautious`;
      } else if (winRate < 0.45) {
        // Average
        convictionMultiplier = 1.0;
        confidenceThreshold = 50;
        positionSizeMultiplier = 1.0;
        reason = `Average win rate (${(winRate * 100).toFixed(0)}%) - normal operation`;
      } else if (winRate < 0.55) {
        // Good win rate (45-55%)
        convictionMultiplier = 1.3;
        confidenceThreshold = 40;
        positionSizeMultiplier = 1.3;
        reason = `Good win rate (${(winRate * 100).toFixed(0)}%) - moderately aggressive`;
      } else if (winRate >= 0.55) {
        // Excellent win rate (55%+)
        convictionMultiplier = 1.8;
        confidenceThreshold = 30;
        positionSizeMultiplier = 1.8;
        reason = `Excellent win rate (${(winRate * 100).toFixed(0)}%) - very aggressive`;
      }

      // ─── ADJUST BASED ON PROFIT FACTOR ────────────────────────────────

      if (profitFactor < 0.8) {
        // Losing more than winning on average
        convictionMultiplier *= 0.8;
        reason += ` | Low profit factor (${profitFactor.toFixed(2)}) - reducing size`;
      } else if (profitFactor > 1.5) {
        // Winning much more than losing
        convictionMultiplier *= 1.2;
        reason += ` | High profit factor (${profitFactor.toFixed(2)}) - increasing size`;
      }

      return {
        convictionMultiplier: Math.max(0.3, Math.min(2.0, convictionMultiplier)),
        confidenceThreshold: Math.max(20, Math.min(95, confidenceThreshold)),
        positionSizeMultiplier: Math.max(0.25, Math.min(2.0, positionSizeMultiplier)),
        reason,
      };
    } catch (error) {
      console.error('[ConfidenceAdjuster] Failed to adjust conviction:', error);
      return {
        convictionMultiplier: 1.0,
        confidenceThreshold: 50,
        positionSizeMultiplier: 1.0,
        reason: 'Error in adjustment',
      };
    }
  }

  /**
   * Update pattern confidence based on outcome
   */
  async updatePatternConfidence(walletId: string, outcome: TradeOutcome): Promise<void> {
    try {
      if (outcome.entrySignals.length === 0) return;

      for (const signal of outcome.entrySignals) {
        // Get current pattern record
        const { data: existing } = await supabase
          .from('signal_correlation')
          .select('*')
          .eq('wallet_id', walletId)
          .eq('signal_type', signal)
          .single();

        const isWin = outcome.outcome === 'WIN' ? 1 : 0;
        const winCount = (existing?.win_count || 0) + isWin;
        const totalCount = (existing?.total_count || 0) + 1;
        const winRate = winCount / totalCount;

        // Update or insert
        if (existing) {
          await supabase
            .from('signal_correlation')
            .update({
              win_count: winCount,
              total_count: totalCount,
              win_rate: winRate,
              last_updated: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase.from('signal_correlation').insert({
            wallet_id: walletId,
            signal_type: signal,
            win_count: winCount,
            total_count: totalCount,
            win_rate: winRate,
            created_at: new Date().toISOString(),
          });
        }

        console.log(
          `[ConfidenceAdjuster] Updated ${signal}: ${winCount}/${totalCount} wins (${(winRate * 100).toFixed(0)}%)`
        );
      }
    } catch (error) {
      console.error('[ConfidenceAdjuster] Failed to update pattern confidence:', error);
    }
  }

  /**
   * Record anti-pattern when trade loses
   */
  async recordAntiPattern(walletId: string, outcome: TradeOutcome): Promise<void> {
    try {
      if (outcome.outcome !== 'LOSS') return;

      // Determine what went wrong
      let pattern = '';

      if (outcome.falseLiquiditySignal) {
        pattern = 'false_liquidity_signal';
      } else if (outcome.fakeSocialSignal) {
        pattern = 'fake_social_signal';
      } else if (outcome.whaleExitDetected) {
        pattern = 'whale_exit_dump';
      } else if (outcome.manipulationDetected) {
        pattern = 'token_manipulation';
      } else if (outcome.holdTime < 300) {
        pattern = 'quick_exit_loss';
      } else {
        pattern = 'unknown_loss';
      }

      // Get or create anti-pattern record
      const { data: existing } = await supabase
        .from('anti_patterns')
        .select('*')
        .eq('wallet_id', walletId)
        .eq('pattern_type', pattern)
        .single();

      if (existing) {
        await supabase
          .from('anti_patterns')
          .update({
            occurrence_count: existing.occurrence_count + 1,
            total_loss: existing.total_loss + Math.abs(outcome.pnl),
            last_seen: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('anti_patterns').insert({
          wallet_id: walletId,
          pattern_type: pattern,
          occurrence_count: 1,
          total_loss: Math.abs(outcome.pnl),
          created_at: new Date().toISOString(),
        });
      }

      console.log(`[ConfidenceAdjuster] Recorded anti-pattern: ${pattern}`);
    } catch (error) {
      console.error('[ConfidenceAdjuster] Failed to record anti-pattern:', error);
    }
  }

  /**
   * Get conviction multiplier for wallet
   */
  async getMultiplier(walletId: string): Promise<number> {
    try {
      const adjustment = await this.adjustConviction(walletId, 50);
      return adjustment.convictionMultiplier;
    } catch {
      return 1.0;
    }
  }

  /**
   * Should we trade at all? (based on performance)
   */
  async shouldTrade(walletId: string): Promise<{ shouldTrade: boolean; reason: string }> {
    try {
      const { data: analytics } = await supabase
        .from('wallet_analytics')
        .select('win_rate, total_trades')
        .eq('wallet_id', walletId)
        .single();

      if (!analytics) {
        return { shouldTrade: true, reason: 'New wallet, proceed cautiously' };
      }

      // If we're losing consistently, pause trading
      if (analytics.total_trades > 20 && analytics.win_rate < 0.2) {
        return {
          shouldTrade: false,
          reason: `Excessive losses (${(analytics.win_rate * 100).toFixed(0)}% win rate) - trading paused`,
        };
      }

      return { shouldTrade: true, reason: 'Performance acceptable' };
    } catch (error) {
      return { shouldTrade: true, reason: 'Default allow' };
    }
  }
}

export const confidenceAdjuster = new ConfidenceAdjuster();