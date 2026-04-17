// src/services/scoring/outlier-v2.ts
// Catalyst Apex Trader v2.1 — Outlier Strategy V2
//
// The original outlier strategy triggered on VISIBLE momentum — meaning
// the move had already happened by the time we entered.
//
// V2 targets SILENT signals — tokens accumulating quietly before the
// crowd notices. Four new sub-strategies based on the expert guide:
//
// 1. SILENT ACCUMULATION — new token, growing holders, price barely moved
// 2. POST-DUMP RECOVERY  — token dropped 40-80%, now showing sustained buyers
// 3. NARRATIVE EARLY     — same narrative as 3+ other launching tokens
// 4. SMART MONEY CLUSTER — tracked profitable wallets entering in same window

import axios from "axios";
import { HELIUS } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutlierV2Signal =
  | "SILENT_ACCUMULATION"
  | "POST_DUMP_RECOVERY"
  | "NARRATIVE_EARLY"
  | "SMART_MONEY_CLUSTER"
  | "NONE";

export interface OutlierV2Result {
  signal:          OutlierV2Signal;
  confidence:      number;      // 0-100
  expectedReturn:  number;      // X multiplier
  reason:          string;
  evidence:        Record<string, any>;
}

// ─── Strategy 1: Silent Accumulation ─────────────────────────────────────────
// Conditions from the expert guide:
// - Token 2-15 minutes old
// - 5-30 new holders per minute
// - Price increase < 30% (not pumped yet)
// - At least one smart wallet present

export function checkSilentAccumulation(pair: any, holderGrowthPerMin: number): OutlierV2Result {
  const now        = Date.now();
  const ageMinutes = (now - pair.pairCreatedAt) / 1000 / 60;
  const priceUp    = pair.priceChange?.m5 ?? 0;
  const mcap       = pair.marketCap ?? pair.fdv ?? 0;

  const conditions = {
    correctAge:       ageMinutes >= 2 && ageMinutes <= 15,
    holdersGrowing:   holderGrowthPerMin >= 5 && holderGrowthPerMin <= 30,
    notPumpedYet:     priceUp < 30,
    lowMcap:          mcap === 0 || mcap <= 150_000,
  };

  const passed = Object.values(conditions).filter(Boolean).length;

  if (passed >= 3 && conditions.correctAge && conditions.notPumpedYet) {
    return {
      signal:         "SILENT_ACCUMULATION",
      confidence:     Math.min(100, passed * 25),
      expectedReturn: 3,
      reason:         `Silent accumulation: ${holderGrowthPerMin.toFixed(1)} holders/min, age ${ageMinutes.toFixed(1)}m, price only +${priceUp.toFixed(1)}%`,
      evidence:       { ageMinutes, holderGrowthPerMin, priceUp, mcap, conditions },
    };
  }

  return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };
}

// ─── Strategy 2: Post-Dump Recovery ──────────────────────────────────────────
// Conditions:
// - Token 1-3 hours old
// - Price dropped 40-80% from peak
// - Sustained buying (buy/sell ratio improving)
// - Stable floor (price not still falling)

export function checkPostDumpRecovery(pair: any): OutlierV2Result {
  const now        = Date.now();
  const ageMinutes = (now - pair.pairCreatedAt) / 1000 / 60;
  const priceM5    = pair.priceChange?.m5  ?? 0;
  const priceH1    = pair.priceChange?.h1  ?? 0;
  const buys       = pair.txns?.m5?.buys   ?? 0;
  const sells      = pair.txns?.m5?.sells  ?? 0;
  const buySellRatio = sells > 0 ? buys / sells : buys;

  const conditions = {
    correctAge:     ageMinutes >= 60 && ageMinutes <= 180,
    droppedHard:    priceH1 <= -40 && priceH1 >= -80,
    floorStable:    priceM5 >= -5,         // not still dumping
    buyingReturning: buySellRatio >= 1.5,
  };

  const passed = Object.values(conditions).filter(Boolean).length;

  if (passed >= 3) {
    return {
      signal:         "POST_DUMP_RECOVERY",
      confidence:     Math.min(100, passed * 25),
      expectedReturn: 2,
      reason:         `Post-dump recovery: dropped ${priceH1.toFixed(0)}% in 1h, floor stabilising, buy/sell ${buySellRatio.toFixed(2)}`,
      evidence:       { ageMinutes, priceH1, priceM5, buySellRatio, conditions },
    };
  }

  return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };
}

