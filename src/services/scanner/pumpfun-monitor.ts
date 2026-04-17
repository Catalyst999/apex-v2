// src/services/scanner/pumpfun-monitor.ts
// Catalyst Apex Trader v2.1 — Pump.fun Graduation Monitor
//
// Detects tokens graduating from Pump.fun bonding curve to Raydium
// BEFORE they appear on DexScreener. This is the highest-edge entry
// point — first or second block after migration.
//
// How graduation works:
// 1. Token launches on Pump.fun bonding curve
// 2. When ~$69k SOL is raised, it "graduates" to Raydium
// 3. A new Raydium LP is created with the graduated token
// 4. This is the moment we want to detect

import axios from "axios";
import { HELIUS } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraduatedToken {
  tokenAddress:    string;
  deployer:        string;
  graduatedAt:     number;   // unix seconds
  bondingCurveAge: number;   // minutes on bonding curve before graduation
  holderCount:     number;   // holders accumulated on bonding curve
  volumeOnCurve:   number;   // USD volume before graduation
  signature:       string;
}

// Pump.fun program address on Solana
const PUMPFUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// ─── Monitor ──────────────────────────────────────────────────────────────────
// Polls Helius for recent Pump.fun graduation transactions.
// A graduation = a transaction that involves both Pump.fun AND Raydium programs.

export async function checkPumpFunGraduations(): Promise<GraduatedToken[]> {
  try {
    if (!HELIUS.apiKey) return [];

    // Fetch recent transactions for the Pump.fun program
    const res = await axios.get(
      `https://api.helius.xyz/v0/addresses/${PUMPFUN_PROGRAM}/transactions`,
      {
        params: {
          "api-key": HELIUS.apiKey,
          limit:     50,
          type:      "Any",
        },
        timeout: 10000,
      }
    );

    const txs: any[] = res.data ?? [];
    const graduated: GraduatedToken[] = [];

    for (const tx of txs) {
      const parsed = parseGraduationTx(tx);
      if (parsed) graduated.push(parsed);
    }

    if (graduated.length > 0) {
      console.log(`🎓 Pump.fun graduations detected: ${graduated.length}`);
    }

    return graduated;

  } catch (err: any) {
    console.error("❌ Pump.fun monitor error:", err.message);
    return [];
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseGraduationTx(tx: any): GraduatedToken | null {
  try {
    const RAYDIUM_AMM = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
    const SOL_MINT    = "So11111111111111111111111111111111111111112";

    const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) ?? [];
    const instructions: any[]   = tx?.instructions ?? [];

    // A graduation tx involves BOTH Pump.fun AND Raydium
    const hasPumpfun = accountKeys.includes(PUMPFUN_PROGRAM) ||
                       instructions.some((ix: any) => ix.programId === PUMPFUN_PROGRAM);
    const hasRaydium = accountKeys.includes(RAYDIUM_AMM) ||
                       instructions.some((ix: any) => ix.programId === RAYDIUM_AMM);

    if (!hasPumpfun || !hasRaydium) return null;

    // Find the graduated token
    const tokenTransfers: any[] = tx?.tokenTransfers ?? [];
    const tokenTransfer = tokenTransfers.find(
      (t: any) => t.mint && t.mint !== SOL_MINT
    );
    if (!tokenTransfer) return null;

    return {
      tokenAddress:    tokenTransfer.mint,
      deployer:        tx.feePayer ?? tx.signers?.[0] ?? "",
      graduatedAt:     tx.timestamp ?? Math.floor(Date.now() / 1000),
      bondingCurveAge: 0,   // enriched separately
      holderCount:     0,   // enriched separately
      volumeOnCurve:   0,   // enriched separately
      signature:       tx.signature ?? "",
    };

  } catch {
    return null;
  }
}

// ─── Pre-graduation data ──────────────────────────────────────────────────────
// Before a token graduates, it accumulates holders and volume on the bonding
// curve. This data is invisible to DexScreener-only bots. We fetch it here
// to enrich our scoring with pre-graduation signals.

export async function fetchBondingCurveData(tokenAddress: string): Promise<{
  holderCount:   number;
  volumeOnCurve: number;
  ageMinutes:    number;
}> {
  try {
    const res = await axios.get(
      `https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions`,
      {
        params: {
          "api-key": HELIUS.apiKey,
          limit:     100,
          type:      "Any",
        },
        timeout: 8000,
      }
    );

    const txs: any[] = res.data ?? [];
    if (txs.length === 0) return { holderCount: 0, volumeOnCurve: 0, ageMinutes: 0 };

    // Unique buyers = holder count proxy
    const buyers = new Set<string>();
    let volumeOnCurve = 0;

    for (const tx of txs) {
      if (tx.feePayer) buyers.add(tx.feePayer);
      // Sum SOL value of all swaps
      const solTransfers = (tx.nativeTransfers ?? []) as any[];
      for (const t of solTransfers) {
        if (t.amount > 0) volumeOnCurve += t.amount / 1e9;
      }
    }

    // Age = time between first and last transaction
    const timestamps = txs.map((t: any) => t.timestamp as number).filter(Boolean);
    const ageMinutes = timestamps.length >= 2
      ? (Math.max(...timestamps) - Math.min(...timestamps)) / 60
      : 0;

    return {
      holderCount:   buyers.size,
      volumeOnCurve: volumeOnCurve,
      ageMinutes,
    };

  } catch (err: any) {
    console.error("❌ Bonding curve data error:", err.message);
    return { holderCount: 0, volumeOnCurve: 0, ageMinutes: 0 };
  }
}