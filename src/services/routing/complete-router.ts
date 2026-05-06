// File path: src/services/routing/complete-router.ts
/**
 * COMPLETE SIGNAL ROUTER
 * Integrates all intelligence systems into single routing decision
 * This is the BRAIN of Catalyst Apex Trader
 */

import { supabase } from '../../core/db/supabase';
import { signalGateway } from '../gateway/signal-gateway';
import { convictionScaler } from '../intelligence/conviction-scaler';
import { confidenceAdjuster } from '../learning/confidence-adjuster';
import { marketMemoryEngine } from '../intelligence/market-memory-engine';
import { walletManager } from '../wallet/wallet-manager';
import { emit } from '../events/event-bus';
import { v4 as uuidv4 } from 'uuid';

export interface TradeDecision {
  id: string;
  token: string;
  walletId: string;
  shouldTrade: boolean;
  tradeType: 'BUY' | 'SELL' | 'SKIP';
  conviction: number; // 0-100
  convictionMode: 'AGGRESSIVE' | 'CAUTIOUS' | 'DEFENSIVE' | 'OBSERVATION' | 'INACTIVE';
  positionSize: number; // % of wallet
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  reasoning: {
    gatekeeper: string; // why it passed pre-filter
    signals: string[]; // which signals fired
    confidence: string; // why this confidence
    risks: string[]; // identified risks
    suggestions: string[];
  };
  timestamp: number;
}

class CompleteRouter {
  /**
   * MAIN ROUTING DECISION
   * Token → All intelligence → Trade decision
   */
  async analyzeToken(token: any, walletId: string): Promise<TradeDecision> {
    const decisionId = uuidv4();
    const timestamp = Date.now();

    // ─── STEP 1: PRE-FILTER / GATEKEEPER ────────────────────────────────

    const gatekeeperDecision = await signalGateway.shouldAnalyze(token);
    if (!gatekeeperDecision.passed) {
      return {
        id: decisionId,
        token: token.address || token.mint,
        walletId,
        shouldTrade: false,
        tradeType: 'SKIP',
        conviction: 0,
        convictionMode: 'INACTIVE',
        positionSize: 0,
        leverage: 1,
        stopLoss: 0,
        takeProfit: 0,
        riskRewardRatio: 0,
        reasoning: {
          gatekeeper: `Blocked by pre-filter: ${gatekeeperDecision.reason}`,
          signals: [],
          confidence: 'No signals analyzed - failed pre-filter',
          risks: gatekeeperDecision.failureReasons,
          suggestions: ['Monitor wallet for next abnormal entry'],
        },
        timestamp,
      };
    }

    const reasoning = {
      gatekeeper: `Passed pre-filter (abnormality: ${gatekeeperDecision.abnormalityScore})`,
      signals: [] as string[],
      confidence: '',
      risks: [] as string[],
      suggestions: [] as string[],
    };

    // ─── STEP 2: GATHER INTELLIGENCE SIGNALS ────────────────────────────

    const signals = await this.gatherAllSignals(token, walletId);
    reasoning.signals = Object.keys(signals).filter((k) => signals[k] > 0);

    // ─── STEP 3: CALCULATE BASE CONVICTION ──────────────────────────────

    const baseConviction = await convictionScaler.calculateConviction(walletId, {
      smart_money_signal: signals.smartMoney || 0,
      narrative_vitality: signals.narrative || 0,
      holder_behavior: signals.holders || 0,
      regime_condition: signals.regime || 0,
      market_memory_match: signals.memory || 0,
      ai_validation_score: signals.aiValidation || 0,
    });

    reasoning.confidence = `Base conviction: ${baseConviction.score}% | Mode: ${baseConviction.mode}`;

    // ─── STEP 4: APPLY PERFORMANCE ADJUSTMENTS ──────────────────────────

    const adjustment = await confidenceAdjuster.adjustConviction(walletId, baseConviction.score);
    const adjustedConviction = baseConviction.score * adjustment.convictionMultiplier;

    if (adjustedConviction < adjustment.confidenceThreshold) {
      reasoning.suggestions.push(`Below threshold (${adjustment.confidenceThreshold}), skipping`);
      return {
        id: decisionId,
        token: token.address || token.mint,
        walletId,
        shouldTrade: false,
        tradeType: 'SKIP',
        conviction: adjustedConviction,
        convictionMode: 'OBSERVATION',
        positionSize: 0,
        leverage: 1,
        stopLoss: 0,
        takeProfit: 0,
        riskRewardRatio: 0,
        reasoning,
        timestamp,
      };
    }

    reasoning.confidence += ` → Adjusted: ${adjustedConviction.toFixed(0)}% (${adjustment.reason})`;

    // ─── STEP 5: DETERMINE POSITION SIZING ──────────────────────────────

    const positionSize = this.calculatePositionSize(
      adjustedConviction,
      baseConviction.capital_allocation,
      adjustment.positionSizeMultiplier
    );

    const leverage = this.calculateLeverage(adjustedConviction, baseConviction.leverage);

    // ─── STEP 6: SET RISK PARAMETERS ───────────────────────────────────

    const entryPrice = token.price || 0;
    const stopLoss = this.calculateStopLoss(entryPrice, adjustedConviction);
    const takeProfit = this.calculateTakeProfit(entryPrice, adjustedConviction);
    const riskRewardRatio = (takeProfit - entryPrice) / (entryPrice - stopLoss);

    // ─── STEP 7: IDENTIFY RISKS ────────────────────────────────────────

    reasoning.risks = this.identifyRisks(token, signals, adjustedConviction);

    // ─── STEP 8: GENERATE SUGGESTIONS ──────────────────────────────────

    reasoning.suggestions = this.generateSuggestions(
      adjustedConviction,
      signals,
      reasoning.risks,
      baseConviction.mode
    );

    // ─── MAKE FINAL DECISION ───────────────────────────────────────────

    const shouldTrade = this.makeFinalDecision(adjustedConviction, adjustment.confidenceThreshold);

    const decision: TradeDecision = {
      id: decisionId,
      token: token.address || token.mint,
      walletId,
      shouldTrade,
      tradeType: shouldTrade ? 'BUY' : 'SKIP',
      conviction: adjustedConviction,
      convictionMode: baseConviction.mode,
      positionSize,
      leverage,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      reasoning,
      timestamp,
    };

    // Log decision
    await this.logDecision(decision);

    // Emit event
    if (shouldTrade) {
      await emit({
        type: 'TRADE_SIGNAL',
        token: decision.token,
        walletId,
        signal: 'BUY',
        entryPrice,
        conviction: adjustedConviction,
        positionSize,
        timestamp,
      });
    }

    return decision;
  }

