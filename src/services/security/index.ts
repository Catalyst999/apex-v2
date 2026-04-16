// src/services/security/index.ts

import { checkSolanaSecurity } from "./solana";
import { checkGoPlus }         from "./goplus";
import { checkBundle }         from "./bundle-detector";
import { checkDeployer }       from "./deployer-check";
import { supabase }            from "../../db/supabase";
import { FEATURE_FLAGS }       from "../../core/config";

export interface FullSecurityResult {
  passed:           boolean;
  reason?:          string;
  mintAuthority:    string | null;
  freezeAuthority:  string | null;
  topHolderPercent: number;
  goplus: {
    isHoneypot:        boolean;
    isBlacklisted:     boolean;
    isMintable:        boolean;
    isLiquidityLocked: boolean;
    liquidityBurnt:    boolean;
    holderCount:       number;
    topHolderPercent:  number;
    buyTax:            number;
    sellTax:           number;
  };
  bundlePattern?:   string;
  deployerRisk?:    number;
  deployerPattern?: string;
}

// ─── Main security check ───────────────────────────────────────────────────────
// Order: bundle → deployer → GoPlus → Solana on-chain
// Each step only runs if the previous passed — saves API calls.

export async function runSecurityCheck(
  tokenAddress:  string,
  chain:         "solana" | "bsc",
  poolCreatedAt?: number,   // unix seconds — needed for bundle detection
  deployer?:     string,    // deployer wallet — needed for deployer check
): Promise<FullSecurityResult> {
  console.log(`\n🔒 Running security checks: ${tokenAddress}`);

  // ── Step 1: Bundle detection ──────────────────────────────────────────────
  if (FEATURE_FLAGS.enableBundleDetection && poolCreatedAt) {
    const bundle = await checkBundle(tokenAddress, poolCreatedAt);
    if (bundle.reject) {
      await logSkip(tokenAddress, chain, bundle.reason, { mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplusResult: null });
      return { passed: false, reason: bundle.reason, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: emptyGoplus(), bundlePattern: bundle.pattern };
    }
    console.log(`✅ Bundle check passed (pattern: ${bundle.pattern})`);
  }

  // ── Step 2: Deployer history ──────────────────────────────────────────────
  if (FEATURE_FLAGS.enableDeployerCheck && deployer) {
    const dep = await checkDeployer(deployer);
    if (dep.reject) {
      await logSkip(tokenAddress, chain, dep.reason, { mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplusResult: null });
      return { passed: false, reason: dep.reason, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: emptyGoplus(), deployerRisk: dep.riskScore, deployerPattern: dep.pattern };
    }
    console.log(`✅ Deployer check passed (risk: ${dep.riskScore}/100 | pattern: ${dep.pattern})`);
  }

  // ── Step 3: GoPlus API ────────────────────────────────────────────────────
  const goplus = await checkGoPlus(tokenAddress, chain);
  if (!goplus.passed && goplus.reason !== "No GoPlus data found") {
    await logSkip(tokenAddress, chain, goplus.reason ?? "GoPlus failed", { mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplusResult: goplus.details });
    return { passed: false, reason: goplus.reason, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: goplus.details };
  }
  console.log(`✅ GoPlus check passed`);

  // ── Step 4: Solana on-chain ───────────────────────────────────────────────
  if (chain === "solana") {
    const solana = await checkSolanaSecurity(tokenAddress);
    if (!solana.passed) {
      await logSkip(tokenAddress, chain, solana.reason ?? "Solana check failed", { mintAuthority: solana.mintAuthority, freezeAuthority: solana.freezeAuthority, topHolderPercent: solana.topHolderPercent, goplusResult: goplus.details });
      return { passed: false, reason: solana.reason, mintAuthority: solana.mintAuthority, freezeAuthority: solana.freezeAuthority, topHolderPercent: solana.topHolderPercent, goplus: goplus.details };
    }
    console.log(`✅ Solana on-chain check passed`);
    console.log(`🛡️  ALL SECURITY CHECKS PASSED: ${tokenAddress}\n`);
    return { passed: true, mintAuthority: null, freezeAuthority: null, topHolderPercent: solana.topHolderPercent, goplus: goplus.details };
  }

  console.log(`🛡️  ALL SECURITY CHECKS PASSED: ${tokenAddress}\n`);
  return { passed: true, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: goplus.details };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyGoplus(): FullSecurityResult["goplus"] {
  return { isHoneypot: false, isBlacklisted: false, isMintable: false, isLiquidityLocked: false, liquidityBurnt: false, holderCount: 0, topHolderPercent: 0, buyTax: 0, sellTax: 0 };
}

async function logSkip(address: string, chain: string, reason: string, details: { mintAuthority: string | null; freezeAuthority: string | null; topHolderPercent: number; goplusResult: any; }): Promise<void> {
  console.log(`🚫 SECURITY FAILED: ${address} — ${reason}`);
  await supabase.from("security_logs").insert({
    address,
    chain,
    skip_reason:      reason,
    mint_authority:   details.mintAuthority,
    freeze_authority: details.freezeAuthority,
    top_holder_pct:   details.topHolderPercent,
    goplus_result:    details.goplusResult,
    checked_at:       new Date().toISOString(),
  });
}