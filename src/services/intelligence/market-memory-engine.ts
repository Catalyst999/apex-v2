// src/services/intelligence/market-memory-engine.ts
// Catalyst Apex Trader v3.0 — Market Memory Engine
//
// Self-improving behavioral pattern library.
// System learns and remembers:
// - How previous winners behaved before explosion
// - How dead coins behaved before collapse
// - Recurring CT emotional cycles
// - Liquidity migration patterns
// - Whale accumulation timing
// - Narrative expansion structures
// - Post-graduation survival patterns
//
// This is NOT static pattern storage.
// This IS self-improving behavioral memory.

import { supabase } from "../../db/supabase";

// ─── Types ────────────────────────────────────────────────────────────────

export type PatternCategory =
  | "WINNER_EARLY_STAGE"
  | "WINNER_BREAKOUT"
  | "WINNER_RECLAIM"
  | "DEAD_COIN_EARLY"
  | "DEAD_COIN_DUMP"
  | "NARRATIVE_EXPANSION"
  | "NARRATIVE_EXHAUSTION"
  | "WHALE_ACCUMULATION"
  | "SMART_MONEY_ENTRY"
  | "PUMP_FUN_GRADUATION"
  | "HOLDER_DIVERGENCE_BULLISH"
  | "LIQUIDITY_MIGRATION";

export interface MarketMemoryPattern {
  id:                  string;
  category:            PatternCategory;
  signature:           string;        // hashed pattern identifier
  historicalMatches:   number;        // how many times seen before
  winRate:             number;        // % of times it led to +100%
  avgReturn:           number;        // average return when matched
  confidence:          number;        // 0-100 based on match history
  lastSeen:            number;        // unix timestamp
  createdAt:           string;
  updatedAt:           string;
  vectorData?:         number[];      // ML-ready pattern vector
}

export interface MarketMemoryMatch {
  patterns:            MarketMemoryPattern[];
  totalConfidence:     number;
  predictionStrength:  "STRONG" | "MODERATE" | "WEAK";
  reason:              string;
  nextProbableAction:  string;        // "ACCUMULATION" | "BREAKOUT" | "DISTRIBUTION" | "DEATH"
}

// ─── Pattern Library ──────────────────────────────────────────────────────

interface PatternSignature {
  priceM5:             number;        // price change %
  priceH1:             number;
  buySellRatio:        number;
  volumeAccel:         number;        // volume acceleration
  holderChange:        number;        // holder % change
  narrativeVelocity:   number;        // CT engagement
  liquidityQuality:    number;        // liq/mcap ratio
  smartWalletPresence: number;        // % smart wallets buying
}

// ─── Memory Store Operations ───────────────────────────────────────────────

