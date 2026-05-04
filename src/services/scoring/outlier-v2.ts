// src/services/scoring/outlier-v2.ts
// Catalyst Apex Trader v2.1 — Outlier Strategy V2
//
// Targets SILENT signals — tokens accumulating quietly before the crowd notices.
// Four sub-strategies:
// 1. SILENT ACCUMULATION   — new token, growing holders, price barely moved
// 2. POST-DUMP RECOVERY    — dropped 40-80%, now showing sustained buyers
// 3. NARRATIVE EARLY       — same narrative as 3+ other launching tokens
// 4. SMART_MONEY_CLUSTER   — tracked profitable wallets entering in same window
//
// FIX: Helius endpoint corrected to use Enhanced Transactions API.

import axios    from "axios";
import { HELIUS } from "../../core/config";

// ─── Types ───────────────────────────────────────────────────────────────────

export type OutlierV2Signal =
  | "SILENT_ACCUMULATION"
  | "POST_DUMP_RECOVERY"
  | "NARRATIVE_EARLY"
  | "SMART_MONEY_CLUSTER"
  | "NONE";

export interface OutlierV2Result {
  signal:         OutlierV2Signal;
  confidence:     number;
  expectedReturn: number;
  reason:         string;
  evidence:       Record<string, any>;
}

// ─── Strategy 1: Silent Accumulation ─────────────────────────────────────────

export function checkSilentAccumulation(pair: any, holderGrowthPerMin: number): OutlierV2Result {
  const now        = Date.now();
  const ageMinutes = (now - pair.pairCreatedAt) / 1000 / 60;
  const priceUp    = pair.priceChange?.m5 ?? 0;
  const mcap       = pair.marketCap ?? pair.fdv ?? 0;

  const conditions = {
    correctAge:     ageMinutes >= 2 && ageMinutes <= 15,
    holdersGrowing: holderGrowthPerMin >= 5 && holderGrowthPerMin <= 30,
    notPumpedYet:   priceUp < 30,
    lowMcap:        mcap === 0 || mcap <= 150_000,
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

export function checkPostDumpRecovery(pair: any): OutlierV2Result {
  const now        = Date.now();
  const ageMinutes = (now - pair.pairCreatedAt) / 1000 / 60;
  const priceM5    = pair.priceChange?.m5  ?? 0;
  const priceH1    = pair.priceChange?.h1  ?? 0;
  const buys       = pair.txns?.m5?.buys   ?? 0;
  const sells      = pair.txns?.m5?.sells  ?? 0;
  const buySellRatio = sells > 0 ? buys / sells : buys;

  const conditions = {
    correctAge:      ageMinutes >= 60 && ageMinutes <= 180,
    droppedHard:     priceH1 <= -40 && priceH1 >= -80,
    floorStable:     priceM5 >= -5,
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

export function checkNarrativeEarly(
  currentPair: any,
  recentPairs: any[],
): OutlierV2Result {
  const currentName = (currentPair.baseToken.name + " " + currentPair.baseToken.symbol).toLowerCase();
  const keywords    = currentName.split(/\s+/).filter((w) => w.length > 3);

  let matchCount  = 0;
  let combinedVol = currentPair.volume?.m5 ?? 0;

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
// FIX: Uses correct Helius Enhanced Transactions API endpoint.

export async function checkSmartMoneyCluster(
  tokenAddress: string,
  supabase:     any,
): Promise<OutlierV2Result> {
  try {
    // Step 1: Get recent transaction signatures via Helius RPC
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.API_KEY}`;
    const sigRes = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id:      1,
        method:  "getSignaturesForAddress",
        params:  [tokenAddress, { limit: 20 }],
      },
      { timeout: 10000 }
    );

    const signatures: string[] = (sigRes.data?.result ?? []).map((s: any) => s.signature);
    if (signatures.length === 0) return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };

    // Step 2: Parse transactions via Enhanced API
    const txRes = await axios.post(
      `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.API_KEY}`,
      { transactions: signatures.slice(0, 20) },
      { timeout: 12000 }
    );

    const txs: any[] = txRes.data ?? [];
    const buyers = txs.map((tx: any) => tx.feePayer ?? tx.signers?.[0]).filter(Boolean);

    if (buyers.length === 0) return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };

    // Step 3: Check if any buyers are in our smart_wallets table
    const { data: smartWallets } = await supabase
      .from("smart_wallets")
      .select("address, label, win_rate")
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
        evidence:       { smartBuyers: smartBuyers.map((w: any) => ({ address: w.address, label: w.label })), avgWinRate },
      };
    }

    return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };
  } catch (err: any) {
    console.error("❌ Smart money check error:", err.message);
    return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };
  }
}

// ─── Main router ──────────────────────────────────────────────────────────────

export async function runOutlierV2(
  pair:              any,
  recentPairs:       any[],
  supabase:          any,
  holderGrowthPerMin = 0,
): Promise<OutlierV2Result> {
  const results: OutlierV2Result[] = [];

  results.push(checkSilentAccumulation(pair, holderGrowthPerMin));
  results.push(checkPostDumpRecovery(pair));
  results.push(checkNarrativeEarly(pair, recentPairs));
  results.push(await checkSmartMoneyCluster(pair.baseToken.address, supabase));

  const valid = results.filter((r) => r.signal !== "NONE");
  if (valid.length === 0) return { signal: "NONE", confidence: 0, expectedReturn: 0, reason: "", evidence: {} };

  return valid.reduce((best, curr) => curr.confidence > best.confidence ? curr : best);
}
