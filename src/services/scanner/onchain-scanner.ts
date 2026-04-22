// src/services/scanner/onchain-scanner.ts
// Catalyst Apex Trader v2.1 — On-Chain Scanner
//
// Uses Helius to watch the blockchain directly.
// Catches tokens BEFORE they trend using signals invisible to DexScreener:
//
// Signal 1 — New pool detection (Raydium LP creation)
// Signal 2 — Accumulation pattern (same wallets buying repeatedly)
// Signal 3 — Organic discovery (new wallets finding the token)
// Signal 4 — Liquidity growth (SOL being added to pool)
// Signal 5 — Survival signal (token still active after dump window)

import axios from "axios";
import { HELIUS } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnChainSignal {
  tokenAddress:    string;
  signalType:      "NEW_POOL" | "ACCUMULATION" | "ORGANIC_DISCOVERY" | "LIQUIDITY_GROWTH" | "SURVIVAL";
  confidence:      number;       // 0-100
  poolCreatedAt:   number;       // unix seconds
  deployer:        string;
  initialSolLiq:   number;       // SOL in pool at creation
  uniqueBuyers:    number;       // unique wallets that bought
  repeatBuyers:    number;       // wallets that bought more than once
  avgBuySize:      number;       // average SOL per buy
  buyingVelocity:  number;       // buys per minute
  reason:          string;
}

// ─── Raydium program IDs ──────────────────────────────────────────────────────

const RAYDIUM_AMM  = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_CLMM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
const SOL_MINT     = "So11111111111111111111111111111111111111112";

// ─── Cache to avoid reprocessing ─────────────────────────────────────────────

const processedPools  = new Set<string>();
const tokenSignalCache = new Map<string, OnChainSignal>();

// ─── Fetch recent Raydium transactions ───────────────────────────────────────

async function fetchRaydiumTransactions(limit = 100): Promise<any[]> {
  try {
    const res = await axios.get(
      `https://api.helius.xyz/v0/addresses/${RAYDIUM_AMM}/transactions`,
      {
        params: {
          "api-key": HELIUS.apiKey,
          limit,
          type: "Any",
        },
        timeout: 12000,
      }
    );
    return res.data ?? [];
  } catch (err: any) {
    console.error("❌ Helius Raydium fetch error:", err.message);
    return [];
  }
}

// ─── Fetch token transaction history ─────────────────────────────────────────

async function fetchTokenTransactions(tokenAddress: string, limit = 50): Promise<any[]> {
  try {
    const res = await axios.get(
      `https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions`,
      {
        params: {
          "api-key": HELIUS.apiKey,
          limit,
          type: "SWAP",
        },
        timeout: 10000,
      }
    );
    return res.data ?? [];
  } catch (err: any) {
    console.error(`❌ Token tx fetch error for ${tokenAddress}:`, err.message);
    return [];
  }
}

// ─── Parse new pool from transaction ─────────────────────────────────────────

