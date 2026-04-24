// src/services/scanner/onchain-scanner.ts
// Catalyst Apex Trader v2.2 — On-Chain Scanner
//
// Uses Helius to watch the blockchain directly.
// Catches tokens BEFORE they trend using signals invisible to DexScreener:
//
// Signal 1 — New pool detection (Raydium LP creation)
// Signal 2 — Accumulation pattern (same wallets buying repeatedly)
// Signal 3 — Organic discovery (new wallets finding the token)
// Signal 4 — Liquidity growth (SOL being added to pool)
// Signal 5 — Survival signal (token still active after dump window)
//
// FIX: api.helius.xyz/v0/addresses/{addr}/transactions is deprecated (404).
// Now uses:
//   getSignaturesForAddress  via Helius RPC  (mainnet.helius-rpc.com)
//   Enhanced Transactions    via api.helius.xyz/v0/transactions/

import axios from "axios";
import { HELIUS } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnChainSignal {
  tokenAddress:    string;
  signalType:      "NEW_POOL" | "ACCUMULATION" | "ORGANIC_DISCOVERY" | "LIQUIDITY_GROWTH" | "SURVIVAL";
  confidence:      number;
  poolCreatedAt:   number;
  deployer:        string;
  initialSolLiq:   number;
  uniqueBuyers:    number;
  repeatBuyers:    number;
  avgBuySize:      number;
  buyingVelocity:  number;
  reason:          string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RAYDIUM_AMM  = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_CLMM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
const SOL_MINT     = "So11111111111111111111111111111111111111112";

// Correct Helius endpoints (2025)
const HELIUS_RPC      = () => `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`;
const HELIUS_ENHANCED = () => `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`;

// ─── Cache ────────────────────────────────────────────────────────────────────

const processedPools   = new Set<string>();
const tokenSignalCache = new Map<string, OnChainSignal>();

// ─── RPC: getSignaturesForAddress ─────────────────────────────────────────────

async function getSignaturesForAddress(address: string, limit = 100): Promise<string[]> {
  try {
    const res = await axios.post(
      HELIUS_RPC(),
      {
        jsonrpc: "2.0",
        id:      1,
        method:  "getSignaturesForAddress",
        params:  [address, { limit, commitment: "confirmed" }],
      },
      { timeout: 12000 }
    );
    const result = res.data?.result ?? [];
    return result.map((r: any) => r.signature).filter(Boolean);
  } catch (err: any) {
    console.error(`❌ getSignaturesForAddress error (${address.slice(0, 8)}...):`, err.message);
    return [];
  }
}

// ─── Enhanced TX batch lookup ─────────────────────────────────────────────────

async function fetchEnhancedTransactions(signatures: string[]): Promise<any[]> {
  if (signatures.length === 0) return [];
  try {
    const res = await axios.post(
      HELIUS_ENHANCED(),
      { transactions: signatures.slice(0, 100) },
      { timeout: 15000 }
    );
    return res.data ?? [];
  } catch (err: any) {
    console.error("❌ Helius Enhanced TX error:", err.message);
    return [];
  }
}

// ─── Fetch recent Raydium transactions ────────────────────────────────────────

async function fetchRaydiumTransactions(limit = 100): Promise<any[]> {
  try {
    const signatures = await getSignaturesForAddress(RAYDIUM_AMM, limit);
    if (signatures.length === 0) return [];
    console.log(`   🔍 Got ${signatures.length} Raydium signatures, fetching enhanced data...`);
    return await fetchEnhancedTransactions(signatures);
  } catch (err: any) {
    console.error("❌ Helius Raydium fetch error:", err.message);
    return [];
  }
}

// ─── Fetch token transaction history ─────────────────────────────────────────

async function fetchTokenTransactions(tokenAddress: string, limit = 50): Promise<any[]> {
  try {
    const signatures = await getSignaturesForAddress(tokenAddress, limit);
    if (signatures.length === 0) return [];
    const txs = await fetchEnhancedTransactions(signatures);
    return txs.filter(
      (tx: any) => tx.type === "SWAP" || tx.description?.toLowerCase().includes("swap")
    );
  } catch (err: any) {
    console.error(`❌ Token tx fetch error for ${tokenAddress.slice(0, 8)}...:`, err.message);
    return [];
  }
}

// ─── Parse new pool from transaction ─────────────────────────────────────────

function parseNewPool(
  tx: any
): { tokenAddress: string; deployer: string; poolCreatedAt: number; initialSol: number } | null {
  try {
    const accountKeys: string[]    = tx?.accountData?.map((a: any) => a.account) ?? [];
    const tokenTransfers: any[]    = tx?.tokenTransfers ?? [];

    if (!accountKeys.includes(RAYDIUM_AMM) && !accountKeys.includes(RAYDIUM_CLMM)) return null;

    const tokenTransfer = tokenTransfers.find((t: any) => t.mint && t.mint !== SOL_MINT);
    if (!tokenTransfer) return null;

    const solTransfer = tokenTransfers.find((t: any) => t.mint === SOL_MINT);
    const initialSol  = solTransfer
      ? Math.abs(Number(solTransfer.tokenAmount ?? 0)) / 1e9
      : 0;

    if (initialSol < 2) return null;

    return {
      tokenAddress:  tokenTransfer.mint,
      deployer:      tx.feePayer ?? tx.signers?.[0] ?? "",
      poolCreatedAt: tx.timestamp ?? Math.floor(Date.now() / 1000),
      initialSol,
    };
  } catch {
    return null;
  }
}

// ─── Analyze buyer behavior ───────────────────────────────────────────────────

interface BuyerAnalysis {
  uniqueBuyers:   number;
  repeatBuyers:   number;
  avgBuySize:     number;
  buyingVelocity: number;
  isAccumulation: boolean;
  isOrganic:      boolean;
}

function analyzeBuyers(txs: any[], poolCreatedAt: number): BuyerAnalysis {
  const buyerMap = new Map<string, number>();
  let totalSol   = 0;
  let buyCount   = 0;

  for (const tx of txs) {
    const buyer = tx.feePayer ?? tx.signers?.[0];
    if (!buyer) continue;

    const nativeTransfers: any[] = tx.nativeTransfers ?? [];
    const solSpent = nativeTransfers
      .filter((t: any) => t.fromUserAccount === buyer)
      .reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0) / 1e9;

    if (solSpent > 0) {
      buyerMap.set(buyer, (buyerMap.get(buyer) ?? 0) + 1);
      totalSol += solSpent;
      buyCount++;
    }
  }

  const uniqueBuyers   = buyerMap.size;
  const repeatBuyers   = [...buyerMap.values()].filter((c) => c > 1).length;
  const avgBuySize     = buyCount > 0 ? totalSol / buyCount : 0;
  const ageMinutes     = (Date.now() / 1000 - poolCreatedAt) / 60;
  const buyingVelocity = ageMinutes > 0 ? buyCount / ageMinutes : 0;

  const isAccumulation = uniqueBuyers >= 5 &&
                         repeatBuyers / Math.max(uniqueBuyers, 1) >= 0.2;

  const isOrganic = uniqueBuyers >= 10 &&
                    repeatBuyers / Math.max(uniqueBuyers, 1) < 0.3 &&
                    buyingVelocity >= 0.5 &&
                    buyingVelocity <= 10;

  return { uniqueBuyers, repeatBuyers, avgBuySize, buyingVelocity, isAccumulation, isOrganic };
}

