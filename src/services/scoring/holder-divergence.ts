// src/services/scoring/holder-divergence.ts
// Catalyst Apex Trader v2.1 — Holder/Price Divergence Detector
//
// From the playbook (provable metric #1):
// "When you see a dip but holder count is increasing, that's a bullish confirmation."
//
// This is one of the strongest on-chain signals available:
// Price dipping + holders rising = conviction buyers accumulating = likely bounce.
// Price rising + holders falling = distribution = likely dump incoming.
//
// We track this as a score modifier in the pipeline.

import axios    from "axios";
import { HELIUS } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DivergenceType =
  | "BULLISH"           // price dipping, holders rising — BUY signal
  | "STRONG_BULLISH"    // price dumping hard, holders accelerating — rare gem signal
  | "BEARISH"           // price rising, holders falling — distribution warning
  | "NEUTRAL"           // both moving in same direction or flat
  | "INSUFFICIENT_DATA";

export interface HolderDivergenceResult {
  type:             DivergenceType;
  confidenceBoost:  number;    // positive = add to score, negative = subtract
  priceChangePct:   number;    // recent price change %
  holderChange:     number;    // estimated holder change (positive = growing)
  holderVelocity:   number;    // holders/minute
  reason:           string;
  isAccumulation:   boolean;   // true = strong hands buying the dip
}

// ─── Holder data fetcher ──────────────────────────────────────────────────────
// Pulls holder count from multiple sources with fallback.

async function fetchHolderCount(tokenAddress: string): Promise<number> {
  try {
    // Try DexScreener first (already in pair data — use that path)
    // Try Helius as fallback
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`;
    const res = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id:      1,
        method:  "getTokenAccountsByMint",
        params:  [
          tokenAddress,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
        ],
      },
      { timeout: 8000 }
    );

    // getTokenAccountsByMint returns all token accounts — count = holders
    return (res.data?.result?.value ?? []).length;
  } catch {
    return 0;
  }
}

// ─── Holder velocity from recent transactions ─────────────────────────────────
// Estimates how fast new wallets are entering by counting unique buyers in recent txns.

async function estimateHolderVelocity(tokenAddress: string): Promise<{
  velocity: number;      // new holders per minute
  netChange: number;     // estimated net holder change
}> {
  try {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`;
    const sigRes = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id:      1,
        method:  "getSignaturesForAddress",
        params:  [tokenAddress, { limit: 50 }],
      },
      { timeout: 8000 }
    );

    const signatures: any[] = sigRes.data?.result ?? [];
    if (signatures.length < 2) return { velocity: 0, netChange: 0 };

    // Parse enhanced transactions
    const txRes = await axios.post(
      `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`,
      { transactions: signatures.slice(0, 20).map((s: any) => s.signature) },
      { timeout: 10000 }
    );

    const txs: any[] = txRes.data ?? [];
    if (txs.length < 2) return { velocity: 0, netChange: 0 };

    // Time window from first to last tx
    const timestamps  = txs.map((tx: any) => tx.timestamp as number).filter(Boolean).sort();
    const windowSecs  = timestamps[timestamps.length - 1] - timestamps[0];
    const windowMins  = Math.max(1, windowSecs / 60);

    // Count unique new buyer wallets vs seller wallets
    const buyers  = new Set<string>();
    const sellers = new Set<string>();

    for (const tx of txs) {
      const transfers: any[] = tx.tokenTransfers ?? [];
      for (const t of transfers) {
        if (t.tokenAmount > 0 && t.toUserAccount)   buyers.add(t.toUserAccount);
        if (t.tokenAmount > 0 && t.fromUserAccount) sellers.add(t.fromUserAccount);
      }
    }

    const netChange = buyers.size - sellers.size;
    const velocity  = buyers.size / windowMins;

    return { velocity, netChange };
  } catch {
    return { velocity: 0, netChange: 0 };
  }
}

// ─── Main divergence analyzer ─────────────────────────────────────────────────

