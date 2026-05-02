// src/services/scanner/graduation-tracker.ts
// Catalyst Apex Trader v2.1 — Pump.fun Graduation Tracker
//
// From the playbook (Surge Rule):
// "When tokens bond, there's a huge price spike. Most touch $100k, then dip 50%
//  and reclaim highs. This works ~85% of the time."
//
// Strategy:
// 1. Watch tokens approaching 85 SOL bonding curve on Pump.fun
// 2. Buy at discount in pre-bonding $30-40k range
// 3. After bonding: hold to ~$100k spike, sell
// 4. Watch for -50% dip → re-enter for another 2x to new highs
//
// This file handles:
// - Pre-graduation detection (approaching 85 SOL)
// - Post-graduation surge tracking
// - Re-entry signal at -50% from spike high

import axios    from "axios";
import { HELIUS } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GraduationPhase =
  | "PRE_BONDING"       // < 85 SOL, approaching graduation
  | "JUST_GRADUATED"    // bonded to Raydium in last 30min
  | "SURGE_EXPECTED"    // graduated, spike not yet hit
  | "SURGING"           // price rising fast post-graduation
  | "DIP_OPPORTUNITY"   // hit $100k+, now dipped 40-60% — re-entry zone
  | "MATURED"           // past the graduation play window
  | "NOT_GRADUATING";

export interface GraduationSignal {
  phase:          GraduationPhase;
  solInBonding:   number;       // current SOL in bonding curve
  pctToGraduation: number;      // 0-100% toward 85 SOL
  isPreBonding:   boolean;
  justGraduated:  boolean;
  reEntryZone:    boolean;      // true = -40-60% from spike = re-entry
  suggestedAction: string;
  confidence:     number;
}

// ─── Pump.fun program IDs ─────────────────────────────────────────────────────

const PUMP_FUN_PROGRAM    = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_FUN_BONDING    = "CebN5WGQ4jvEPvsVU4EoHEpgznyQHeJ2kWoKqVRewqKM";
const GRADUATION_SOL      = 85;   // SOL needed to graduate
const PRE_BONDING_ENTRY   = 60;   // start watching at 60 SOL (70% of the way)
const SURGE_TARGET_MCAP   = 100_000;  // $100k spike target
const DIP_REENTRY_MIN     = 0.40;    // -40% from spike high
const DIP_REENTRY_MAX     = 0.60;    // -60% from spike high

// ─── Cache: track graduation events ──────────────────────────────────────────

const graduationCache = new Map<string, {
  graduatedAt:  number;   // unix timestamp
  spikeMcap:    number;   // highest mcap seen post-graduation
  spikeSeen:    boolean;
}>();

// ─── Pump.fun bonding curve reader ───────────────────────────────────────────
// Fetches the current SOL in the bonding curve via Helius RPC.

