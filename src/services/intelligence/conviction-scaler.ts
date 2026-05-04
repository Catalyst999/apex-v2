import { supabase } from '../../db/supabase';
import { walletManager } from '../wallet/wallet-manager';
import { marketMemoryEngine } from './market-memory-engine';

enum ConvictionMode {
  AGGRESSIVE = 'AGGRESSIVE',   
  CAUTIOUS = 'CAUTIOUS',       
  DEFENSIVE = 'DEFENSIVE',     
  OBSERVATION = 'OBSERVATION', 
  INACTIVE = 'INACTIVE',       
}

interface ConvictionSignals {
  smart_money_signal: number;      
  narrative_vitality: number;      
  holder_behavior: number;         
  regime_condition: number;        
  market_memory_match: number;     
  ai_validation_score?: number;    
}

interface ConvictionResult {
  score: number;                   
  mode: ConvictionMode;
  capital_allocation: number;      
  leverage: number;                
  confidence: string;
  signal_breakdown: ConvictionSignals;
  // Extended properties for risk engine
  maxPositionSize?: number;
  hardStopLossPercent?: number;
  takeProfitLadder?: Array<number>;
  trailingStopPercent?: number;
}

class ConvictionScaler {
  private convictionHistory: Map<string, ConvictionResult[]> = new Map();

  async calculateConviction(
    walletId: string,
    signals: ConvictionSignals,
    patternType?: string
  ): Promise<ConvictionResult> {
    try {
      const isValid = await walletManager.validateIsolation(walletId, '');
      if (!isValid) return this.getInactiveResult(signals);

      const weights = await this.getWalletWeights(walletId);
      const regimeDampen = this.getRegimeDampeningFactor(signals.regime_condition);

      let memoryBoost = 0;
      if (patternType) {
        const patternWinRate = await marketMemoryEngine.getPatternWinRate(walletId, patternType);
        memoryBoost = patternWinRate * 0.2;
      }

      let score =
        signals.smart_money_signal * weights.smartMoney +
        signals.narrative_vitality * weights.narrativeVitality +
        signals.holder_behavior * weights.holderBehavior +
        signals.regime_condition * weights.regime +
        signals.market_memory_match * weights.marketMemory;

      if (signals.ai_validation_score) {
        score = score * 0.8 + signals.ai_validation_score * 0.2;
      }

      score = score * regimeDampen;
      score = Math.min(score + memoryBoost, 100);

      const mode = this.getConvictionMode(score);
      const { capital, leverage } = this.getAllocationForMode(mode);

      const result: ConvictionResult = {
        score: Math.round(score),
        mode,
        capital_allocation: capital,
        leverage,
        confidence: this.getConfidenceLabel(score),
        signal_breakdown: signals,
      };

      await this.logConviction(walletId, result);
      if (!this.convictionHistory.has(walletId)) this.convictionHistory.set(walletId, []);
      this.convictionHistory.get(walletId)!.push(result);

      return result;
    } catch (error) {
      console.error('[ConvictionScaler] Failed to calculate conviction:', error);
      return this.getInactiveResult(signals);
    }
  }

  private async getWalletWeights(walletId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('wallet_analytics')
        .select('*')
        .eq('wallet_id', walletId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      let weights = { smartMoney: 0.30, narrativeVitality: 0.20, holderBehavior: 0.20, regime: 0.15, marketMemory: 0.15 };

      if (data && data.total_trades > 20) {
        const memoryAccuracy = await this.getMemoryPatternAccuracy(walletId);
        if (memoryAccuracy > 0.55) {
          weights.marketMemory = 0.25;
          weights.narrativeVitality = 0.15;
        }
        const smartMoneyAccuracy = await this.getSmartMoneyAccuracy(walletId);
        if (smartMoneyAccuracy > 0.60) {
          weights.smartMoney = 0.40;
          weights.regime = 0.10;
        }
      }
      return weights;
    } catch (error) {
      return { smartMoney: 0.30, narrativeVitality: 0.20, holderBehavior: 0.20, regime: 0.15, marketMemory: 0.15 };
    }
  }

  private getRegimeDampeningFactor(regimeCondition: number): number {
    if (regimeCondition < 30) return 0.6;
    if (regimeCondition < 50) return 0.75;
    if (regimeCondition < 70) return 0.9;
    return 1.0;
  }

  private getConvictionMode(score: number): ConvictionMode {
    if (score >= 80) return ConvictionMode.AGGRESSIVE;
    if (score >= 60) return ConvictionMode.CAUTIOUS;
    if (score >= 40) return ConvictionMode.DEFENSIVE;
    if (score >= 30) return ConvictionMode.OBSERVATION;
    return ConvictionMode.INACTIVE;
  }

  private getAllocationForMode(mode: ConvictionMode): { capital: number; leverage: number } {
    const modes = {
      [ConvictionMode.AGGRESSIVE]: { capital: 15, leverage: 3 },
      [ConvictionMode.CAUTIOUS]: { capital: 8, leverage: 2 },
      [ConvictionMode.DEFENSIVE]: { capital: 3, leverage: 1 },
      [ConvictionMode.OBSERVATION]: { capital: 0, leverage: 1 },
      [ConvictionMode.INACTIVE]: { capital: 0, leverage: 1 },
    };
    return modes[mode];
  }