  /**
   * Gather all intelligence signals
   */
  private async gatherAllSignals(token: any, walletId: string): Promise<Record<string, number>> {
    const signals: Record<string, number> = {};

    try {
      // Smart money signals
      signals.smartMoney = await this.getSmartMoneySignal(token);

      // Narrative signals
      signals.narrative = await this.getNarrativeSignal(token);

      // Holder signals
      signals.holders = this.getHolderSignal(token);

      // Regime signals
      signals.regime = await this.getRegimeSignal();

      // Memory signals
      signals.memory = await this.getMemorySignal(token, walletId);

      // AI validation (if enabled)
      signals.aiValidation = await this.getAIValidation(token);
    } catch (error) {
      console.error('[Router] Error gathering signals:', error);
    }

    return signals;
  }

  /**
   * Smart money signal (dormant wallets, whale entries, insider clusters)
   */
  private async getSmartMoneySignal(token: any): Promise<number> {
    try {
      const { data } = await supabase
        .from('insider_momentum')
        .select('composite_score')
        .eq('token_address', token.address || token.mint)
        .single();

      return (data?.composite_score || 0) / 100; // normalize 0-1
    } catch {
      return 0;
    }
  }

  /**
   * Narrative signal (social velocity, influencer rotation, engagement)
   */
  private async getNarrativeSignal(token: any): Promise<number> {
    try {
      const { data } = await supabase
        .from('narrative_flows')
        .select('velocity_score, engagement_score')
        .eq('token_address', token.address || token.mint)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!data) return 0;
      return (data.velocity_score + data.engagement_score) / 2 / 100;
    } catch {
      return 0;
    }
  }

  /**
   * Holder divergence signal
   */
  private getHolderSignal(token: any): number {
    const holderCount = token.holders?.count || 0;
    const topHolderPercent = token.holders?.topPercent || 1;

    // More holders + less whale concentration = better
    const holderScore = Math.min(holderCount / 500, 1); // max 500 holders
    const concentrationScore = 1 - Math.min(topHolderPercent / 0.5, 1); // less concentration better

    return (holderScore + concentrationScore) / 2;
  }

  /**
   * Market regime signal
   */
  private async getRegimeSignal(): Promise<number> {
    try {
      const { data } = await supabase
        .from('bull_run_regime')
        .select('regime_score')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return (data?.regime_score || 50) / 100;
    } catch {
      return 0.5; // neutral
    }
  }

  /**
   * Market memory signal (historical pattern match)
   */
  private async getMemorySignal(token: any, walletId: string): Promise<number> {
    try {
      const patterns = await marketMemoryEngine.getTopPatterns(walletId, undefined, 5);
      if (!patterns || patterns.length === 0) return 0;

      const avgWinRate = patterns.reduce((sum: number, p: any) => sum + p.win_rate, 0) / patterns.length;
      return avgWinRate;
    } catch {
      return 0;
    }
  }

  /**
   * AI validation (optional haiku verification)
   */
  private async getAIValidation(token: any): Promise<number> {
    // Placeholder - would call Haiku for edge case analysis
    // For now, return 0 (not used)
    return 0;
  }

  /**
   * Calculate position size based on conviction
   */
  private calculatePositionSize(conviction: number, baseAllocation: number, multiplier: number): number {
    return (conviction / 100) * baseAllocation * multiplier;
  }

  /**
   * Calculate leverage based on conviction
   */
  private calculateLeverage(conviction: number, baseLeverage: number): number {
    if (conviction < 40) return 1;
    if (conviction < 60) return Math.min(baseLeverage, 1.5);
    if (conviction < 80) return baseLeverage;
    return Math.min(baseLeverage * 1.2, 3);
  }

  /**
   * Calculate stop loss
   */
  private calculateStopLoss(entryPrice: number, conviction: number): number {
    // Higher conviction = tighter stop
    const stopPercent = conviction < 50 ? 0.08 : conviction < 70 ? 0.05 : 0.03;
    return entryPrice * (1 - stopPercent);
  }

  /**
   * Calculate take profit
   */
  private calculateTakeProfit(entryPrice: number, conviction: number): number {
    // Higher conviction = higher target
    const tpPercent = conviction < 50 ? 0.4 : conviction < 70 ? 0.75 : 1.5;
    return entryPrice * (1 + tpPercent);
  }

  /**
   * Identify risks
   */
  private identifyRisks(token: any, signals: Record<string, number>, conviction: number): string[] {
    const risks: string[] = [];

    if (signals.smartMoney === 0) risks.push('No smart money signals');
    if (signals.narrative === 0) risks.push('Weak narrative signals');
    if ((token.holders?.topPercent || 0) > 0.3) risks.push('High whale concentration');
    if (conviction < 50) risks.push('Low conviction entry');
    if ((token.volume?.m5 || 0) < 1000) risks.push('Low volume');
    if ((token.liquidity?.usd || 0) < 10000) risks.push('Low liquidity');

    return risks;
  }

  /**
   * Generate suggestions
   */
  private generateSuggestions(
    conviction: number,
    signals: Record<string, number>,
    risks: string[],
    mode: string
  ): string[] {
    const suggestions: string[] = [];

    if (conviction > 80) {
      suggestions.push('Strong setup, consider maximum position size');
    } else if (conviction > 60) {
      suggestions.push('Good setup, normal position sizing');
    } else {
      suggestions.push('Weak setup, use smaller position');
    }

    if (risks.length > 0) {
      suggestions.push(`${risks.length} risk(s) identified, tight stops recommended`);
    }

    if (signals.memory > 0.6) {
      suggestions.push('Historical pattern matching, high confidence');
    }

    return suggestions;
  }

  /**
   * Make final decision
   */
  private makeFinalDecision(conviction: number, threshold: number): boolean {
    return conviction >= threshold;
  }

  /**
   * Log decision to database
   */
  private async logDecision(decision: TradeDecision): Promise<void> {
    try {
      await supabase.from('routing_decisions').insert({
        id: decision.id,
        token: decision.token,
        wallet_id: decision.walletId,
        should_trade: decision.shouldTrade,
        conviction: decision.conviction,
        conviction_mode: decision.convictionMode,
        position_size: decision.positionSize,
        leverage: decision.leverage,
        stop_loss: decision.stopLoss,
        take_profit: decision.takeProfit,
        risk_reward_ratio: decision.riskRewardRatio,
        reasoning: decision.reasoning,
        created_at: new Date(decision.timestamp).toISOString(),
      });
    } catch (error) {
      console.warn('[Router] Could not log decision:', (error as Error).message);
    }
  }

  /**
   * Get routing statistics
   */
  async getStats(walletId: string): Promise<{
    totalAnalyzed: number;
    totalSignals: number;
    avgConviction: number;
    successRate: number;
  }> {
    try {
      const { data } = await supabase
        .from('routing_decisions')
        .select('conviction, should_trade')
        .eq('wallet_id', walletId);

      if (!data || data.length === 0) {
        return { totalAnalyzed: 0, totalSignals: 0, avgConviction: 0, successRate: 0 };
      }

      const signals = data.filter((d: any) => d.should_trade).length;
      const avgConviction = data.reduce((sum: number, d: any) => sum + d.conviction, 0) / data.length;

      return {
        totalAnalyzed: data.length,
        totalSignals: signals,
        avgConviction,
        successRate: (signals / data.length) * 100,
      };
    } catch (error) {
      console.error('[Router] Failed to get stats:', error);
      return { totalAnalyzed: 0, totalSignals: 0, avgConviction: 0, successRate: 0 };
    }
  }
}

export const completeRouter = new CompleteRouter();