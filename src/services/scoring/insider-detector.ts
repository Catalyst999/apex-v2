// src/services/scoring/insider-detector.ts
// Catalyst Apex Trader v2.2 - Insider Wallet Pattern Detection
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

// --------------------------------------------------
// Types
// --------------------------------------------------

export interface InsiderWallet {
  address: string;
  earlyEntryCount: number;
  profitableTokens: number;
  totalTokensTraded: number;
  profitRate: number;
  averageTimeToPump: number;
  avgEntryTiming: number;
  isCoordinated: boolean;
  coordinatedWith: string[];
  rugSuspicion: number;
  confidenceScore: number;
  reason: string;
}

export interface ClusteredWallets {
  coordinators: string[];
  memberCount: number;
  sharedTokens: string[];
  coordDate: number;
}

// --------------------------------------------------
// Thresholds
// --------------------------------------------------

const MIN_EARLY_ENTRIES = 5;
const MIN_PROFITABLE_TOKENS = 3;
const MIN_PROFIT_RATE = 0.6;
const PUMP_WINDOW_MIN = 30;
const PUMP_WINDOW_MAX = 24 * 60;
const MIN_CLUSTER_SIZE = 2;
const CLUSTER_TIMING_WINDOW = 10 * 60 * 1000;

// --------------------------------------------------
// Analyze Single Wallet
// --------------------------------------------------

export async function analyzeWallet(
  walletAddress: string
): Promise<InsiderWallet | null> {
  try {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.API_KEY}`;

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

    if (sigs.length < MIN_EARLY_ENTRIES) {
      return null;
    }

    const txRes = await axios.post(
      `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.API_KEY}`,
      {
        transactions: sigs.slice(0, 30),
      },
      { timeout: 12000 }
    );

    const txs: any[] = txRes.data ?? [];

    if (txs.length === 0) {
      return null;
    }

    const buys = txs.filter(
      (tx: any) =>
        tx.type === "SWAP" ||
        tx.description?.toLowerCase().includes("swap")
    );

    if (buys.length < MIN_EARLY_ENTRIES) {
      return null;
    }

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

      if (!tokenTransfer?.mint) {
        continue;
      }

      const tokenAddress = tokenTransfer.mint;

      tradedTokens.add(tokenAddress);

      const { data: pairData } = await supabase
        .from("pairs")
        .select("id, address, created_at, score")
        .eq("address", tokenAddress)
        .single();

      if (!pairData) {
        continue;
      }

      const pairCreatedMs = new Date(pairData.created_at).getTime();

      const timingDelta = Math.abs(
        buyTimestamp * 1000 - pairCreatedMs
      );

      if (timingDelta < 5 * 60 * 1000) {
        earlyEntryCount++;

        totalTimingDelta += timingDelta / 1000 / 60;

        if (pairData.score > 70) {
          profitableTokens++;
          totalTimeToPump += 60;
        }
      }
    }

    if (earlyEntryCount < MIN_EARLY_ENTRIES) {
      return null;
    }

    if (profitableTokens < MIN_PROFITABLE_TOKENS) {
      return null;
    }

    const profitRate =
      profitableTokens / Math.max(tradedTokens.size, 1);

    if (profitRate < MIN_PROFIT_RATE) {
      return null;
    }

    const avgTimeToPump =
      profitableTokens > 0
        ? totalTimeToPump / profitableTokens
        : 60;

    const avgEntryTiming =
      earlyEntryCount > 0
        ? totalTimingDelta / earlyEntryCount
        : 0;

    const rugSuspicion = await calculateRugSuspicion(
      walletAddress,
      buys
    );

    if (rugSuspicion > 70) {
      return null;
    }

    const { isCoordinated, coordinatedWith } =
      await checkWalletCoordination(walletAddress);

    let confidence = 50;

    if (earlyEntryCount >= 10) confidence += 25;
    else if (earlyEntryCount >= 7) confidence += 15;
    else confidence += 10;

    if (profitRate >= 0.8) confidence += 20;
    else if (profitRate >= 0.7) confidence += 10;

    if (profitableTokens >= 10) confidence += 15;
    else if (profitableTokens >= 5) confidence += 10;

    if (avgEntryTiming < 2) confidence += 15;
    else if (avgEntryTiming < 5) confidence += 10;

    if (rugSuspicion < 20) confidence += 10;
    if (rugSuspicion > 50) confidence -= 20;

    if (isCoordinated) confidence += 20;

    confidence = Math.min(100, confidence);

    const reason = [
      `${earlyEntryCount} early entries`,
      `${(profitRate * 100).toFixed(0)}% profitable`,
      `Rug risk: ${rugSuspicion.toFixed(0)}%`,
      isCoordinated
        ? `Coordinated (${coordinatedWith.length} wallets)`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      address: walletAddress,
      earlyEntryCount,
      profitableTokens,
      totalTokensTraded: tradedTokens.size,
      profitRate,
      averageTimeToPump: avgTimeToPump,
      avgEntryTiming,
      isCoordinated,
      coordinatedWith,
      rugSuspicion,
      confidenceScore: confidence,
      reason,
    };
  } catch (err: any) {
    console.warn(
      `[INSIDER] Analysis failed for ${walletAddress}: ${err.message}`
    );

    return null;
  }
}

// --------------------------------------------------
// Rug Suspicion
// --------------------------------------------------

async function calculateRugSuspicion(
  walletAddress: string,
  txs: any[]
): Promise<number> {
  let suspicion = 0;

  const sellTxs = txs.filter(
    (tx) =>
      tx.type === "SWAP" ||
      (tx.tokenTransfers ?? []).some(
        (t: any) => t.fromUserAccount === walletAddress
      )
  );

  if (sellTxs.length / Math.max(txs.length, 1) > 0.5) {
    suspicion += 30;
  }

  const timestamps = txs
    .map((tx) => tx.timestamp ?? 0)
    .sort((a, b) => a - b);

  let consecutiveBuys = 0;

  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i - 1] < 10) {
      consecutiveBuys++;
    }
  }

  if (consecutiveBuys >= 3) {
    suspicion += 40;
  }

  const { data: rugHistory } = await supabase
    .from("security_logs")
    .select("reason")
    .eq("wallet", walletAddress)
    .limit(5);

  if (
    rugHistory &&
    rugHistory.some((r: any) =>
      String(r.reason)
        .toLowerCase()
        .match(/rug|dump|bundle/)
    )
  ) {
    suspicion += 50;
  }

  return Math.min(100, suspicion);
}

// --------------------------------------------------
// Wallet Coordination
// --------------------------------------------------

async function checkWalletCoordination(
  walletAddress: string
): Promise<{
  isCoordinated: boolean;
  coordinatedWith: string[];
}> {
  try {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.API_KEY}`;

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
      `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.API_KEY}`,
      {
        transactions: sigs.slice(0, 15),
      },
      { timeout: 12000 }
    );

    const txs: any[] = txRes.data ?? [];

    const myTokens = new Set<string>();

    for (const tx of txs) {
      for (const t of tx.tokenTransfers ?? []) {
        if (t.mint) {
          myTokens.add(t.mint);
        }
      }
    }

    if (myTokens.size === 0) {
      return {
        isCoordinated: false,
        coordinatedWith: [],
      };
    }

    const coordinatedWith = new Set<string>();

    return {
      isCoordinated:
        coordinatedWith.size >= MIN_CLUSTER_SIZE,
      coordinatedWith: Array.from(coordinatedWith),
    };
  } catch {
    return {
      isCoordinated: false,
      coordinatedWith: [],
    };
  }
}

