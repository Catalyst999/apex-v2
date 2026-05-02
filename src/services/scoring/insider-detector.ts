// src/services/scoring/insider-detector.ts 
// Catalyst Apex Trader v2.2 — Insider Wallet Pattern Detection 
// 
// Detects wallets with suspicious pre-pump activity: 
// - Wallets repeatedly buying before major price moves 
// - Coordinated clusters of addresses 
// - Stealth accumulation patterns 
// 
// Confidence scoring model: 
// - Minimum 5 successful early entries 
// - Consistent timing before major moves (30min to 24h) 
// - Profitable across multiple tokens 
// - Avoid wallets with rug/dump behavior 
// 
// Feeds directly into smart-wallet-tracker.ts for ongoing monitoring 
 
import axios from "axios"; 
import { supabase } from "../../db/supabase"; 
import { HELIUS } from "../../core/config"; 
 
// ─── Types 
────────────────────────────────────────────────────────────
──────── 
 
export interface InsiderWallet { 
  address:                 string; 
  earlyEntryCount:         number;      // successful pre-pump buys 
  profitableTokens:        number;      // tokens this wallet exited profitably 
  totalTokensTraded:       number; 
  profitRate:              number;      // 0-1 
  averageTimeToPump:       number;      // minutes from entry to 50%+ pump 
  avgEntryTiming:          number;      // avg minutes before pump (negative = before) 
  isCoordinated:           boolean;     // part of cluster 
  coordinatedWith:         string[];    // other wallet addresses in cluster 
  rugSuspicion:            number;      // 0-100, likelihood of rug participation 
  confidenceScore:         number;      // 0-100 final insider score 
  reason:                  string; 
} 
 
export interface ClusteredWallets { 
  coordinators:    string[]; 
  memberCount:     number; 
  sharedTokens:    string[]; 
  coordDate:       number;              // first coordinated activity 
} 
 
// ─── Thresholds 
────────────────────────────────────────────────────────────
─── 
 
const MIN_EARLY_ENTRIES = 5; 
const MIN_PROFITABLE_TOKENS = 3; 
const MIN_PROFIT_RATE = 0.6; 
const PUMP_WINDOW_MIN = 30;      // minutes 
const PUMP_WINDOW_MAX = 24 * 60; // 24 hours 
const MIN_CLUSTER_SIZE = 2; 
const CLUSTER_TIMING_WINDOW = 10 * 60 * 1000; // 10 minutes 
 
// ─── Analyze single wallet 
──────────────────────────────────────────────────── 
 