async function getBondingCurveSol(tokenAddress: string): Promise<number> {
  try {
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`;

    // Get token accounts to find the bonding curve account
    const res = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id:      1,
        method:  "getTokenLargestAccounts",
        params:  [tokenAddress],
      },
      { timeout: 8000 }
    );

    const accounts = res.data?.result?.value ?? [];
    if (accounts.length === 0) return 0;

    // The bonding curve holds the SOL — check the largest account balance
    // This is an approximation; actual Pump.fun reads the curve account directly
    const largestAccount = accounts[0];
    const solBalance = (largestAccount?.amount ?? 0) / 1e9;

    return solBalance;
  } catch {
    return 0;
  }
}

// ─── Graduation check from DexScreener data ──────────────────────────────────
// When we have DexScreener data, we can infer graduation state from:
// - pairCreatedAt (very recent = just graduated)
// - liquidity amount (< $5k = still Pump.fun, > $20k = Raydium graduated)
// - volume pattern post-creation

function inferGraduationFromPairData(pair: any): {
  likelyGraduated: boolean;
  justGraduated:   boolean;
  ageMinutes:      number;
} {
  const now        = Date.now();
  const created    = pair.pairCreatedAt ?? now;
  const ageMinutes = (now - created) / 1000 / 60;
  const liq        = pair.liquidity?.usd ?? 0;

  // Raydium pools typically start with > $20k liquidity after graduation
  const likelyGraduated = liq >= 20_000;

  // "Just graduated" = pool created in last 30 minutes with decent liquidity
  const justGraduated = ageMinutes <= 30 && likelyGraduated;

  return { likelyGraduated, justGraduated, ageMinutes };
}

// ─── Main graduation analyzer ─────────────────────────────────────────────────

export function analyzeGraduationPhase(pair: any): GraduationSignal {
  const address = pair.baseToken?.address ?? "";
  const mcap    = pair.marketCap ?? pair.fdv ?? 0;
  const liq     = pair.liquidity?.usd ?? 0;
  const priceH1 = pair.priceChange?.h1  ?? 0;
  const priceH24 = pair.priceChange?.h24 ?? 0;
  const vol1h   = pair.volume?.h1 ?? 0;

  const { likelyGraduated, justGraduated, ageMinutes } = inferGraduationFromPairData(pair);

  // ── Track spike highs after graduation ───────────────────────────────────
  if (justGraduated && !graduationCache.has(address)) {
    graduationCache.set(address, {
      graduatedAt: Math.floor(Date.now() / 1000),
      spikeMcap:   mcap,
      spikeSeen:   false,
    });
  }

  // Update spike tracking
  const cached = graduationCache.get(address);
  if (cached && mcap > cached.spikeMcap) {
    cached.spikeMcap = mcap;
    if (mcap >= SURGE_TARGET_MCAP) cached.spikeSeen = true;
    graduationCache.set(address, cached);
  }

  // ── Pre-bonding detection ────────────────────────────────────────────────
  // Small liq + very new = likely still on Pump.fun bonding curve
  if (liq < 20_000 && mcap < 80_000 && ageMinutes < 60) {
    const pctToGrad = Math.min(100, (liq / 20_000) * 100);
    const isApproaching = pctToGrad >= 70; // 70%+ of the way

    if (isApproaching) {
      return {
        phase:           "PRE_BONDING",
        solInBonding:    liq / 150, // rough SOL estimate from USD liq
        pctToGraduation: pctToGrad,
        isPreBonding:    true,
        justGraduated:   false,
        reEntryZone:     false,
        suggestedAction: `Pre-bonding play: ${pctToGrad.toFixed(0)}% to graduation. Buy now for graduation spike.`,
        confidence:      70,
      };
    }
  }

  // ── Just graduated ───────────────────────────────────────────────────────
  if (justGraduated) {
    return {
      phase:           "JUST_GRADUATED",
      solInBonding:    GRADUATION_SOL,
      pctToGraduation: 100,
      isPreBonding:    false,
      justGraduated:   true,
      reEntryZone:     false,
      suggestedAction: `JUST GRADUATED — surge to $100k expected. Hold for spike, sell at $100k+. Slippage > 30%.`,
      confidence:      85,
    };
  }

  // ── Post-graduation dip re-entry ─────────────────────────────────────────
  if (cached?.spikeSeen && likelyGraduated) {
    const dropFromSpike = (cached.spikeMcap - mcap) / cached.spikeMcap;

    if (dropFromSpike >= DIP_REENTRY_MIN && dropFromSpike <= DIP_REENTRY_MAX) {
      return {
        phase:           "DIP_OPPORTUNITY",
        solInBonding:    GRADUATION_SOL,
        pctToGraduation: 100,
        isPreBonding:    false,
        justGraduated:   false,
        reEntryZone:     true,
        suggestedAction: `POST-SPIKE DIP: -${(dropFromSpike * 100).toFixed(0)}% from $${(cached.spikeMcap / 1000).toFixed(0)}k spike. Re-entry for 2x to new highs.`,
        confidence:      75,
      };
    }
  }

  // ── Surging post-graduation ──────────────────────────────────────────────
  if (likelyGraduated && ageMinutes <= 120 && priceH1 >= 50 && vol1h >= 50_000) {
    return {
      phase:           "SURGING",
      solInBonding:    GRADUATION_SOL,
      pctToGraduation: 100,
      isPreBonding:    false,
      justGraduated:   false,
      reEntryZone:     false,
      suggestedAction: `Surge in progress (+${priceH1.toFixed(0)}% 1h). Target: $100k. Set sell at $100k+ with >30% slippage.`,
      confidence:      80,
    };
  }

  // ── Past the graduation window ───────────────────────────────────────────
  if (likelyGraduated && ageMinutes > 240) {
    return {
      phase:           "MATURED",
      solInBonding:    GRADUATION_SOL,
      pctToGraduation: 100,
      isPreBonding:    false,
      justGraduated:   false,
      reEntryZone:     false,
      suggestedAction: `Matured token — graduation play window closed. Evaluate on own merits.`,
      confidence:      30,
    };
  }

  return {
    phase:           "NOT_GRADUATING",
    solInBonding:    0,
    pctToGraduation: 0,
    isPreBonding:    false,
    justGraduated:   false,
    reEntryZone:     false,
    suggestedAction: "No graduation signal",
    confidence:      0,
  };
}

// ─── Clean old graduation cache entries ───────────────────────────────────────

export function cleanGraduationCache(): void {
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600; // 24h
  for (const [addr, data] of graduationCache) {
    if (data.graduatedAt < cutoff) graduationCache.delete(addr);
  }
}

// ─── Graduation summary for logs ──────────────────────────────────────────────

export function graduationSummary(signal: GraduationSignal): string {
  if (signal.phase === "NOT_GRADUATING") return "";
  return `🎓 ${signal.phase} | ${signal.suggestedAction}`;
}