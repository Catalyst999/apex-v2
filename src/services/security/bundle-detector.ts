// src/services/security/bundle-detector.ts
// Catalyst Apex Trader v2.1 — Bundle Detector
//
// Detects coordinated sniper launches using 4 on-chain patterns.
//
// KEY CHANGE: Momentum Override
// Tokens with high organic activity AFTER the launch bundle are NOT rejected.
// mexicanunc had 46k buys post-snipe — that's the market validating it.
// The pattern: block-0 snipers exist, but organic buyers OVERWHELM them.
// We catch this via: holder count + buy/sell ratio + 24h volume check.

import axios       from "axios";
import { supabase } from "../../db/supabase";
import { HELIUS, BUNDLE_THRESHOLDS } from "../../core/config";

export interface BundleCheckResult {
  reject:     boolean;
  reason:     string;
  confidence: number;
  pattern:    "same-block" | "common-funder" | "mirror-amounts" | "fresh-wallets" | "clean" | "overridden";
}

interface Buyer {
  wallet:   string;
  amount:   number;
  time:     number;
  feePayer: string;
}

// ─── Momentum override check ──────────────────────────────────────────────────
// If a token has been sniped but organic buyers followed in volume,
// override the bundle rejection. This catches CR7, mexicanunc, SPACEX type plays.

function hasMomentumOverride(pair?: any): boolean {
  if (!pair) return false;

  const mcap       = pair.marketCap ?? pair.fdv ?? 0;
  const holders    = pair.holders   ?? 0;
  const buys24h    = pair.txns?.h24?.buys  ?? 0;
  const sells24h   = pair.txns?.h24?.sells ?? 0;
  const vol24h     = pair.volume?.h24 ?? 0;
  const priceH24   = pair.priceChange?.h24 ?? 0;

  const bsr = sells24h > 0 ? buys24h / sells24h : buys24h;

  // Override conditions — all must be true:
  // 1. Price is up significantly (organic demand exists)
  // 2. Many buys (crowd found it)
  // 3. Buy/sell ratio positive
  // 4. Either good holder count OR high volume
  const priceUp      = priceH24 >= BUNDLE_THRESHOLDS.momentumOverridePriceChange;
  const highBuys     = buys24h  >= BUNDLE_THRESHOLDS.momentumOverrideMinBuys;
  const positiveBsr  = bsr >= 1.2;
  const organicProof = holders >= BUNDLE_THRESHOLDS.momentumOverrideMinHolders
                       || vol24h >= BUNDLE_THRESHOLDS.momentumOverrideMinVol24h;

  if (priceUp && highBuys && positiveBsr && organicProof) {
    console.log(
      `   ⚡ Momentum override: +${priceH24.toFixed(0)}% | ${buys24h}B/${sells24h}S | ${holders} holders | $${(vol24h/1000).toFixed(0)}k vol`
    );
    return true;
  }

  return false;
}

// ─── Helius fetch with retry ──────────────────────────────────────────────────

