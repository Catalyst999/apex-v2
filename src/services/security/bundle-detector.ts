// src/services/security/bundle-detector.ts
// Catalyst Apex Trader v2.2 — Bundle Detector
//
// Detects coordinated sniper launches using 4 on-chain patterns.
// Any one pattern triggers rejection.
//
// All thresholds are configurable via Railway env vars — see config.ts
// BUNDLE_SAME_BLOCK_MIN_WALLETS, BUNDLE_COMMON_FUNDER_PCT,
// BUNDLE_MIRROR_AMOUNT_MIN, BUNDLE_FRESH_WALLET_PCT

import axios from "axios";
import { supabase }           from "../../db/supabase";
import { HELIUS, BUNDLE_THRESHOLDS } from "../../core/config";

export interface BundleCheckResult {
  reject:     boolean;
  reason:     string;
  confidence: number;
  pattern:    "same-block" | "common-funder" | "mirror-amounts" | "fresh-wallets" | "clean";
}

interface Buyer {
  wallet:   string;
  amount:   number;
  time:     number;
  feePayer: string;
}

// ─── Helius fetch with retry (uses correct RPC endpoint) ──────────────────────
async function fetchFirstBuyers(tokenAddress: string, retries = 3): Promise<Buyer[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Use the correct Helius Enhanced Transactions endpoint
      const sigRes = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`,
        {
          jsonrpc: "2.0",
          id:      1,
          method:  "getSignaturesForAddress",
          params:  [tokenAddress, { limit: 30, commitment: "confirmed" }],
        },
        { timeout: 8000 }
      );

      const signatures: string[] = (sigRes.data?.result ?? [])
        .map((r: any) => r.signature)
        .filter(Boolean);

      if (signatures.length === 0) return [];

      const txRes = await axios.post(
        `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`,
        { transactions: signatures.slice(0, 30) },
        { timeout: 10000 }
      );

      const txs: any[] = (txRes.data ?? []).filter(
        (tx: any) => tx.type === "SWAP" || tx.description?.toLowerCase().includes("swap")
      );

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
    const sigRes = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`,
      {
        jsonrpc: "2.0",
        id:      1,
        method:  "getSignaturesForAddress",
        params:  [wallet, { limit: 5, commitment: "confirmed" }],
      },
      { timeout: 5000 }
    );
    const txCount = (sigRes.data?.result ?? []).length;
    return txCount <= 3;
  } catch {
    return false;
  }
}

// ─── Pattern 1: Same block ────────────────────────────────────────────────────
function detectSameBlock(buyers: Buyer[]): { found: boolean; detail: string; confidence: number } {
  const threshold = BUNDLE_THRESHOLDS.sameBlockMinWallets;
  const timeGroups = new Map<number, Buyer[]>();

  for (const b of buyers) {
    const window = Math.floor(b.time / 2);
    if (!timeGroups.has(window)) timeGroups.set(window, []);
    timeGroups.get(window)!.push(b);
  }

  for (const [, group] of timeGroups) {
    if (group.length >= threshold) {
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
  const threshold = BUNDLE_THRESHOLDS.commonFunderPct;
  const funderGroups = new Map<string, Buyer[]>();

  for (const b of buyers) {
    if (!funderGroups.has(b.feePayer)) funderGroups.set(b.feePayer, []);
    funderGroups.get(b.feePayer)!.push(b);
  }

  for (const [, group] of funderGroups) {
    const pct = group.length / buyers.length;
    if (pct >= threshold) {
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
  const threshold = BUNDLE_THRESHOLDS.mirrorAmountMin;
  const amountMap = new Map<number, number>();

  for (const b of buyers) {
    const key = Math.round(b.amount);
    amountMap.set(key, (amountMap.get(key) ?? 0) + 1);
  }

  for (const [, count] of amountMap) {
    if (count >= threshold) {
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

  const threshold    = BUNDLE_THRESHOLDS.freshWalletPct;
  const uniqueWallets = [...new Set(buyers.map((b) => b.wallet))].slice(0, 10);
  const freshChecks   = await Promise.all(uniqueWallets.map(isFreshWallet));
  const freshCount    = freshChecks.filter(Boolean).length;
  const freshPct      = freshCount / uniqueWallets.length;

  if (freshPct >= threshold) {
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
  poolCreatedAt: number
): Promise<BundleCheckResult> {
  try {
    console.log(`🔍 Bundle check: ${tokenAddress}`);
    console.log(`   Thresholds → same-block: ${BUNDLE_THRESHOLDS.sameBlockMinWallets} wallets | funder: ${(BUNDLE_THRESHOLDS.commonFunderPct * 100).toFixed(0)}% | mirror: ${BUNDLE_THRESHOLDS.mirrorAmountMin} | fresh: ${(BUNDLE_THRESHOLDS.freshWalletPct * 100).toFixed(0)}%`);

    const buyers = await fetchFirstBuyers(tokenAddress);

    if (buyers.length < 3) {
      console.log(`⚠️  Bundle check: not enough buyers yet — passing through`);
      return { reject: false, reason: "", confidence: 0, pattern: "clean" };
    }

    // Pattern 1: Same block
    const sameBlock = detectSameBlock(buyers);
    if (sameBlock.found) {
      await logBundle(tokenAddress, "same-block", sameBlock.confidence, sameBlock.detail);
      return { reject: true, reason: `Bundle: ${sameBlock.detail}`, confidence: sameBlock.confidence, pattern: "same-block" };
    }

    // Pattern 2: Common funder
    const commonFunder = detectCommonFunder(buyers);
    if (commonFunder.found) {
      await logBundle(tokenAddress, "common-funder", commonFunder.confidence, commonFunder.detail);
      return { reject: true, reason: `Bundle: ${commonFunder.detail}`, confidence: commonFunder.confidence, pattern: "common-funder" };
    }

    // Pattern 3: Mirror amounts
    const mirrorAmounts = detectMirrorAmounts(buyers);
    if (mirrorAmounts.found) {
      await logBundle(tokenAddress, "mirror-amounts", mirrorAmounts.confidence, mirrorAmounts.detail);
      return { reject: true, reason: `Bundle: ${mirrorAmounts.detail}`, confidence: mirrorAmounts.confidence, pattern: "mirror-amounts" };
    }

    // Pattern 4: Fresh wallets
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
  details:    string
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