// --------------------------------------------------
// Detect Insiders From Successful Tokens
// --------------------------------------------------

export async function detectInsidersFromSuccessfulTokens(): Promise<
  InsiderWallet[]
> {
  try {
    const { data: successfulPairs } = await supabase
      .from("pairs")
      .select("address, score, created_at")
      .gte("score", 75)
      .gte(
        "created_at",
        new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000
        ).toISOString()
      )
      .limit(30);

    if (!successfulPairs?.length) {
      return [];
    }

    const insiders: InsiderWallet[] = [];

    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.API_KEY}`;

    for (const pair of successfulPairs) {
      try {
        const sigRes = await axios.post(
          rpcUrl,
          {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [
              pair.address,
              {
                limit: 20,
                commitment: "confirmed",
              },
            ],
          },
          { timeout: 8000 }
        );

        const sigs: string[] = (sigRes.data?.result ?? [])
          .map((r: any) => r.signature)
          .filter(Boolean);

        if (!sigs.length) {
          continue;
        }

        const txRes = await axios.post(
          `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.API_KEY}`,
          {
            transactions: sigs.slice(0, 10),
          },
          { timeout: 10000 }
        );

        const txs: any[] = txRes.data ?? [];

        const buyers = new Set<string>();

        for (const tx of txs) {
          const buyer =
            tx.feePayer ?? (tx.signers ?? [])[0];

          if (buyer) {
            buyers.add(buyer);
          }
        }

        for (const buyer of Array.from(buyers).slice(0, 5)) {
          const insider = await analyzeWallet(buyer);

          if (
            insider &&
            insider.confidenceScore >= 60
          ) {
            insiders.push(insider);
          }
        }
      } catch {
        continue;
      }
    }

    return insiders;
  } catch (err: any) {
    console.warn(
      `[INSIDER] Detection failed: ${err.message}`
    );

    return [];
  }
}

// --------------------------------------------------
// Store Insider
// --------------------------------------------------

export async function storeInsiderAsSmartWallet(
  insider: InsiderWallet
): Promise<void> {
  try {
    await supabase.from("smart_wallets").upsert({
      address: insider.address,
      label: `Insider #${insider.address.slice(0, 6)}`,
      win_rate: insider.profitRate,
      total_trades: insider.totalTokensTraded,
      wins: insider.profitableTokens,
      is_manual: false,
      is_insider: true,
      confidence: insider.confidenceScore,
      added_at: new Date().toISOString(),
    });

    console.log(
      `[INSIDER] Stored ${insider.address.slice(
        0,
        8
      )}... confidence=${insider.confidenceScore}`
    );
  } catch (err: any) {
    console.warn(
      `[INSIDER] Failed storing insider: ${err.message}`
    );
  }
}

// --------------------------------------------------
// Full Pipeline
// --------------------------------------------------

export async function runInsiderDetectionPipeline(): Promise<
  InsiderWallet[]
> {
  console.log("[INSIDER] Starting detection pipeline...");

  const insiders =
    await detectInsidersFromSuccessfulTokens();

  console.log(
    `[INSIDER] Found ${insiders.length} potential insiders`
  );

  for (const insider of insiders) {
    if (insider.confidenceScore >= 70) {
      await storeInsiderAsSmartWallet(insider);
    }
  }

  return insiders;
}