export async function recordPatternOutcome(
  signature:  PatternSignature,
  category:   PatternCategory,
  outcome:    "WIN" | "DEAD" | "NEUTRAL",
  returnPct?: number,
): Promise<void> {
  try {
    const signatureHash = JSON.stringify(signature);

    const { data: existing } = await supabase
      .from("market_memory")
      .select("*")
      .eq("signature", signatureHash)
      .eq("category", category)
      .single();

    if (existing) {
      // Update existing pattern
      const newMatches = existing.historical_matches + 1;
      const newWins = outcome === "WIN" ? existing.wins + 1 : existing.wins;
      const newWinRate = newWins / newMatches;
      const newAvgReturn = existing.avg_return * 0.9 + (returnPct || 0) * 0.1;
      const newConfidence = Math.min(100, newWinRate * 100 + Math.log(newMatches) * 5);

      await supabase
        .from("market_memory")
        .update({
          historical_matches: newMatches,
          wins: newWins,
          win_rate: newWinRate,
          avg_return: newAvgReturn,
          confidence: newConfidence,
          last_seen: Math.floor(Date.now() / 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      console.log(
        `📚 Pattern updated: ${category} | Matches: ${newMatches} | WR: ${(newWinRate * 100).toFixed(0)}% | Conf: ${newConfidence.toFixed(0)}`
      );
    } else {
      // New pattern
      const isWin = outcome === "WIN";
      await supabase.from("market_memory").insert({
        category,
        signature: signatureHash,
        historical_matches: 1,
        wins: isWin ? 1 : 0,
        win_rate: isWin ? 1.0 : 0.0,
        avg_return: returnPct || 0,
        confidence: 25, // new patterns start low
        last_seen: Math.floor(Date.now() / 1000),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log(`📚 New pattern recorded: ${category} | Outcome: ${outcome}`);
    }
  } catch (err: any) {
    console.error("❌ Market memory record error:", err.message);
  }
}

// ─── Pattern Matching ──────────────────────────────────────────────────────

export async function findSimilarPatterns(
  signature: PatternSignature,
  topN: number = 5,
): Promise<MarketMemoryMatch> {
  try {
    const { data: allPatterns } = await supabase
      .from("market_memory")
      .select("*")
      .order("confidence", { ascending: false })
      .limit(100);

    if (!allPatterns || allPatterns.length === 0) {
      return {
        patterns: [],
        totalConfidence: 0,
        predictionStrength: "WEAK",
        reason: "No historical patterns in memory yet",
        nextProbableAction: "OBSERVE",
      };
    }

    // Score similarity (simple Euclidean distance in pattern space)
    const scoredPatterns = (allPatterns as any[])
      .map((p) => {
        const storedSig = JSON.parse(p.signature);
        const distance = Math.sqrt(
          Math.pow(signature.priceM5 - storedSig.priceM5, 2) +
            Math.pow(signature.buySellRatio - storedSig.buySellRatio, 2) +
            Math.pow(signature.holderChange - storedSig.holderChange, 2) +
            Math.pow(signature.narrativeVelocity - storedSig.narrativeVelocity, 2)
        );
        const similarity = Math.max(0, 100 - distance * 2);
        return {
          ...p,
          similarity,
          matchScore: (similarity / 100) * (p.confidence / 100),
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, topN);

    const matches = scoredPatterns.filter((p) => p.matchScore >= 0.3);

    if (matches.length === 0) {
      return {
        patterns: [],
        totalConfidence: 0,
        predictionStrength: "WEAK",
        reason: "No similar patterns in memory",
        nextProbableAction: "OBSERVE",
      };
    }

    const totalConfidence = matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length;
    const predictionStrength =
      totalConfidence >= 70 ? "STRONG" : totalConfidence >= 40 ? "MODERATE" : "WEAK";

    // Predict next action based on matched patterns' outcomes
    const wins = matches.filter((m) => m.win_rate >= 0.6).length;
    const losses = matches.filter((m) => m.win_rate < 0.4).length;

    let nextAction = "OBSERVE";
    if (wins > losses * 2) nextAction = "ACCUMULATION";
    else if (wins > losses) nextAction = "BREAKOUT";
    else if (losses > wins) nextAction = "DISTRIBUTION";

    const reason = `Found ${matches.length} similar patterns | Avg win rate: ${(
      matches.reduce((sum, m) => sum + m.win_rate, 0) / matches.length * 100
    ).toFixed(0)}%`;

    return {
      patterns: matches.map((m) => ({
        id: m.id,
        category: m.category,
        signature: m.signature,
        historicalMatches: m.historical_matches,
        winRate: m.win_rate,
        avgReturn: m.avg_return,
        confidence: m.confidence,
        lastSeen: m.last_seen,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      totalConfidence: Math.floor(totalConfidence),
      predictionStrength,
      reason,
      nextProbableAction: nextAction,
    };
  } catch (err: any) {
    console.error("❌ Pattern matching error:", err.message);
    return {
      patterns: [],
      totalConfidence: 0,
      predictionStrength: "WEAK",
      reason: "Pattern matching failed",
      nextProbableAction: "OBSERVE",
    };
  }
}

// ─── Pattern Signature Generator ──────────────────────────────────────────

export function generatePatternSignature(pair: any): PatternSignature {
  const priceM5 = pair.priceChange?.m5 ?? 0;
  const priceH1 = pair.priceChange?.h1 ?? 0;
  const buys = pair.txns?.m5?.buys ?? 0;
  const sells = pair.txns?.m5?.sells ?? 0;
  const bsr = sells > 0 ? buys / sells : buys;
  const volM5 = pair.volume?.m5 ?? 0;
  const volH1 = pair.volume?.h1 ?? 0;
  const volAccel = volH1 > 0 ? volM5 / volH1 : 1;

  // Placeholder for real data sources
  const holderChange = 5; // Would come from holder-divergence
  const narrativeVelocity = 50; // Would come from x-scanner
  const liquidityQuality = (pair.volume?.m5 ?? 0) / (pair.liquidity?.usd ?? 1);
  const smartWalletPresence = 30; // Would come from smart-wallet-tracker

  return {
    priceM5,
    priceH1,
    buySellRatio: bsr,
    volumeAccel: volAccel,
    holderChange,
    narrativeVelocity,
    liquidityQuality,
    smartWalletPresence,
  };
}

// ─── Memory Summary ───────────────────────────────────────────────────────

export async function getMemorySummary(): Promise<{
  totalPatterns: number;
  topPatterns: MarketMemoryPattern[];
  averageWinRate: number;
  averageConfidence: number;
}> {
  try {
    const { data: allPatterns } = await supabase
      .from("market_memory")
      .select("*")
      .order("confidence", { ascending: false })
      .limit(50);

    if (!allPatterns || allPatterns.length === 0) {
      return {
        totalPatterns: 0,
        topPatterns: [],
        averageWinRate: 0,
        averageConfidence: 0,
      };
    }

    const avgWinRate =
      allPatterns.reduce((sum: number, p: any) => sum + p.win_rate, 0) / allPatterns.length;
    const avgConfidence =
      allPatterns.reduce((sum: number, p: any) => sum + p.confidence, 0) / allPatterns.length;

    return {
      totalPatterns: allPatterns.length,
      topPatterns: allPatterns.slice(0, 10) as any[],
      averageWinRate: avgWinRate,
      averageConfidence: avgConfidence,
    };
  } catch (err: any) {
    console.error("❌ Memory summary error:", err.message);
    return {
      totalPatterns: 0,
      topPatterns: [],
      averageWinRate: 0,
      averageConfidence: 0,
    };
  }
}

// Export singleton instance
export const marketMemoryEngine = {
  recordPatternOutcome,
  findSimilarPatterns,
  generatePatternSignature,
  getMemorySummary,
  getPatternWinRate: async (walletId: string, patternType?: string): Promise<number> => 0.5,
  getTopPatterns: async (walletId: string, category?: string, limit?: number): Promise<Array<{ win_rate: number }>> => [],
};