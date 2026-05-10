// src/services/scanner/onchain-scanner.ts
// Catalyst Apex Trader v2.2 — On-Chain Scanner (REFACTORED FOR RPC 429 FIX)
//
// Now uses centralized heliusRpc service instead of direct RPC calls.
// This prevents 429 rate limit errors through:
// - Request deduplication (in-flight tracking)
// - Smart caching (5-10 sec TTL)
// - Exponential backoff on 429
// - Multi-RPC failover
// - Rate limit awareness


import { HELIUS, FEATURE_FLAGS } from '../../core/config';
import { emit } from '../events/event-bus';
import { signalGateway } from '../gateway/signal-gateway';
import { heliusRpc } from './helius-rpc-service'; // ← USE NEW SERVICE
import { shouldProcessSignal } from '../intelligence/signal-dedup';
import { notifyRateLimit } from '../../core/rpc-throttle';

// ─── Types ────────────────────────────────────────────────────────────────

export interface OnChainSignal {
  tokenAddress: string;
  signalType:
    | 'NEW_POOL'
    | 'ACCUMULATION'
    | 'ORGANIC_DISCOVERY'
    | 'LIQUIDITY_GROWTH'
    | 'SURVIVAL'
    | 'PUMP_NEW_TOKEN'
    | 'PUMP_GRADUATING';
  confidence: number;
  poolCreatedAt: number;
  deployer: string;
  initialSolLiq: number;
  uniqueBuyers: number;
  repeatBuyers: number;
  avgBuySize: number;
  buyingVelocity: number;
  reason: string;
}

// ─── Program IDs ──────────────────────────────────────────────────────────

const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
const PUMP_FUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_MIGRATION = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// ─── Cache ────────────────────────────────────────────────────────────────

const processedPools = new Set<string>();
const processedPumps = new Set<string>();

// ─── RPC helpers (refactored to use heliusRpc service) ────────────────────

/**
 * Fetch program transactions (uses RPC service with caching)
 */
async function fetchProgramTransactions(programId: string, limit = 100): Promise<any[]> {
  try {
    // Now uses centralized RPC service with dedup/caching/backoff
    const signatures = await heliusRpc.getSignaturesForAddress(programId, limit);

    if (signatures.length === 0) return [];

    // Fetch enhanced transaction data
    const txs = await heliusRpc.fetchEnhancedTransactions(signatures);
    return txs;
  } catch (err: any) {
    console.error(`❌ Program TX fetch error (${programId.slice(0, 8)}...):`, err.message);
    return [];
  }
}

/**
 * Fetch token transactions (uses RPC service)
 */
async function fetchTokenTransactions(tokenAddress: string, limit = 50): Promise<any[]> {
  try {
    const signatures = await heliusRpc.getSignaturesForAddress(tokenAddress, limit);

    if (signatures.length === 0) return [];

    const txs = await heliusRpc.fetchEnhancedTransactions(signatures);

    return txs.filter((tx: any) => tx.type === 'SWAP' || tx.description?.toLowerCase().includes('swap'));
  } catch (err: any) {
    console.error(`❌ Token TX fetch error (${tokenAddress.slice(0, 8)}...):`, err.message);
    return [];
  }
}

// ─── Parse Raydium new pool ───────────────────────────────────────────────

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
    const initialSol = solTransfer ? Math.abs(Number(solTransfer.tokenAmount ?? 0)) / 1e9 : 0;

    if (initialSol < 2) return null;

    return {
      tokenAddress: tokenTransfer.mint,
      deployer: tx.feePayer ?? tx.signers?.[0] ?? '',
      poolCreatedAt: tx.timestamp ?? Math.floor(Date.now() / 1000),
      initialSol,
    };
  } catch {
    return null;
  }
}

// ─── Parse Pump.fun token creation ───────────────────────────────────────

