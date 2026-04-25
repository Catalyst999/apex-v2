// src/services/scanner/onchain-scanner.ts
// Catalyst Apex Trader v2.2 — On-Chain Scanner
//
// Watches the blockchain for pre-trend signals using Helius RPC.
// Two sources run in parallel when Pump.fun scanner is enabled:
//   1. Raydium AMM — established DEX pools
//   2. Pump.fun    — where 90%+ of new Solana memecoins launch
//
// Signals detected:
//   NEW_POOL          — fresh pool with early healthy activity
//   ACCUMULATION      — same wallets buying repeatedly
//   ORGANIC_DISCOVERY — many unique wallets, steady velocity
//   LIQUIDITY_GROWTH  — SOL being added to pool over time
//   SURVIVAL          — token still active after the dump window
//   PUMP_NEW_TOKEN    — brand new Pump.fun token with momentum
//   PUMP_GRADUATING   — Pump.fun token nearing graduation to Raydium

import axios from "axios";
import { HELIUS, FEATURE_FLAGS } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnChainSignal {
  tokenAddress:    string;
  signalType:      "NEW_POOL" | "ACCUMULATION" | "ORGANIC_DISCOVERY" | "LIQUIDITY_GROWTH" | "SURVIVAL" | "PUMP_NEW_TOKEN" | "PUMP_GRADUATING";
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

// ─── Program IDs ──────────────────────────────────────────────────────────────

const RAYDIUM_AMM    = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_CLMM   = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
const PUMP_FUN       = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";   // Pump.fun program
const PUMP_MIGRATION = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"; // Pump.fun → Raydium graduation
const SOL_MINT       = "So11111111111111111111111111111111111111112";

// ─── Helius endpoints ─────────────────────────────────────────────────────────

const HELIUS_RPC      = () => `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`;
const HELIUS_ENHANCED = () => `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`;

// ─── Cache ────────────────────────────────────────────────────────────────────

const processedPools  = new Set<string>();
const processedPumps  = new Set<string>();

// ─── RPC helpers ──────────────────────────────────────────────────────────────

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
    return (res.data?.result ?? []).map((r: any) => r.signature).filter(Boolean);
  } catch (err: any) {
    console.error(`❌ getSignaturesForAddress error (${address.slice(0, 8)}...):`, err.message);
    return [];
  }
}

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

// ─── Fetch recent transactions for a program ──────────────────────────────────

async function fetchProgramTransactions(programId: string, limit = 100): Promise<any[]> {
  try {
    const signatures = await getSignaturesForAddress(programId, limit);
    if (signatures.length === 0) return [];
    return await fetchEnhancedTransactions(signatures);
  } catch (err: any) {
    console.error(`❌ Program TX fetch error (${programId.slice(0, 8)}...):`, err.message);
    return [];
  }
}

async function fetchTokenTransactions(tokenAddress: string, limit = 50): Promise<any[]> {
  try {
    const signatures = await getSignaturesForAddress(tokenAddress, limit);
    if (signatures.length === 0) return [];
    const txs = await fetchEnhancedTransactions(signatures);
    return txs.filter(
      (tx: any) => tx.type === "SWAP" || tx.description?.toLowerCase().includes("swap")
    );
  } catch (err: any) {
    console.error(`❌ Token TX fetch error (${tokenAddress.slice(0, 8)}...):`, err.message);
    return [];
  }
}

// ─── Parse Raydium new pool ───────────────────────────────────────────────────

function parseRaydiumPool(
  tx: any
): { tokenAddress: string; deployer: string; poolCreatedAt: number; initialSol: number } | null {
  try {
    const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) ?? [];
    const tokenTransfers: any[] = tx?.tokenTransfers ?? [];

    if (!accountKeys.includes(RAYDIUM_AMM) && !accountKeys.includes(RAYDIUM_CLMM)) return null;

    const tokenTransfer = tokenTransfers.find((t: any) => t.mint && t.mint !== SOL_MINT);
    if (!tokenTransfer) return null;

    const solTransfer = tokenTransfers.find((t: any) => t.mint === SOL_MINT);
    const initialSol  = solTransfer ? Math.abs(Number(solTransfer.tokenAmount ?? 0)) / 1e9 : 0;

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

// ─── Parse Pump.fun token creation ───────────────────────────────────────────

function parsePumpFunToken(
  tx: any
): { tokenAddress: string; deployer: string; createdAt: number; initialSol: number } | null {
  try {
    const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) ?? [];
    const tokenTransfers: any[] = tx?.tokenTransfers ?? [];
    const instructions: any[]   = tx?.instructions ?? [];

    // Must involve Pump.fun program
    const hasPump =
      accountKeys.includes(PUMP_FUN) ||
      instructions.some((ix: any) => ix.programId === PUMP_FUN);

    if (!hasPump) return null;

    // Find the new token
    const tokenTransfer = tokenTransfers.find((t: any) => t.mint && t.mint !== SOL_MINT);
    if (!tokenTransfer) return null;

    // Get initial SOL (bonding curve seed)
    const nativeTransfers: any[] = tx?.nativeTransfers ?? [];
    const initialSol = nativeTransfers.reduce(
      (sum: number, t: any) => sum + (t.amount ?? 0),
      0
    ) / 1e9;

    return {
      tokenAddress: tokenTransfer.mint,
      deployer:     tx.feePayer ?? tx.signers?.[0] ?? "",
      createdAt:    tx.timestamp ?? Math.floor(Date.now() / 1000),
      initialSol:   Math.abs(initialSol),
    };
  } catch {
    return null;
  }
}