function parseNewPool(tx: any): { tokenAddress: string; deployer: string; poolCreatedAt: number; initialSol: number } | null {
  try {
    const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) ?? [];
    const tokenTransfers: any[] = tx?.tokenTransfers ?? [];

    // Must involve Raydium
    if (!accountKeys.includes(RAYDIUM_AMM) && !accountKeys.includes(RAYDIUM_CLMM)) return null;

    // Find the new token (not SOL)
    const tokenTransfer = tokenTransfers.find(
      (t: any) => t.mint && t.mint !== SOL_MINT
    );
    if (!tokenTransfer) return null;

    // Calculate initial SOL
    const solTransfer = tokenTransfers.find((t: any) => t.mint === SOL_MINT);
    const initialSol  = solTransfer
      ? Math.abs(Number(solTransfer.tokenAmount ?? 0)) / 1e9
      : 0;

    // Minimum 2 SOL initial liquidity
    if (initialSol < 2) return null;

    return {
      tokenAddress: tokenTransfer.mint,
      deployer:     tx.feePayer ?? tx.signers?.[0] ?? "",
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
  buyingVelocity: number;  // buys per minute
  isAccumulation: boolean;
  isOrganic:      boolean;
}

function analyzeBuyers(txs: any[], poolCreatedAt: number): BuyerAnalysis {
  const buyerMap = new Map<string, number>(); // wallet -> buy count
  let totalSol   = 0;
  let buyCount   = 0;

  for (const tx of txs) {
    const buyer    = tx.feePayer ?? tx.signers?.[0];
    if (!buyer) continue;

    // Count SOL spent
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

  const uniqueBuyers  = buyerMap.size;
  const repeatBuyers  = [...buyerMap.values()].filter((c) => c > 1).length;
  const avgBuySize    = buyCount > 0 ? totalSol / buyCount : 0;

  // Age of pool in minutes
  const ageMinutes = (Date.now() / 1000 - poolCreatedAt) / 60;
  const buyingVelocity = ageMinutes > 0 ? buyCount / ageMinutes : 0;

  // Accumulation: repeat buyers > 20% of unique buyers
  const isAccumulation = uniqueBuyers >= 5 &&
                         repeatBuyers / Math.max(uniqueBuyers, 1) >= 0.2;

  // Organic discovery: many unique buyers, few repeats, steady velocity
  const isOrganic = uniqueBuyers >= 10 &&
                    repeatBuyers / Math.max(uniqueBuyers, 1) < 0.3 &&
                    buyingVelocity >= 0.5 &&
                    buyingVelocity <= 10; // not bot-like speed

  return { uniqueBuyers, repeatBuyers, avgBuySize, buyingVelocity, isAccumulation, isOrganic };
}

// ─── Check liquidity growth ───────────────────────────────────────────────────

async function checkLiquidityGrowth(tokenAddress: string): Promise<{ growing: boolean; addCount: number }> {
  try {
    const res = await axios.get(
      `https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions`,
      {
        params: {
          "api-key": HELIUS.apiKey,
          limit:     20,
          type:      "ADD_LIQUIDITY",
        },
        timeout: 8000,
      }
    );
    const txs: any[] = res.data ?? [];
    return {
      growing:  txs.length >= 2,
      addCount: txs.length,
    };
  } catch {
    return { growing: false, addCount: 0 };
  }
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanOnChain(): Promise<OnChainSignal[]> {
  const signals: OnChainSignal[] = [];

  console.log(`⛓️  On-chain scan: watching Raydium for pre-trend signals...`);

  // Step 1: Get recent Raydium activity
  const raydiumTxs = await fetchRaydiumTransactions(100);
  console.log(`   📦 ${raydiumTxs.length} recent Raydium transactions`);

  // Step 2: Extract new pools
  const newPools: { tokenAddress: string; deployer: string; poolCreatedAt: number; initialSol: number }[] = [];

  for (const tx of raydiumTxs) {
    const pool = parseNewPool(tx);
    if (!pool) continue;
    if (processedPools.has(pool.tokenAddress)) continue;

    // Only look at pools created in last 6 hours
    const ageHours = (Date.now() / 1000 - pool.poolCreatedAt) / 3600;
    if (ageHours > 6) continue;

    newPools.push(pool);
    processedPools.add(pool.tokenAddress);
  }

  console.log(`   🆕 ${newPools.length} new pools found`);

  // Step 3: Analyze each new pool
  for (const pool of newPools) {
    // Get buyer history
    const txs    = await fetchTokenTransactions(pool.tokenAddress, 50);
    const buyers = analyzeBuyers(txs, pool.poolCreatedAt);

    // Get liquidity growth
    const liqGrowth = await checkLiquidityGrowth(pool.tokenAddress);

    const ageMinutes = (Date.now() / 1000 - pool.poolCreatedAt) / 60;

    // ── Signal: NEW POOL with healthy initial activity ─────────────────────
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
        reason:         `New pool (${ageMinutes.toFixed(0)}m old) — ${buyers.uniqueBuyers} unique buyers, ${buyers.buyingVelocity.toFixed(2)} buys/min, ${pool.initialSol.toFixed(2)} SOL liquidity`,
      });
      continue;
    }

    // ── Signal: ACCUMULATION pattern ───────────────────────────────────────
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
        reason:         `Accumulation pattern — ${buyers.repeatBuyers} wallets bought multiple times, avg ${buyers.avgBuySize.toFixed(3)} SOL/buy`,
      });
      continue;
    }

    // ── Signal: ORGANIC DISCOVERY ──────────────────────────────────────────
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
        reason:         `Organic discovery — ${buyers.uniqueBuyers} unique wallets finding this token naturally at ${buyers.buyingVelocity.toFixed(2)} buys/min`,
      });
      continue;
    }

    // ── Signal: LIQUIDITY GROWTH ───────────────────────────────────────────
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
        reason:         `Liquidity growing — ${liqGrowth.addCount} LP additions, community adding trust`,
      });
      continue;
    }

    // ── Signal: SURVIVAL (token still active after dump window) ───────────
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
        reason:         `Survival signal — ${(ageMinutes / 60).toFixed(1)}h old, still getting ${buyers.uniqueBuyers} buyers, not dead`,
      });
    }
  }

  console.log(`   🎯 ${signals.length} on-chain signals detected`);
  return signals;
}

// ─── Clean up old processed pools (prevent memory leak) ──────────────────────

export function cleanProcessedPools(): void {
  if (processedPools.size > 1000) {
    const arr = [...processedPools];
    arr.slice(0, 500).forEach((p) => processedPools.delete(p));
  }
}