/**
 * MARKET MEMORY ENGINE - WALLET-AWARE
 * Self-improving pattern library per wallet + global patterns
 */

import { supabase } from '../core/supabase';
import { walletManager } from '../wallet/wallet-manager';
import { hashObject } from '../core/utils';

interface MarketMemoryEntry {
  id: string;
  wallet_id: string | null;
  pattern_hash: string;
  pattern_name: string;
  pattern_type: string;
  occurrences: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  avg_return_percent: number;
  confidence_score: number;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

class MarketMemoryEngine {
  private patternCache: Map<string, MarketMemoryEntry[]> = new Map();

  async recordOutcome(
    walletId: string,
    token: string,
    patternType: string,
    patternContext: any,
    outcome: { entry_price: number; exit_price: number; return_percent: number; isWin: boolean; }
  ): Promise<void> {
    try {
      const isValid = await walletManager.validateIsolation(walletId, token);
      if (!isValid) return;

      const patternHash = this.generatePatternHash(patternType, patternContext);
      const patternName = this.getPatternName(patternType, patternContext);

      const { data: existing } = await supabase
        .from('market_memory')
        .select('*')
        .eq('wallet_id', walletId)
        .eq('pattern_hash', patternHash)
        .single();

      if (existing) {
        const newOccurrences = existing.occurrences + 1;
        const newWinCount = existing.win_count + (outcome.isWin ? 1 : 0);
        await supabase.from('market_memory').update({
          occurrences: newOccurrences,
          win_count: newWinCount,
          loss_count: newOccurrences - newWinCount,
          win_rate: newWinCount / newOccurrences,
          avg_return_percent: (existing.avg_return_percent * existing.occurrences + outcome.return_percent) / newOccurrences,
          confidence_score: this.calculateConfidence(newOccurrences, newWinCount / newOccurrences),
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await supabase.from('market_memory').insert({
          wallet_id: walletId,
          pattern_hash: patternHash,
          pattern_name: patternName,
          pattern_type: patternType,
          occurrences: 1,
          win_count: outcome.isWin ? 1 : 0,
          loss_count: outcome.isWin ? 0 : 1,
          win_rate: outcome.isWin ? 1.0 : 0.0,
          avg_return_percent: outcome.return_percent,
          confidence_score: 0.1,
          last_seen: new Date().toISOString(),
        });
      }
      this.patternCache.delete(walletId);
    } catch (error) {
      console.error('[MarketMemory] Failed to record outcome:', error);
    }
  }

  async getPatternMatch(walletId: string, patternType: string, patternContext: any): Promise<MarketMemoryEntry | null> {
    const patternHash = this.generatePatternHash(patternType, patternContext);
    const cacheKey = `${walletId}_patterns`;
    let patterns = this.patternCache.get(cacheKey);

    if (!patterns) {
      const { data } = await supabase.from('market_memory').select('*').eq('wallet_id', walletId).eq('pattern_type', patternType);
      patterns = data || [];
      this.patternCache.set(cacheKey, patterns);
    }

    const exact = patterns.find(p => p.pattern_hash === patternHash);
    if (exact && exact.confidence_score > 0.3) return exact;

    const { data: global } = await supabase.from('market_memory').select('*').is('wallet_id', null).eq('pattern_hash', patternHash).single();
    return global || null;
  }

  async getTopPatterns(walletId: string, limit: number = 5, minConfidence: number = 0.4): Promise<MarketMemoryEntry[]> {
    const { data } = await supabase.from('market_memory').select('*').eq('wallet_id', walletId).gte('confidence_score', minConfidence).order('win_rate', { ascending: false }).limit(limit);
    return data || [];
  }

  async getPatternWinRate(walletId: string, patternType: string): Promise<number> {
    const { data } = await supabase.from('market_memory').select('win_rate').eq('wallet_id', walletId).eq('pattern_type', patternType).limit(1).single();
    return data?.win_rate || 0;
  }

  private generatePatternHash(patternType: string, context: any): string {
    return hashObject({ type: patternType, priceLevel: Math.round(context.priceLevel || 0), volumeProfile: Math.round(context.volumeProfile || 0) });
  }

  private getPatternName(patternType: string, context: any): string {
    const typeNames: any = { 'whale_accumulation': 'Whale Accumulation', 'narrative_expansion': 'Narrative Expansion' };
    return typeNames[patternType] || patternType;
  }

  private calculateConfidence(occurrences: number, winRate: number): number {
    const occurrenceBonus = Math.min(occurrences / 20, 0.8);
    const winRateBonus = Math.max(winRate - 0.4, 0);
    return Math.min((occurrenceBonus + winRateBonus) / 2, 1.0);
  }
}

export const marketMemoryEngine = new MarketMemoryEngine();