// ─── Parse Pump.fun graduation (→ Raydium) ────────────────────────────────────

function parsePumpGraduation(
  tx: any
): { tokenAddress: string; deployer: string; createdAt: number } | null {
  try {
    const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) ?? [];
    const tokenTransfers: any[] = tx?.tokenTransfers ?? [];

    // Must be a migration transaction
    if (!accountKeys.includes(PUMP_MIGRATION) && !accountKeys.includes(RAYDIUM_AMM)) return null;

    const tokenTransfer = tokenTransfers.find((t: any) => t.mint && t.mint !== SOL_MINT);
    if (!tokenTransfer) return null;

    return {
      tokenAddress: tokenTransfer.mint,
      deployer:     tx.feePayer ?? tx.signers?.[0] ?? "",
      createdAt:    tx.timestamp ?? Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

// ─── Buyer analysis ───────────────────────────────────────────────────────────

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

// ─── Liquidity growth check ───────────────────────────────────────────────────

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

// ─── Raydium scanner ──────────────────────────────────────────────────────────

async function scanRaydium(): Promise<OnChainSignal[]> {
  const signals: OnChainSignal[] = [];

  const raydiumTxs = await fetchProgramTransactions(RAYDIUM_AMM, 100);
  console.log(`   📦 Raydium: ${raydiumTxs.length} recent transactions`);

  const newPools: { tokenAddress: string; deployer: string; poolCreatedAt: number; initialSol: number }[] = [];

  for (const tx of raydiumTxs) {
    const pool = parseRaydiumPool(tx);
    if (!pool) continue;
    if (processedPools.has(pool.tokenAddress)) continue;

    const ageHours = (Date.now() / 1000 - pool.poolCreatedAt) / 3600;
    if (ageHours > 6) continue;

    newPools.push(pool);
    processedPools.add(pool.tokenAddress);
  }

  console.log(`   🆕 Raydium: ${newPools.length} new pools`);

  for (const pool of newPools) {
    const txs       = await fetchTokenTransactions(pool.tokenAddress, 50);
    const buyers    = analyzeBuyers(txs, pool.poolCreatedAt);
    const liqGrowth = await checkLiquidityGrowth(pool.tokenAddress);
    const ageMinutes = (Date.now() / 1000 - pool.poolCreatedAt) / 60;

    if (buyers.uniqueBuyers >= 5 && buyers.buyingVelocity >= 0.3) {
      signals.push({
        tokenAddress: pool.tokenAddress, signalType: "NEW_POOL",
        confidence: Math.min(100, buyers.uniqueBuyers * 5 + 30),
        poolCreatedAt: pool.poolCreatedAt, deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers, repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize, buyingVelocity: buyers.buyingVelocity,
        reason: `New Raydium pool (${ageMinutes.toFixed(0)}m) — ${buyers.uniqueBuyers} buyers, ${buyers.buyingVelocity.toFixed(2)} buys/min, ${pool.initialSol.toFixed(2)} SOL`,
      });
      continue;
    }
    if (buyers.isAccumulation) {
      signals.push({
        tokenAddress: pool.tokenAddress, signalType: "ACCUMULATION",
        confidence: Math.min(100, buyers.repeatBuyers * 15 + 40),
        poolCreatedAt: pool.poolCreatedAt, deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers, repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize, buyingVelocity: buyers.buyingVelocity,
        reason: `Accumulation — ${buyers.repeatBuyers} wallets buying repeatedly, avg ${buyers.avgBuySize.toFixed(3)} SOL`,
      });
      continue;
    }
    if (buyers.isOrganic) {
      signals.push({
        tokenAddress: pool.tokenAddress, signalType: "ORGANIC_DISCOVERY",
        confidence: Math.min(100, buyers.uniqueBuyers * 4 + 20),
        poolCreatedAt: pool.poolCreatedAt, deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers, repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize, buyingVelocity: buyers.buyingVelocity,
        reason: `Organic — ${buyers.uniqueBuyers} unique wallets at ${buyers.buyingVelocity.toFixed(2)} buys/min`,
      });
      continue;
    }
    if (liqGrowth.growing) {
      signals.push({
        tokenAddress: pool.tokenAddress, signalType: "LIQUIDITY_GROWTH",
        confidence: Math.min(100, liqGrowth.addCount * 20 + 30),
        poolCreatedAt: pool.poolCreatedAt, deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers, repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize, buyingVelocity: buyers.buyingVelocity,
        reason: `Liquidity growing — ${liqGrowth.addCount} LP additions`,
      });
      continue;
    }
    if (ageMinutes >= 60 && buyers.uniqueBuyers >= 3 && buyers.buyingVelocity >= 0.1) {
      signals.push({
        tokenAddress: pool.tokenAddress, signalType: "SURVIVAL",
        confidence: Math.min(100, Math.floor(ageMinutes / 60) * 10 + 30),
        poolCreatedAt: pool.poolCreatedAt, deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers, repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize, buyingVelocity: buyers.buyingVelocity,
        reason: `Survival — ${(ageMinutes / 60).toFixed(1)}h old, still getting ${buyers.uniqueBuyers} buyers`,
      });
    }
  }

  return signals;
}

// ─── Pump.fun scanner ─────────────────────────────────────────────────────────

async function scanPumpFun(): Promise<OnChainSignal[]> {
  const signals: OnChainSignal[] = [];

  // Fetch both new token creations and graduation events in parallel
  const [pumpTxs, migrationTxs] = await Promise.all([
    fetchProgramTransactions(PUMP_FUN, 100),
    fetchProgramTransactions(PUMP_MIGRATION, 50),
  ]);

  console.log(`   🎪 Pump.fun: ${pumpTxs.length} txs | Graduations: ${migrationTxs.length} txs`);

  // ── New Pump.fun tokens ───────────────────────────────────────────────────
  const newPumpTokens: { tokenAddress: string; deployer: string; createdAt: number; initialSol: number }[] = [];

  for (const tx of pumpTxs) {
    const token = parsePumpFunToken(tx);
    if (!token) continue;
    if (processedPumps.has(token.tokenAddress)) continue;

    const ageMinutes = (Date.now() / 1000 - token.createdAt) / 60;
    if (ageMinutes > 30) continue; // Only look at tokens < 30 min old

    newPumpTokens.push(token);
    processedPumps.add(token.tokenAddress);
  }

  for (const token of newPumpTokens) {
    const txs    = await fetchTokenTransactions(token.tokenAddress, 30);
    const buyers = analyzeBuyers(txs, token.createdAt);
    const ageMinutes = (Date.now() / 1000 - token.createdAt) / 60;

    // Only signal if there's genuine organic activity
    if (buyers.uniqueBuyers >= 10 && buyers.buyingVelocity >= 1.0) {
      signals.push({
        tokenAddress:  token.tokenAddress,
        signalType:    "PUMP_NEW_TOKEN",
        confidence:    Math.min(100, buyers.uniqueBuyers * 4 + buyers.buyingVelocity * 5),
        poolCreatedAt: token.createdAt,
        deployer:      token.deployer,
        initialSolLiq: token.initialSol,
        uniqueBuyers:  buyers.uniqueBuyers,
        repeatBuyers:  buyers.repeatBuyers,
        avgBuySize:    buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Pump.fun new token (${ageMinutes.toFixed(0)}m) — ${buyers.uniqueBuyers} buyers at ${buyers.buyingVelocity.toFixed(2)} buys/min`,
      });
    }
  }

  // ── Graduating tokens (Pump → Raydium) ────────────────────────────────────
  for (const tx of migrationTxs) {
    const grad = parsePumpGraduation(tx);
    if (!grad) continue;
    if (processedPumps.has(`grad_${grad.tokenAddress}`)) continue;

    processedPumps.add(`grad_${grad.tokenAddress}`);

    // A graduation means the bonding curve filled — very bullish signal
    signals.push({
      tokenAddress:  grad.tokenAddress,
      signalType:    "PUMP_GRADUATING",
      confidence:    85, // Graduation is a strong signal by definition
      poolCreatedAt: grad.createdAt,
      deployer:      grad.deployer,
      initialSolLiq: 85, // Pump.fun requires ~85 SOL to graduate
      uniqueBuyers:  0,
      repeatBuyers:  0,
      avgBuySize:    0,
      buyingVelocity: 0,
      reason:        `Pump.fun graduation — bonding curve filled, migrating to Raydium now`,
    });
  }

  return signals;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanOnChain(): Promise<OnChainSignal[]> {
  console.log(`⛓️  On-chain scan: Raydium${FEATURE_FLAGS.usePumpFunScanner ? " + Pump.fun" : ""}...`);

  const scanners: Promise<OnChainSignal[]>[] = [scanRaydium()];

  if (FEATURE_FLAGS.usePumpFunScanner) {
    scanners.push(scanPumpFun());
  }

  const results = await Promise.all(scanners);
  const signals = results.flat();

  console.log(`   🎯 ${signals.length} on-chain signals detected`);
  return signals;
}

// ─── Clean up caches ──────────────────────────────────────────────────────────

export function cleanProcessedPools(): void {
  if (processedPools.size > 1000) {
    const arr = [...processedPools];
    arr.slice(0, 500).forEach((p) => processedPools.delete(p));
  }
  if (processedPumps.size > 2000) {
    const arr = [...processedPumps];
    arr.slice(0, 1000).forEach((p) => processedPumps.delete(p));
  }
}