export async function analyzeHolderDivergence(pair: any): Promise<HolderDivergenceResult> {
  const priceM5  = pair.priceChange?.m5  ?? 0;
  const priceH1  = pair.priceChange?.h1  ?? 0;
  const priceH24 = pair.priceChange?.h24 ?? 0;

  // Use the most meaningful price window
  const refPrice = Math.abs(priceH1) > Math.abs(priceM5) ? priceH1 : priceM5;

  // Get holder velocity (async, may fail gracefully)
  const address = pair.baseToken?.address ?? "";
  if (!address) {
    return {
      type:            "INSUFFICIENT_DATA",
      confidenceBoost: 0,
      priceChangePct:  refPrice,
      holderChange:    0,
      holderVelocity:  0,
      reason:          "No token address",
      isAccumulation:  false,
    };
  }

  const { velocity, netChange } = await estimateHolderVelocity(address);

  // ── Classify divergence ────────────────────────────────────────────────────

  // STRONG BULLISH: Price dumping hard (> -20%) but new holders entering fast
  if (refPrice <= -20 && velocity >= 1.0 && netChange > 0) {
    return {
      type:            "STRONG_BULLISH",
      confidenceBoost: 25,
      priceChangePct:  refPrice,
      holderChange:    netChange,
      holderVelocity:  velocity,
      reason:          `STRONG ACCUMULATION: price ${refPrice.toFixed(1)}% but ${velocity.toFixed(1)} new holders/min — conviction buyers`,
      isAccumulation:  true,
    };
  }

  // BULLISH: Price dipping while holders growing
  if (refPrice <= -5 && velocity >= 0.5 && netChange > 0) {
    return {
      type:            "BULLISH",
      confidenceBoost: 15,
      priceChangePct:  refPrice,
      holderChange:    netChange,
      holderVelocity:  velocity,
      reason:          `Bullish divergence: price ${refPrice.toFixed(1)}% but holders growing at ${velocity.toFixed(1)}/min`,
      isAccumulation:  true,
    };
  }

  // BEARISH: Price rising but holders leaving (distribution)
  if (refPrice >= 10 && netChange < -3) {
    return {
      type:            "BEARISH",
      confidenceBoost: -15,
      priceChangePct:  refPrice,
      holderChange:    netChange,
      holderVelocity:  velocity,
      reason:          `Distribution warning: price +${refPrice.toFixed(1)}% but holders exiting (net: ${netChange})`,
      isAccumulation:  false,
    };
  }

  // NEUTRAL: Both moving together or insufficient signal
  return {
    type:            "NEUTRAL",
    confidenceBoost: 0,
    priceChangePct:  refPrice,
    holderChange:    netChange,
    holderVelocity:  velocity,
    reason:          `No divergence: price ${refPrice.toFixed(1)}%, holder change ${netChange > 0 ? "+" : ""}${netChange}`,
    isAccumulation:  false,
  };
}

// ─── Quick check from pair data only (no async calls) ─────────────────────────
// Uses data already in the pair object — no extra API calls.
// Less accurate but fast. Used in the DexScreener filter pass.

export function quickDivergenceCheck(pair: any): {
  bullish:  boolean;
  bearish:  boolean;
  reason:   string;
} {
  const priceM5  = pair.priceChange?.m5  ?? 0;
  const priceH1  = pair.priceChange?.h1  ?? 0;
  const buysM5   = pair.txns?.m5?.buys   ?? 0;
  const sellsM5  = pair.txns?.m5?.sells  ?? 0;
  const buysH1   = pair.txns?.h1?.buys   ?? 0;
  const sellsH1  = pair.txns?.h1?.sells  ?? 0;

  // If price is down but buy count > sell count, that's accumulation
  const bsrM5 = sellsM5 > 0 ? buysM5 / sellsM5 : buysM5;
  const bsrH1 = sellsH1 > 0 ? buysH1 / sellsH1 : buysH1;

  // Bullish: price dipping but buyers outnumber sellers
  if (priceM5 < -3 && bsrM5 >= 1.5) {
    return {
      bullish: true,
      bearish: false,
      reason:  `Dip buying: price ${priceM5.toFixed(1)}% but B/S ${bsrM5.toFixed(2)} — accumulation`,
    };
  }

  // Bearish: price pumping but sellers outnumber buyers (distribution)
  if (priceH1 > 20 && bsrH1 < 0.7) {
    return {
      bullish: false,
      bearish: true,
      reason:  `Distribution: price +${priceH1.toFixed(1)}% but B/S only ${bsrH1.toFixed(2)}`,
    };
  }

  return { bullish: false, bearish: false, reason: "No divergence" };
}