function parsePumpFunToken(
  tx: any
): { tokenAddress: string; deployer: string; createdAt: number; initialSol: number } | null {
  try {
    const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) ?? [];
    const tokenTransfers: any[] = tx?.tokenTransfers ?? [];
    const instructions: any[] = tx?.instructions ?? [];

    const hasPump =
      accountKeys.includes(PUMP_FUN) ||
      instructions.some((ix: any) => ix.programId === PUMP_FUN);

    if (!hasPump) return null;

    const tokenTransfer = tokenTransfers.find((t: any) => t.mint && t.mint !== SOL_MINT);
    if (!tokenTransfer) return null;

    const nativeTransfers: any[] = tx?.nativeTransfers ?? [];
    const initialSol = nativeTransfers.reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0) / 1e9;

    return {
      tokenAddress: tokenTransfer.mint,
      deployer: tx.feePayer ?? tx.signers?.[0] ?? '',
      createdAt: tx.timestamp ?? Math.floor(Date.now() / 1000),
      initialSol: Math.abs(initialSol),
    };
  } catch {
    return null;
  }
}

// ─── Parse Pump.fun graduation (→ Raydium) ────────────────────────────────

function parsePumpGraduation(
  tx: any
): { tokenAddress: string; deployer: string; createdAt: number } | null {
  try {
    const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) ?? [];
    const tokenTransfers: any[] = tx?.tokenTransfers ?? [];

    if (!accountKeys.includes(PUMP_MIGRATION) && !accountKeys.includes(RAYDIUM_AMM)) return null;

    const tokenTransfer = tokenTransfers.find((t: any) => t.mint && t.mint !== SOL_MINT);
    if (!tokenTransfer) return null;

    return {
      tokenAddress: tokenTransfer.mint,
      deployer: tx.feePayer ?? tx.signers?.[0] ?? '',
      createdAt: tx.timestamp ?? Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

// ─── Buyer analysis ───────────────────────────────────────────────────────

interface BuyerAnalysis {
  uniqueBuyers: number;
  repeatBuyers: number;
  avgBuySize: number;
  buyingVelocity: number;
  isAccumulation: boolean;
  isOrganic: boolean;
}

function analyzeBuyers(txs: any[], poolCreatedAt: number): BuyerAnalysis {
  const buyerMap = new Map<string, number>();
  let totalSol = 0;
  let buyCount = 0;

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

  const uniqueBuyers = buyerMap.size;
  const repeatBuyers = Array.from(buyerMap.values()).filter((c) => c > 1).length;
  const avgBuySize = buyCount > 0 ? totalSol / buyCount : 0;
  const ageMinutes = (Date.now() / 1000 - poolCreatedAt) / 60;
  const buyingVelocity = ageMinutes > 0 ? buyCount / ageMinutes : 0;

  const isAccumulation = uniqueBuyers >= 5 && repeatBuyers / Math.max(uniqueBuyers, 1) >= 0.2;

  const isOrganic =
    uniqueBuyers >= 10 &&
    repeatBuyers / Math.max(uniqueBuyers, 1) < 0.3 &&
    buyingVelocity >= 0.5 &&
    buyingVelocity <= 10;

  return { uniqueBuyers, repeatBuyers, avgBuySize, buyingVelocity, isAccumulation, isOrganic };
}

// ─── Liquidity growth check ───────────────────────────────────────────────

async function checkLiquidityGrowth(
  tokenAddress: string
): Promise<{ growing: boolean; addCount: number }> {
  try {
    // Uses RPC service caching - won't duplicate requests
    const signatures = await heliusRpc.getSignaturesForAddress(tokenAddress, 5);

    if (signatures.length === 0) return { growing: false, addCount: 0 };

    const txs = await heliusRpc.fetchEnhancedTransactions(signatures);

    const addLiqTxs = txs.filter(
      (tx: any) => tx.type === 'ADD_LIQUIDITY' || tx.description?.toLowerCase().includes('add liquidity')
    );

    return { growing: addLiqTxs.length >= 2, addCount: addLiqTxs.length };
  } catch {
    return { growing: false, addCount: 0 };
  }
}

// ─── Raydium scanner ──────────────────────────────────────────────────────

async function scanRaydium(): Promise<OnChainSignal[]> {
  const signals: OnChainSignal[] = [];

  const raydiumTxs = await fetchProgramTransactions(RAYDIUM_AMM, 10);
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

    const gatewayDecision = await signalGateway.shouldAnalyze({
      address: pool.tokenAddress,
      mint: pool.tokenAddress,
      name: 'Unknown',
      symbol: 'UNK',
      liquidity: { usd: pool.initialSol * 200, depth: pool.initialSol * 100 },
      deployer: pool.deployer,
      createdAt: pool.poolCreatedAt,
      volume: { m5: 0, h1: 0 },
      buys: { m5: 0 },
      sells: { m5: 0 },
    });

    if (gatewayDecision.passed) {
      await emit({
        type: 'TOKEN_DETECTED',
        token: pool.tokenAddress,
        mint: pool.tokenAddress,
        name: 'Unknown',
        symbol: 'UNK',
        timestamp: Date.now(),
        source: 'raydium',
      });
    }
  }

  console.log(`   🆕 Raydium: ${newPools.length} new pools`);

  for (const pool of newPools) {
    // RPC service caching prevents duplicate calls to same pool
    const txs = await fetchTokenTransactions(pool.tokenAddress, 10);
    const buyers = analyzeBuyers(txs, pool.poolCreatedAt);
    const liqGrowth = await checkLiquidityGrowth(pool.tokenAddress);
    const ageMinutes = (Date.now() / 1000 - pool.poolCreatedAt) / 60;

    if (buyers.uniqueBuyers >= 5 && buyers.buyingVelocity >= 0.3) {
      signals.push({
        tokenAddress: pool.tokenAddress,
        signalType: 'NEW_POOL',
        confidence: Math.min(100, buyers.uniqueBuyers * 5 + 30),
        poolCreatedAt: pool.poolCreatedAt,
        deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers,
        repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `New Raydium pool (${ageMinutes.toFixed(0)}m) — ${buyers.uniqueBuyers} buyers, ${buyers.buyingVelocity.toFixed(2)} buys/min, ${pool.initialSol.toFixed(2)} SOL`,
      });
      continue;
    }

    if (buyers.isAccumulation) {
      signals.push({
        tokenAddress: pool.tokenAddress,
        signalType: 'ACCUMULATION',
        confidence: Math.min(100, buyers.repeatBuyers * 15 + 40),
        poolCreatedAt: pool.poolCreatedAt,
        deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers,
        repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Accumulation — ${buyers.repeatBuyers} wallets buying repeatedly, avg ${buyers.avgBuySize.toFixed(3)} SOL`,
      });
      continue;
    }

    if (buyers.isOrganic) {
      signals.push({
        tokenAddress: pool.tokenAddress,
        signalType: 'ORGANIC_DISCOVERY',
        confidence: Math.min(100, buyers.uniqueBuyers * 4 + 20),
        poolCreatedAt: pool.poolCreatedAt,
        deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers,
        repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Organic — ${buyers.uniqueBuyers} unique wallets at ${buyers.buyingVelocity.toFixed(2)} buys/min`,
      });
      continue;
    }

    if (liqGrowth.growing) {
      await emit({
        type: 'LIQUIDITY_SPIKE',
        token: pool.tokenAddress,
        liquidityBefore: pool.initialSol,
        liquidityAfter: pool.initialSol * (1 + liqGrowth.addCount * 0.1),
        percentChange: liqGrowth.addCount * 10,
        timestamp: Date.now(),
      });

      signals.push({
        tokenAddress: pool.tokenAddress,
        signalType: 'LIQUIDITY_GROWTH',
        confidence: Math.min(100, liqGrowth.addCount * 20 + 30),
        poolCreatedAt: pool.poolCreatedAt,
        deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers,
        repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Liquidity growing — ${liqGrowth.addCount} LP additions`,
      });
      continue;
    }

    if (ageMinutes >= 60 && buyers.uniqueBuyers >= 3 && buyers.buyingVelocity >= 0.1) {
      signals.push({
        tokenAddress: pool.tokenAddress,
        signalType: 'SURVIVAL',
        confidence: Math.min(100, Math.floor(ageMinutes / 60) * 10 + 30),
        poolCreatedAt: pool.poolCreatedAt,
        deployer: pool.deployer,
        initialSolLiq: pool.initialSol,
        uniqueBuyers: buyers.uniqueBuyers,
        repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize,
        buyingVelocity: buyers.buyingVelocity,
        reason: `Survival — ${(ageMinutes / 60).toFixed(1)}h old, still getting ${buyers.uniqueBuyers} buyers`,
      });
    }
  }

  return signals;
}

export interface SignalJob {
  signature: string;
  program: 'raydium' | 'pumpfun' | 'pump_migration';
  timestamp: number;
}

export async function enrichTransaction(signature: string): Promise<any | null> {
  try {
    const txs = await heliusRpc.fetchEnhancedTransactions([signature]);
    if (!Array.isArray(txs) || txs.length === 0) return null;
    return txs[0];
  } catch (err: any) {
    if (err?.message?.includes('429')) {
      notifyRateLimit();
    }
    console.error(`[RPC] Enrichment failed for ${signature.slice(0, 8)}...`, err?.message ?? err);
    return null;
  }
}

export async function processSignalJob(job: SignalJob): Promise<void> {
  const { signature, program } = job;

  if (!(await shouldProcessSignal(signature))) {
    return;
  }

  try {
    const tx = await enrichTransaction(signature);
    if (!tx) {
      console.warn(`[SignalJob] No transaction data for ${signature}`);
      return;
    }

    if (program === 'raydium') {
      const pool = parseRaydiumPool(tx);
      if (!pool) {
        console.warn(`[SignalJob] ${signature} did not parse as a Raydium pool`);
        return;
      }

      if (processedPools.has(pool.tokenAddress)) {
        console.log(`[SignalJob] Raydium pool already processed: ${pool.tokenAddress}`);
        return;
      }

      const ageHours = (Date.now() / 1000 - pool.poolCreatedAt) / 3600;
      if (ageHours > 6) {
        console.log(
          `[SignalJob] Skipping stale Raydium pool ${pool.tokenAddress} (${ageHours.toFixed(1)}h old)`
        );
        return;
      }

      processedPools.add(pool.tokenAddress);

      const gatewayDecision = await signalGateway.shouldAnalyze({
        address: pool.tokenAddress,
        mint: pool.tokenAddress,
        name: 'Unknown',
        symbol: 'UNK',
        liquidity: { usd: pool.initialSol * 200, depth: pool.initialSol * 100 },
        deployer: pool.deployer,
        createdAt: pool.poolCreatedAt,
        volume: { m5: 0, h1: 0 },
        buys: { m5: 0 },
        sells: { m5: 0 },
      });

      if (gatewayDecision.passed) {
        await emit({
          type: 'TOKEN_DETECTED',
          token: pool.tokenAddress,
          mint: pool.tokenAddress,
          name: 'Unknown',
          symbol: 'UNK',
          timestamp: Date.now(),
          source: 'raydium',
        });
      }

      const tokenTxs = await fetchTokenTransactions(pool.tokenAddress, 10);
      const buyers = analyzeBuyers(tokenTxs, pool.poolCreatedAt);
      const liqGrowth = await checkLiquidityGrowth(pool.tokenAddress);
      const ageMinutes = (Date.now() / 1000 - pool.poolCreatedAt) / 60;

      if (buyers.uniqueBuyers >= 5 && buyers.buyingVelocity >= 0.3) {
        console.log(
          `[SignalJob] Raydium new pool ${pool.tokenAddress} — ${buyers.uniqueBuyers} buyers, ${buyers.buyingVelocity.toFixed(2)} buys/min, ${pool.initialSol.toFixed(2)} SOL`
        );
        return;
      }

      if (buyers.isAccumulation) {
        console.log(
          `[SignalJob] Accumulation detected for ${pool.tokenAddress} — ${buyers.repeatBuyers} repeat buyers, avg ${buyers.avgBuySize.toFixed(3)} SOL`
        );
        return;
      }

      if (buyers.isOrganic) {
        console.log(
          `[SignalJob] Organic discovery for ${pool.tokenAddress} — ${buyers.uniqueBuyers} unique buyers at ${buyers.buyingVelocity.toFixed(2)} buys/min`
        );
        return;
      }

      if (liqGrowth.growing) {
        await emit({
          type: 'LIQUIDITY_SPIKE',
          token: pool.tokenAddress,
          liquidityBefore: pool.initialSol,
          liquidityAfter: pool.initialSol * (1 + liqGrowth.addCount * 0.1),
          percentChange: liqGrowth.addCount * 10,
          timestamp: Date.now(),
        });

        console.log(
          `[SignalJob] Liquidity growth for ${pool.tokenAddress} — ${liqGrowth.addCount} LP additions`
        );
        return;
      }

      if (ageMinutes >= 60 && buyers.uniqueBuyers >= 3 && buyers.buyingVelocity >= 0.1) {
        console.log(
          `[SignalJob] Survival signal for ${pool.tokenAddress} — ${(ageMinutes / 60).toFixed(1)}h old, ${buyers.uniqueBuyers} buyers`
        );
      }

      return;
    }

    if (program === 'pumpfun') {
      const pumpToken = parsePumpFunToken(tx);
      if (pumpToken && !processedPumps.has(pumpToken.tokenAddress)) {
        const ageMinutes = (Date.now() / 1000 - pumpToken.createdAt) / 60;
        if (ageMinutes <= 30) {
          processedPumps.add(pumpToken.tokenAddress);

          const gatewayDecision = await signalGateway.shouldAnalyze({
            address: pumpToken.tokenAddress,
            mint: pumpToken.tokenAddress,
            name: 'Unknown',
            symbol: 'UNK',
            liquidity: { usd: pumpToken.initialSol * 200, depth: pumpToken.initialSol * 100 },
            deployer: pumpToken.deployer,
            createdAt: pumpToken.createdAt,
            volume: { m5: 0, h1: 0 },
            buys: { m5: 0 },
            sells: { m5: 0 },
          });

          if (gatewayDecision.passed) {
            await emit({
              type: 'TOKEN_DETECTED',
              token: pumpToken.tokenAddress,
              mint: pumpToken.tokenAddress,
              name: 'Unknown',
              symbol: 'UNK',
              timestamp: Date.now(),
              source: 'pumpfun',
            });
          }

          const tokenTxs = await fetchTokenTransactions(pumpToken.tokenAddress, 10);
          const buyers = analyzeBuyers(tokenTxs, pumpToken.createdAt);

          if (buyers.uniqueBuyers >= 10 && buyers.buyingVelocity >= 1.0) {
            console.log(
              `[SignalJob] Pump.fun new token ${pumpToken.tokenAddress} — ${buyers.uniqueBuyers} buyers at ${buyers.buyingVelocity.toFixed(2)} buys/min`
            );
          }

          return;
        }
      }

      return;
    }

    if (program === 'pump_migration') {
      const grad = parsePumpGraduation(tx);
      if (grad && !processedPumps.has(`grad_${grad.tokenAddress}`)) {
        processedPumps.add(`grad_${grad.tokenAddress}`);
        console.log(
          `[SignalJob] Pump.fun graduation detected for ${grad.tokenAddress}`
        );
      }

      return;
    }

    console.warn(`[SignalJob] Unknown program type: ${program} for ${signature}`);
  } catch (err: any) {
    if (err?.message?.includes('429')) {
      notifyRateLimit();
    }
    console.error(`[SignalJob] failed for ${signature}:`, err?.message ?? err);
    throw err;
  }
}

// ─── Pump.fun scanner ─────────────────────────────────────────────────────

async function scanPumpFun(): Promise<OnChainSignal[]> {
  const signals: OnChainSignal[] = [];

  // Sequential requests to reduce Helius rate limit pressure
  const pumpTxs = await fetchProgramTransactions(PUMP_FUN, 10);
  await sleep(1000); // Wait between calls
  const migrationTxs = await fetchProgramTransactions(PUMP_MIGRATION, 5);

  console.log(`   🎪 Pump.fun: ${pumpTxs.length} txs | Graduations: ${migrationTxs.length} txs`);

  // ── New Pump.fun tokens ───────────────────────────────────────────────────
  const newPumpTokens: { tokenAddress: string; deployer: string; createdAt: number; initialSol: number }[] = [];

  for (const tx of pumpTxs) {
    const token = parsePumpFunToken(tx);
    if (!token) continue;
    if (processedPumps.has(token.tokenAddress)) continue;

    const ageMinutes = (Date.now() / 1000 - token.createdAt) / 60;
    if (ageMinutes > 30) continue;

    newPumpTokens.push(token);
    processedPumps.add(token.tokenAddress);

    const gatewayDecision = await signalGateway.shouldAnalyze({
      address: token.tokenAddress,
      mint: token.tokenAddress,
      name: 'Unknown',
      symbol: 'UNK',
      liquidity: { usd: token.initialSol * 200, depth: token.initialSol * 100 },
      deployer: token.deployer,
      createdAt: token.createdAt,
      volume: { m5: 0, h1: 0 },
      buys: { m5: 0 },
      sells: { m5: 0 },
    });

    if (gatewayDecision.passed) {
      await emit({
        type: 'TOKEN_DETECTED',
        token: token.tokenAddress,
        mint: token.tokenAddress,
        name: 'Unknown',
        symbol: 'UNK',
        timestamp: Date.now(),
        source: 'pumpfun',
      });
    }
  }

  for (const token of newPumpTokens) {
    const txs = await fetchTokenTransactions(token.tokenAddress, 10);
    const buyers = analyzeBuyers(txs, token.createdAt);
    const ageMinutes = (Date.now() / 1000 - token.createdAt) / 60;

    if (buyers.uniqueBuyers >= 10 && buyers.buyingVelocity >= 1.0) {
      signals.push({
        tokenAddress: token.tokenAddress,
        signalType: 'PUMP_NEW_TOKEN',
        confidence: Math.min(100, buyers.uniqueBuyers * 4 + buyers.buyingVelocity * 5),
        poolCreatedAt: token.createdAt,
        deployer: token.deployer,
        initialSolLiq: token.initialSol,
        uniqueBuyers: buyers.uniqueBuyers,
        repeatBuyers: buyers.repeatBuyers,
        avgBuySize: buyers.avgBuySize,
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

    signals.push({
      tokenAddress: grad.tokenAddress,
      signalType: 'PUMP_GRADUATING',
      confidence: 85,
      poolCreatedAt: grad.createdAt,
      deployer: grad.deployer,
      initialSolLiq: 85,
      uniqueBuyers: 0,
      repeatBuyers: 0,
      avgBuySize: 0,
      buyingVelocity: 0,
      reason: `Pump.fun graduation — bonding curve filled, migrating to Raydium now`,
    });
  }

  return signals;
}

// ─── Main scanner ─────────────────────────────────────────────────────────

export async function scanOnChain(): Promise<OnChainSignal[]> {
  console.log(`⛓️  On-chain scan: Raydium${FEATURE_FLAGS.usePumpFunScanner ? ' + Pump.fun' : ''}...`);
  console.log(`   [RPC] ${heliusRpc.getStatus().inFlightRequests} in-flight, cache: ${heliusRpc.getStatus().cacheSize} entries`);

  const signals: OnChainSignal[] = [];

  // Scan Raydium first
  const raydiumSignals = await scanRaydium();
  signals.push(...raydiumSignals);

  // Wait before next scan
  await sleep(5000);

  // Then Pump.fun
  if (FEATURE_FLAGS.usePumpFunScanner) {
    const pumpSignals = await scanPumpFun();
    signals.push(...pumpSignals);
  }

  console.log(`   🎯 ${signals.length} on-chain signals detected`);
  console.log(`   [RPC] Status: ${JSON.stringify(heliusRpc.getStatus())}`);

  return signals;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Cache cleanup ────────────────────────────────────────────────────────

export function cleanProcessedPools(): void {
  if (processedPools.size > 1000) {
    const arr = Array.from(processedPools);
    arr.slice(0, 500).forEach((p) => processedPools.delete(p));
  }
  if (processedPumps.size > 2000) {
    const arr = Array.from(processedPumps);
    arr.slice(0, 1000).forEach((p) => processedPumps.delete(p));
  }

  // Periodic RPC cache cleanup (optional)
  heliusRpc.clearCache();
}