// ─── Strategy 3: Narrative Early ─────────────────────────────────────────────
// Conditions:
// - Same keyword/narrative in 3+ recently launched tokens
// - Combined volume of those tokens > $50k
// This means the meta is forming — get in early on the best version

export function checkNarrativeEarly(
  currentPair: any,
  recentPairs:  any[],
): OutlierV2Result {
  const currentName = (currentPair.baseToken.name + " " + currentPair.baseToken.symbol).toLowerCase();

  // Extract keywords from current token name
  const keywords = currentName.split(/\s+/).filter((w) => w.length > 3);

  let matchCount    = 0;
  let combinedVol   = currentPair.volume?.m5 ?? 0;

  for (const pair of recentPairs) {
    if (pair.baseToken.address === currentPair.baseToken.address) continue;
    const otherName = (pair.baseToken.name + " " + pair.baseToken.symbol).toLowerCase();
    const hasMatch  = keywords.some((kw) => otherName.includes(kw));
    if (hasMatch) {
      matchCount++;
      combinedVol += pair.volume?.m5 ?? 0;
    }
  }

  if (matchCount >= 2 && combinedVol >= 50_000) {
    return {
      signal:         "NARRATIVE_EARLY",
      confidence:     Math.min(100, matchCount * 20 + 20),
      expectedReturn: 4,
      reason:         `Narrative forming: ${matchCount + 1} coins on same meta, combined vol $${(combinedVol / 1000).toFixed(0)}k`,
      evidence:       { matchCount, combinedVol, keywords },
    };
  }

  return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };
}

// ─── Strategy 4: Smart Money Cluster ─────────────────────────────────────────
// Conditions:
// - 2+ tracked profitable wallets entered within same 5-minute window
// - Those wallets have >60% win rate in our deployer_profiles or smart_wallets table

export async function checkSmartMoneyCluster(
  tokenAddress: string,
  supabase:     any,
): Promise<OutlierV2Result> {
  try {
    // Fetch recent buyers from Helius
    const res = await axios.get(
      `https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions`,
      {
        params: { "api-key": HELIUS.apiKey, limit: 20, type: "SWAP" },
        timeout: 8000,
      }
    );

    const txs: any[] = res.data ?? [];
    const buyers = txs.map((tx: any) => tx.feePayer ?? tx.signers?.[0]).filter(Boolean);
    if (buyers.length === 0) return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };

    // Check how many of these buyers are in our smart_wallets table
    const { data: smartWallets } = await supabase
      .from("smart_wallets")
      .select("address, win_rate")
      .in("address", buyers)
      .gte("win_rate", 0.6);

    const smartBuyers: any[] = smartWallets ?? [];

    if (smartBuyers.length >= 2) {
      const avgWinRate = smartBuyers.reduce((sum: number, w: any) => sum + w.win_rate, 0) / smartBuyers.length;
      return {
        signal:         "SMART_MONEY_CLUSTER",
        confidence:     Math.min(100, smartBuyers.length * 30 + 20),
        expectedReturn: 5,
        reason:         `Smart money cluster: ${smartBuyers.length} tracked wallets entered (avg win rate ${(avgWinRate * 100).toFixed(0)}%)`,
        evidence:       { smartBuyers: smartBuyers.map((w: any) => w.address), avgWinRate },
      };
    }

    return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };

  } catch (err: any) {
    console.error("❌ Smart money check error:", err.message);
    return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };
  }
}

// ─── Main router ──────────────────────────────────────────────────────────────
// Runs all 4 strategies and returns the highest confidence signal.

export async function runOutlierV2(
  pair:         any,
  recentPairs:  any[],
  supabase:     any,
  holderGrowthPerMin = 0,
): Promise<OutlierV2Result> {
  const results: OutlierV2Result[] = [];

  results.push(checkSilentAccumulation(pair, holderGrowthPerMin));
  results.push(checkPostDumpRecovery(pair));
  results.push(checkNarrativeEarly(pair, recentPairs));
  results.push(await checkSmartMoneyCluster(pair.baseToken.address, supabase));

  // Return highest confidence non-NONE signal
  const valid = results.filter((r) => r.signal !== "NONE");
  if (valid.length === 0) return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };

  return valid.reduce((best, curr) => curr.confidence > best.confidence ? curr : best);
}