async function fetchFirstBuyers(tokenAddress: string, retries = 3): Promise<Buyer[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(
        `https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions`,
        {
          params:  { "api-key": HELIUS.apiKey, limit: 30, type: "SWAP" },
          timeout: 8000,
        }
      );
      const txs: any[] = res.data ?? [];
      return txs.flatMap((tx: any) =>
        (tx.tokenTransfers ?? [])
          .filter((t: any) => t.toUserAccount && t.tokenAmount > 0)
          .map((t: any) => ({
            wallet:   t.toUserAccount as string,
            amount:   Number(t.tokenAmount),
            time:     tx.timestamp as number,
            feePayer: (tx.feePayer ?? tx.signers?.[0] ?? "") as string,
          }))
      );
    } catch (err: any) {
      if (attempt === retries) {
        console.error(`❌ Bundle fetch failed after ${retries} attempts:`, err.message);
        return [];
      }
      console.log(`⏳ Helius retry ${attempt}/${retries}...`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
}

// ─── Fresh wallet check ───────────────────────────────────────────────────────

async function isFreshWallet(wallet: string): Promise<boolean> {
  try {
    const res = await axios.get(
      `https://api.helius.xyz/v0/addresses/${wallet}/transactions`,
      {
        params:  { "api-key": HELIUS.apiKey, limit: 5 },
        timeout: 5000,
      }
    );
    const txCount = (res.data ?? []).length;
    return txCount <= 3;
  } catch {
    return false;
  }
}

// ─── Pattern 1: Same block ────────────────────────────────────────────────────

function detectSameBlock(buyers: Buyer[]): { found: boolean; detail: string; confidence: number } {
  const timeGroups = new Map<number, Buyer[]>();
  for (const b of buyers) {
    const window = Math.floor(b.time / 2);
    if (!timeGroups.has(window)) timeGroups.set(window, []);
    timeGroups.get(window)!.push(b);
  }

  for (const [, group] of timeGroups) {
    if (group.length >= BUNDLE_THRESHOLDS.sameBlockMinWallets) {
      return {
        found:      true,
        detail:     `${group.length} wallets bought in same 2-second block`,
        confidence: Math.min(100, group.length * 20),
      };
    }
  }

  return { found: false, detail: "", confidence: 0 };
}

// ─── Pattern 2: Common funder ─────────────────────────────────────────────────

function detectCommonFunder(buyers: Buyer[]): { found: boolean; detail: string; confidence: number } {
  const funderGroups = new Map<string, Buyer[]>();
  for (const b of buyers) {
    if (!funderGroups.has(b.feePayer)) funderGroups.set(b.feePayer, []);
    funderGroups.get(b.feePayer)!.push(b);
  }

  for (const [, group] of funderGroups) {
    const pct = group.length / buyers.length;
    if (pct >= BUNDLE_THRESHOLDS.commonFunderPct) {
      return {
        found:      true,
        detail:     `${group.length} wallets (${(pct * 100).toFixed(0)}%) share a funding wallet`,
        confidence: Math.floor(pct * 100),
      };
    }
  }

  return { found: false, detail: "", confidence: 0 };
}

// ─── Pattern 3: Mirror amounts ────────────────────────────────────────────────

function detectMirrorAmounts(buyers: Buyer[]): { found: boolean; detail: string; confidence: number } {
  const amountMap = new Map<number, number>();
  for (const b of buyers) {
    const key = Math.round(b.amount);
    amountMap.set(key, (amountMap.get(key) ?? 0) + 1);
  }

  for (const [, count] of amountMap) {
    if (count >= BUNDLE_THRESHOLDS.mirrorAmountsMinCount) {
      return {
        found:      true,
        detail:     `${count} wallets bought identical token amounts`,
        confidence: Math.min(100, count * 15),
      };
    }
  }

  return { found: false, detail: "", confidence: 0 };
}

// ─── Pattern 4: Fresh wallets ─────────────────────────────────────────────────

async function detectFreshWallets(buyers: Buyer[]): Promise<{ found: boolean; detail: string; confidence: number }> {
  if (buyers.length === 0) return { found: false, detail: "", confidence: 0 };

  const uniqueWallets = [...new Set(buyers.map((b) => b.wallet))].slice(0, 10);
  const freshChecks   = await Promise.all(uniqueWallets.map(isFreshWallet));
  const freshCount    = freshChecks.filter(Boolean).length;
  const freshPct      = freshCount / uniqueWallets.length;

  if (freshPct >= BUNDLE_THRESHOLDS.freshWalletPct) {
    return {
      found:      true,
      detail:     `${freshCount}/${uniqueWallets.length} early buyers are brand-new wallets`,
      confidence: Math.floor(freshPct * 100),
    };
  }

  return { found: false, detail: "", confidence: 0 };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function checkBundle(
  tokenAddress:  string,
  poolCreatedAt: number,
  pair?:         any,          // Pass the pair data for momentum override check
): Promise<BundleCheckResult> {
  try {
    console.log(`🔍 Bundle check: ${tokenAddress}`);
    console.log(
      `   Thresholds: same-block≥${BUNDLE_THRESHOLDS.sameBlockMinWallets} | funder≥${(BUNDLE_THRESHOLDS.commonFunderPct * 100).toFixed(0)}% | fresh≥${(BUNDLE_THRESHOLDS.freshWalletPct * 100).toFixed(0)}%`
    );

    // ── Momentum override check ──────────────────────────────────────────────
    // If the token already has strong organic momentum, skip bundle checks.
    // This is what would have let CR7, SPACEX, mexicanunc through.
    if (hasMomentumOverride(pair)) {
      console.log(`   ✅ Bundle check OVERRIDDEN — organic momentum detected`);
      return {
        reject:     false,
        reason:     "",
        confidence: 0,
        pattern:    "overridden",
      };
    }

    const buyers = await fetchFirstBuyers(tokenAddress);

    if (buyers.length < 3) {
      console.log(`⚠️  Bundle check: not enough buyers yet — passing through`);
      return { reject: false, reason: "", confidence: 0, pattern: "clean" };
    }

    const sameBlock = detectSameBlock(buyers);
    if (sameBlock.found) {
      await logBundle(tokenAddress, "same-block", sameBlock.confidence, sameBlock.detail);
      return { reject: true, reason: `Bundle: ${sameBlock.detail}`, confidence: sameBlock.confidence, pattern: "same-block" };
    }

    const commonFunder = detectCommonFunder(buyers);
    if (commonFunder.found) {
      await logBundle(tokenAddress, "common-funder", commonFunder.confidence, commonFunder.detail);
      return { reject: true, reason: `Bundle: ${commonFunder.detail}`, confidence: commonFunder.confidence, pattern: "common-funder" };
    }

    const mirrorAmounts = detectMirrorAmounts(buyers);
    if (mirrorAmounts.found) {
      await logBundle(tokenAddress, "mirror-amounts", mirrorAmounts.confidence, mirrorAmounts.detail);
      return { reject: true, reason: `Bundle: ${mirrorAmounts.detail}`, confidence: mirrorAmounts.confidence, pattern: "mirror-amounts" };
    }

    const freshWallets = await detectFreshWallets(buyers);
    if (freshWallets.found) {
      await logBundle(tokenAddress, "fresh-wallets", freshWallets.confidence, freshWallets.detail);
      return { reject: true, reason: `Bundle: ${freshWallets.detail}`, confidence: freshWallets.confidence, pattern: "fresh-wallets" };
    }

    console.log(`✅ Bundle check passed: ${tokenAddress}`);
    return { reject: false, reason: "", confidence: 0, pattern: "clean" };

  } catch (err: any) {
    console.error("❌ Bundle check error:", err.message);
    return { reject: false, reason: "", confidence: 0, pattern: "clean" };
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

async function logBundle(
  address:    string,
  pattern:    string,
  confidence: number,
  details:    string,
): Promise<void> {
  console.log(`🚫 BUNDLE REJECTED: ${address} — ${details} (confidence: ${confidence}%)`);
  await supabase.from("security_logs").insert({
    address,
    chain:        "solana",
    skip_reason:  `Bundle[${pattern}]: ${details}`,
    confidence,
    pattern_type: pattern,
    checked_at:   new Date().toISOString(),
  });
}