  private getConfidenceLabel(score: number): string {
    if (score >= 90) return 'Very High';
    if (score >= 75) return 'High';
    if (score >= 60) return 'Moderate';
    if (score >= 45) return 'Low';
    return 'Very Low';
  }

  private async logConviction(walletId: string, result: ConvictionResult): Promise<void> {
    try {
      await supabase.from('conviction_logs').insert({
        wallet_id: walletId,
        token: 'system',
        conviction_score: result.score,
        smart_money_signal: result.signal_breakdown.smart_money_signal,
        narrative_vitality: result.signal_breakdown.narrative_vitality,
        holder_behavior: result.signal_breakdown.holder_behavior,
        regime_condition: result.signal_breakdown.regime_condition,
        market_memory_match: result.signal_breakdown.market_memory_match,
        ai_validation_score: result.signal_breakdown.ai_validation_score,
        final_decision: result.mode,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[ConvictionScaler] Failed to log conviction:', error);
    }
  }

  private async getMemoryPatternAccuracy(walletId: string): Promise<number> {
    const patterns = await marketMemoryEngine.getTopPatterns(walletId, undefined, 0) as Array<{ win_rate: number }>;
    if (patterns.length === 0) return 0.5;
    return patterns.reduce((sum, p) => sum + p.win_rate, 0) / patterns.length;
  }

  private async getSmartMoneyAccuracy(walletId: string): Promise<number> {
    const { data } = await supabase.from('conviction_logs').select('conviction_score').eq('wallet_id', walletId).limit(20);
    if (!data || data.length === 0) return 0.5;
    return data.filter((d: any) => d.conviction_score > 70).length / data.length;
  }

  private getInactiveResult(signals: ConvictionSignals): ConvictionResult {
    return { score: 0, mode: ConvictionMode.INACTIVE, capital_allocation: 0, leverage: 1, confidence: 'Very Low', signal_breakdown: signals };
  }

  getWalletConvictionHistory(walletId: string): ConvictionResult[] {
    return this.convictionHistory.get(walletId) || [];
  }
}

export const convictionScaler = new ConvictionScaler();
export { ConvictionMode, ConvictionResult, ConvictionSignals };

// Aliases for compatibility with risk-engine imports
export type ConvictionScaledRisk = ConvictionResult;
export interface AlignmentScore {
  narrativeScore?: number;
  technicalScore?: number;
  behavioralScore?: number;
  liquidityScore?: number;
  safetyScore?: number;
  timerScore?: number;
  smartMoneyScore?: number;
  marketRegimeScore?: number;
}

export function calculatePositionSize(conviction: ConvictionResult, baseAmount: number): number {
  return baseAmount * conviction.capital_allocation * conviction.leverage;
}

export function calculateConvictionMode(signals: AlignmentScore): ConvictionResult {
  const score = Math.round(
    (signals.narrativeScore ?? 0) +
    (signals.technicalScore ?? 0) +
    (signals.behavioralScore ?? 0) +
    (signals.liquidityScore ?? 0) +
    (signals.safetyScore ?? 0) +
    (signals.timerScore ?? 0) +
    (signals.smartMoneyScore ?? 0) +
    (signals.marketRegimeScore ?? 0)
  );

  const mode = mapScoreToConvictionMode(score);
  const { capital, leverage } = getAllocationForConvictionMode(mode);

  return {
    score,
    mode,
    capital_allocation: capital,
    leverage,
    confidence: `${score}`,
    signal_breakdown: {
      smart_money_signal: 0,
      narrative_vitality: 0,
      holder_behavior: 0,
      regime_condition: 0,
      market_memory_match: 0,
    },
    maxPositionSize: 10,
    hardStopLossPercent: 5,
    takeProfitLadder: [40, 35, 20, 5],
    trailingStopPercent: 3,
  };
}

function mapScoreToConvictionMode(score: number): ConvictionMode {
  if (score >= 80) return ConvictionMode.AGGRESSIVE;
  if (score >= 60) return ConvictionMode.CAUTIOUS;
  if (score >= 40) return ConvictionMode.DEFENSIVE;
  if (score >= 30) return ConvictionMode.OBSERVATION;
  return ConvictionMode.INACTIVE;
}

function getAllocationForConvictionMode(mode: ConvictionMode): { capital: number; leverage: number } {
  const modes = {
    [ConvictionMode.AGGRESSIVE]: { capital: 15, leverage: 3 },
    [ConvictionMode.CAUTIOUS]: { capital: 8, leverage: 2 },
    [ConvictionMode.DEFENSIVE]: { capital: 3, leverage: 1 },
    [ConvictionMode.OBSERVATION]: { capital: 0, leverage: 1 },
    [ConvictionMode.INACTIVE]: { capital: 0, leverage: 1 },
  };
  return modes[mode];
}