// ─── Check liquidity growth ───────────────────────────────────────────────────

async function checkLiquidityGrowth(
  tokenAddress: string
): Promise<{ growing: boolean; addCount: number }> {
  try {
    const signatures = await getSignaturesForAddress(tokenAddress, 20);
    if (signatures.length === 0) return { growing: false, addCount: 0 };
    const txs = await fetchEnhancedTransactions(signatures);
    const addLiqTxs = txs.filter(
      (tx: any) =>
        tx.type === "ADD_LIQUIDITY" ||
        tx.description?.toLowerCase().includes("add liquidity")
    );
    return { growing: addLiqTxs.length >= 2, addCount: addLiqTxs.length };
  } catch {
    return { growing: false, addCount: 0 };
  }
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanOnChain(): Promise<OnChainSignal[]> {
  const signals: OnChainSignal[] = [];

  console.log(`⛓️  On-chain scan: watching Raydium for pre-trend signals...`);

  const raydiumTxs = await fetchRaydiumTransactions(100);
  console.log(`   📦 ${raydiumTxs.length} recent Raydium transactions`);

  if (raydiumTxs.length === 0) {
    console.log(`   ⚠️  No Raydium data — check HELIUS_API_KEY env var`);
    return signals;
  }

  const newPools: {
    tokenAddress:  string;
    deployer:      string;
    poolCreatedAt: number;
    initialSol:    number;
  }[] = [];

  for (const tx of raydiumTxs) {
    const pool = parseNewPool(tx);
    if (!pool) continue;
    if (processedPools.has(pool.tokenAddress)) continue;

    const ageHours = (Date.now() / 1000 - pool.poolCreatedAt) / 3600;
    if (ageHours > 6) continue;

    newPools.push(pool);
    processedPools.add(pool.tokenAddress);
  }

  console.log(`   🆕 ${newPools.length} new pools found`);

  for (const pool of newPools) {
    const txs       = await fetchTokenTransactions(pool.tokenAddress, 50);
    const buyers    = analyzeBuyers(txs, pool.poolCreatedAt);
    const liqGrowth = await checkLiquidityGrowth(pool.tokenAddress);
    const ageMinutes = (Date.now() / 1000 - pool.poolCreatedAt) / 60;

    // Signal: NEW POOL
    if (buyers.uniqueBuyers >= 5 && buyers.buyingVelocity >= 0.3) {
      signals.push({
        tokenAddress:   pool.tokenAddress,
        signalType:     "NEW_POOL",
        confidence:     Math.min(100, buyers.uniqueBuyers * 5 + 30),
        poolCreatedAt:  pool.poolCreatedAt,
        deployer:       pool.deployer,
        initialSolLiq:  pool.initialSol,
        uniqueBuyers:   buyers.uniqueBuyers,
        repeatBuyers:   buyers.repeatBuyers,
        avgBuySize:     buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `New pool (${ageMinutes.toFixed(0)}m old) — ${buyers.uniqueBuyers} unique buyers, ${buyers.buyingVelocity.toFixed(2)} buys/min, ${pool.initialSol.toFixed(2)} SOL liquidity`,
      });
      continue;
    }

    // Signal: ACCUMULATION
    if (buyers.isAccumulation) {
      signals.push({
        tokenAddress:   pool.tokenAddress,
        signalType:     "ACCUMULATION",
        confidence:     Math.min(100, buyers.repeatBuyers * 15 + 40),
        poolCreatedAt:  pool.poolCreatedAt,
        deployer:       pool.deployer,
        initialSolLiq:  pool.initialSol,
        uniqueBuyers:   buyers.uniqueBuyers,
        repeatBuyers:   buyers.repeatBuyers,
        avgBuySize:     buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Accumulation pattern — ${buyers.repeatBuyers} wallets bought multiple times, avg ${buyers.avgBuySize.toFixed(3)} SOL/buy`,
      });
      continue;
    }

    // Signal: ORGANIC DISCOVERY
    if (buyers.isOrganic) {
      signals.push({
        tokenAddress:   pool.tokenAddress,
        signalType:     "ORGANIC_DISCOVERY",
        confidence:     Math.min(100, buyers.uniqueBuyers * 4 + 20),
        poolCreatedAt:  pool.poolCreatedAt,
        deployer:       pool.deployer,
        initialSolLiq:  pool.initialSol,
        uniqueBuyers:   buyers.uniqueBuyers,
        repeatBuyers:   buyers.repeatBuyers,
        avgBuySize:     buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Organic discovery — ${buyers.uniqueBuyers} unique wallets finding this token naturally at ${buyers.buyingVelocity.toFixed(2)} buys/min`,
      });
      continue;
    }

    // Signal: LIQUIDITY GROWTH
    if (liqGrowth.growing) {
      signals.push({
        tokenAddress:   pool.tokenAddress,
        signalType:     "LIQUIDITY_GROWTH",
        confidence:     Math.min(100, liqGrowth.addCount * 20 + 30),
        poolCreatedAt:  pool.poolCreatedAt,
        deployer:       pool.deployer,
        initialSolLiq:  pool.initialSol,
        uniqueBuyers:   buyers.uniqueBuyers,
        repeatBuyers:   buyers.repeatBuyers,
        avgBuySize:     buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Liquidity growing — ${liqGrowth.addCount} LP additions, community adding trust`,
      });
      continue;
    }

    // Signal: SURVIVAL
    if (ageMinutes >= 60 && buyers.uniqueBuyers >= 3 && buyers.buyingVelocity >= 0.1) {
      signals.push({
        tokenAddress:   pool.tokenAddress,
        signalType:     "SURVIVAL",
        confidence:     Math.min(100, Math.floor(ageMinutes / 60) * 10 + 30),
        poolCreatedAt:  pool.poolCreatedAt,
        deployer:       pool.deployer,
        initialSolLiq:  pool.initialSol,
        uniqueBuyers:   buyers.uniqueBuyers,
        repeatBuyers:   buyers.repeatBuyers,
        avgBuySize:     buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Survival signal — ${(ageMinutes / 60).toFixed(1)}h old, still getting ${buyers.uniqueBuyers} buyers, not dead`,
      });
    }
  }

  console.log(`   🎯 ${signals.length} on-chain signals detected`);
  return signals;
}

// ─── Clean old processed pools ────────────────────────────────────────────────

export function cleanProcessedPools(): void {
  if (processedPools.size > 1000) {
    const arr = [...processedPools];
    arr.slice(0, 500).forEach((p) => processedPools.delete(p));
  }
}