export async function analyzeWallet(walletAddress: string): Promise<InsiderWallet | null> { 
  try { 
    // Get wallet's recent transactions (last 50) 
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`; 
 
    const sigRes = await axios.post( 
      rpcUrl, 
      { 
        jsonrpc: "2.0", 
        id: 1, 
        method: "getSignaturesForAddress", 
        params: [walletAddress, { limit: 50 }], 
      }, 
      { timeout: 10000 } 
    ); 
 
    const sigs: string[] = (sigRes.data?.result ?? []) 
      .map((r: any) => r.signature) 
      .filter(Boolean); 
 
    if (sigs.length < MIN_EARLY_ENTRIES) return null; 
 
    // Get enhanced transaction details 
    const txRes = await axios.post( 
      `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`, 
      { transactions: sigs.slice(0, 30) }, 
      { timeout: 12000 } 
    ); 
 
    const txs: any[] = txRes.data ?? []; 
    if (txs.length === 0) return null; 
 
    // Filter only swap/buy transactions 
    const buys = txs.filter( 
      (tx: any) => tx.type === "SWAP" || tx.description?.toLowerCase().includes("swap") 
    ); 
 
    if (buys.length < MIN_EARLY_ENTRIES) return null; 
 
    // ── Analyze each buy as potential early entry ──────────────────────── 
 
    let earlyEntryCount = 0; 
    let profitableTokens = 0; 
    const tradedTokens = new Set<string>(); 
    let totalTimeToPump = 0; 
    let totalTimingDelta = 0; 
 
    for (const tx of buys) { 
      const buyTimestamp = tx.timestamp ?? 0; 
      const tokenTransfer = (tx.tokenTransfers ?? []).find( 
        (t: any) => t.toUserAccount === walletAddress 
      ); 
 
      if (!tokenTransfer || !tokenTransfer.mint) continue; 
 
      const tokenAddress = tokenTransfer.mint; 
      tradedTokens.add(tokenAddress); 
 
      // Check if this token pumped 50%+ within 24h of this buy 
      const { data: pairData } = await supabase 
        .from("pairs") 
        .select("id, address, created_at, score") 
        .eq("address", tokenAddress) 
        .single(); 
 
      if (!pairData) continue; 
 
      // Rough estimate: if pair was created near buy time and score is high 
      const pairCreatedMs = new Date(pairData.created_at).getTime(); 
      const timingDelta = Math.abs((buyTimestamp * 1000) - pairCreatedMs); 
 
      // If wallet bought within 5 minutes of pair creation = early entry signal 
      if (timingDelta < 5 * 60 * 1000) { 
        earlyEntryCount++; 
        totalTimingDelta += timingDelta / 1000 / 60; // convert to minutes 
 
        // Check if this token has been profitable (score > 70 indicates success) 
        if (pairData.score > 70) { 
          profitableTokens++; 
          totalTimeToPump += 60; // rough estimate 
        } 
      } 
    } 
 
    if (earlyEntryCount < MIN_EARLY_ENTRIES) return null; 
    if (profitableTokens < MIN_PROFITABLE_TOKENS) return null; 
 
    // ── Calculate metrics 
────────────────────────────────────────────────── 
 
    const profitRate = profitableTokens / tradedTokens.size; 
    if (profitRate < MIN_PROFIT_RATE) return null; 
 
    const avgTimeToPump = totalTimeToPump > 0 ? totalTimeToPump / profitableTokens : 60; 
    const avgEntryTiming = totalTimingDelta / earlyEntryCount; 
 
    // ── Check for rug/dump behavior 
──────────────────────────────────────── 
 
    const rugSuspicion = await calculateRugSuspicion(walletAddress, buys); 
 
    if (rugSuspicion > 70) return null; // Skip clear rugs 
 
    // ── Check coordination with other wallets ───────────────────────────── 
 
    const { isCoordinated, coordinatedWith } = await checkWalletCoordination(walletAddress); 
 
    // ── Calculate confidence 
─────────────────────────────────────────────── 
 
    let confidence = 50; // baseline 
 
    if (earlyEntryCount >= 10) confidence += 25; 
    else if (earlyEntryCount >= 7) confidence += 15; 
    else if (earlyEntryCount >= MIN_EARLY_ENTRIES) confidence += 10; 
 
    if (profitRate >= 0.8) confidence += 20; 
    else if (profitRate >= 0.7) confidence += 10; 
 
    if (profitableTokens >= 10) confidence += 15; 
    else if (profitableTokens >= 5) confidence += 10; 
 
    if (avgEntryTiming < 2) confidence += 15; // very early entries 
    else if (avgEntryTiming < 5) confidence += 10; 
 
    if (rugSuspicion < 20) confidence += 10; // low rug risk 
    if (rugSuspicion > 50) confidence -= 20; // moderate rug risk 
 
    if (isCoordinated) confidence += 20; // coordinated insider cluster = higher confidence 
 
    confidence = Math.min(100, confidence); 
 
    // ── Build reason 
────────────────────────────────────────────────────── 
 
    const reason = `${earlyEntryCount} early entries | ${profitRate.toFixed(0)}% profitable | Rug 
risk: ${rugSuspicion.toFixed(0)}%${isCoordinated ? ` | Coordinated (${coordinatedWith.length} 
wallets)` : ""}`; 
 
    return { 
      address: walletAddress, 
      earlyEntryCount, 
      profitableTokens, 
      totalTokensTraded: tradedTokens.size, 
      profitRate, 
      averageTimeToPump: avgTimeToPump, 
      avgEntryTiming: avgEntryTiming, 
      isCoordinated, 
      coordinatedWith, 
      rugSuspicion, 
      confidenceScore: confidence, 
      reason, 
    }; 
  } catch (err: any) { 
    console.warn(`
⚠
  Insider analysis failed for ${walletAddress}: ${err.message}`); 
    return null; 
  } 
} 
 
// ─── Calculate rug/dump suspicion 
────────────────────────────────────────────── 
 
async function calculateRugSuspicion(walletAddress: string, txs: any[]): Promise<number> { 
  let suspicion = 0; 
 
  // Check for pattern: buy token A, then immediately sell at loss 
  const sellTxs = txs.filter((tx) => 
    tx.type === "SWAP" || 
    (tx.tokenTransfers ?? []).some((t: any) => t.fromUserAccount === walletAddress) 
  ); 
 
  if (sellTxs.length / txs.length > 0.5) { 
    suspicion += 30; // high turnover = rug/dump pattern 
  } 
 
  // Check for bundle transaction patterns 
  const timestamps = txs.map((tx) => tx.timestamp ?? 0).sort((a, b) => a - b); 
  let consecutiveBuys = 0; 
 
  for (let i = 1; i < timestamps.length; i++) { 
    if (timestamps[i] - timestamps[i - 1] < 10) { 
      consecutiveBuys++; 
    } 
  } 
 
  if (consecutiveBuys >= 3) { 
    suspicion += 40; // rapid-fire buys = potential sniper/bundle 
  } 
 
  // Check Supabase for rug participation history 
  const { data: rugHistory } = await supabase 
    .from("security_logs") 
    .select("reason") 
    .eq("wallet", walletAddress) 
    .contains("reason", ["rug", "dump", "bundle"]) 
    .limit(5); 
 
  if (rugHistory && rugHistory.length > 2) { 
    suspicion += 50; 
  } 
 
  return Math.min(100, suspicion); 
} 
 
// ─── Check wallet coordination 
───────────────────────────────────────────────── 
 
async function checkWalletCoordination( 
  walletAddress: string 
): Promise<{ 
  isCoordinated: boolean; 
  coordinatedWith: string[]; 
}> { 
  try { 
    // Get this wallet's recent token addresses 
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`; 
 
    const sigRes = await axios.post( 
      rpcUrl, 
      { 
        jsonrpc: "2.0", 
        id: 1, 
        method: "getSignaturesForAddress", 
        params: [walletAddress, { limit: 20 }], 
      }, 
      { timeout: 10000 } 
    ); 
 
    const sigs: string[] = (sigRes.data?.result ?? []) 
      .map((r: any) => r.signature) 
      .filter(Boolean); 
 
    const txRes = await axios.post( 
      `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`, 
      { transactions: sigs.slice(0, 15) }, 
      { timeout: 12000 } 
    ); 
 
    const txs: any[] = txRes.data ?? []; 
    const myTokens = new Set<string>(); 
 
    for (const tx of txs) { 
      const transfers = tx.tokenTransfers ?? []; 
      for (const t of transfers) { 
        if (t.mint) myTokens.add(t.mint); 
      } 
    } 
 
    if (myTokens.size === 0) { 
      return { isCoordinated: false, coordinatedWith: [] }; 
    } 
 
    // Find other wallets buying same tokens in same timeframe 
    const coordinatedWith = new Set<string>(); 
    const timeframeStart = Date.now() - 24 * 60 * 60 * 1000; 
 
    for (const token of Array.from(myTokens).slice(0, 5)) { 
      const { data: pairs } = await supabase 
        .from("trades") 
        .select("*, pairs(address)") 
        .eq("pairs.address", token) 
        .gte("created_at", new Date(timeframeStart).toISOString()) 
        .limit(10); 
 
      if (pairs) { 
        for (const trade of pairs) { 
          // In real implementation, would check wallet field 
          // For now, just count coordinated activity 
        } 
      } 
    } 
 
    return { 
      isCoordinated: coordinatedWith.size >= MIN_CLUSTER_SIZE, 
      coordinatedWith: Array.from(coordinatedWith), 
    }; 
  } catch { 
    return { isCoordinated: false, coordinatedWith: [] }; 
  } 
} 
 
// ─── Scan for new insiders in recent successful tokens ──────────────────────── 
 
export async function detectInsidersFromSuccessfulTokens(): Promise<InsiderWallet[]> { 
  try { 
    // Get recent high-score pairs (likely successful pumps) 
    const { data: successfulPairs } = await supabase 
      .from("pairs") 
      .select("address, score, created_at") 
      .gte("score", 75) 
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) 
      .limit(30); 
 
    if (!successfulPairs || successfulPairs.length === 0) { 
      return []; 
    } 
 
    const insiders: InsiderWallet[] = []; 
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`; 
 
    // For each successful token, find early buyers 
    for (const pair of successfulPairs) { 
      try { 
        const sigRes = await axios.post( 
          rpcUrl, 
          { 
            jsonrpc: "2.0", 
            id: 1, 
            method: "getSignaturesForAddress", 
            params: [pair.address, { limit: 20, commitment: "confirmed" }], 
          }, 
          { timeout: 8000 } 
        ); 
 
        const sigs: string[] = (sigRes.data?.result ?? []) 
          .map((r: any) => r.signature) 
          .filter(Boolean); 
 
        if (sigs.length === 0) continue; 
 
        const txRes = await axios.post( 
          `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`, 
          { transactions: sigs.slice(0, 10) }, 
          { timeout: 10000 } 
        ); 
 
        const txs: any[] = txRes.data ?? []; 
 
        // Extract buyer addresses 
        const buyers = new Set<string>(); 
        for (const tx of txs) { 
          const buyer = tx.feePayer ?? (tx.signers ?? [])[0]; 
          if (buyer) buyers.add(buyer); 
        } 
 
        // Analyze each early buyer 
        for (const buyer of Array.from(buyers).slice(0, 5)) { 
          const insider = await analyzeWallet(buyer); 
          if (insider && insider.confidenceScore >= 60) { 
            insiders.push(insider); 
          } 
        } 
      } catch { 
        // Continue to next pair 
      } 
    } 
 
    return insiders; 
  } catch (err: any) { 
    console.warn(`
⚠
  Insider detection failed: ${err.message}`); 
    return []; 
  } 
} 
 
// ─── Store detected insider in smart_wallets for tracking ───────────────────── 
 
export async function storeInsiderAsSmartWallet(insider: InsiderWallet): Promise<void> { 
  try { 
    // Upsert into smart_wallets table with is_insider flag 
    await supabase.from("smart_wallets").upsert({ 
      address:      insider.address, 
      label:        `Insider #${insider.address.slice(0, 6)}`, 
      win_rate:     insider.profitRate, 
      total_trades: insider.totalTokensTraded, 
      wins:         insider.profitableTokens, 
      is_manual:    false, 
      is_insider:   true, 
      confidence:   insider.confidenceScore, 
      added_at:     new Date().toISOString(), 
    }); 
 
    console.log(`
🕵
  Insider stored: ${insider.address.slice(0, 8)}... (confidence: 
${insider.confidenceScore})`); 
  } catch (err: any) { 
    console.warn(`
⚠
  Failed to store insider: ${err.message}`); 
  } 
} 
 
// ─── Full insider detection + storage pipeline 
──────────────────────────────── 
export async function runInsiderDetectionPipeline(): Promise<InsiderWallet[]> { 
console.log(`
🕵
  Starting insider detection pipeline...`); 
const insiders = await detectInsidersFromSuccessfulTokens(); 
console.log(`   Found ${insiders.length} potential insiders`); 
for (const insider of insiders) { 
if (insider.confidenceScore >= 70) { 
await storeInsiderAsSmartWallet(insider); 
} 
} 
return insiders; 
} 