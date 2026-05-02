// src/services/security/index.ts
// Catalyst Apex Trader v2.1 — Security Pipeline
//
// Order: bundle → deployer → GoPlus → Solana on-chain
//
// KEY CHANGE: Outlier Fast-Track
// Tokens flagged as Tier 1 narrative matches OR smart wallet buys
// skip the bundle check entirely and go straight to GoPlus + Solana.
// This is what would have let SPACEX, CR7, mexicanunc through.

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
  fastTracked?:     boolean;   // true = skipped bundle/deployer due to narrative/smart wallet
}

// ─── Main security check ──────────────────────────────────────────────────────

export async function runSecurityCheck(
  tokenAddress:   string,
  chain:          "solana" | "bsc",
  poolCreatedAt?: number,
  deployer?:      string,
  pair?:          any,          // Pass pair data for momentum override
  skipBundle?:    boolean,      // True for Tier 1 narrative / smart wallet fast-track
): Promise<FullSecurityResult> {
  console.log(`\n🔒 Running security checks: ${tokenAddress}`);

  // ── FAST TRACK: Narrative Tier 1 or Smart Wallet buy ────────────────────────
  // Skip bundle + deployer checks. Go straight to honeypot/mint checks.
  if (skipBundle) {
    console.log(`⚡ FAST TRACK: skipping bundle + deployer checks (narrative/smart wallet override)`);

    const goplus = await checkGoPlus(tokenAddress, chain);
    if (!goplus.passed && goplus.reason !== "No GoPlus data found") {
      await logSkip(tokenAddress, chain, goplus.reason ?? "GoPlus failed", { mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplusResult: goplus.details });
      return { passed: false, reason: goplus.reason, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: goplus.details, fastTracked: true };
    }
    console.log(`✅ GoPlus check passed (fast track)`);

    if (chain === "solana") {
      const solana = await checkSolanaSecurity(tokenAddress);
      if (!solana.passed) {
        await logSkip(tokenAddress, chain, solana.reason ?? "Solana check failed", { mintAuthority: solana.mintAuthority, freezeAuthority: solana.freezeAuthority, topHolderPercent: solana.topHolderPercent, goplusResult: goplus.details });
        return { passed: false, reason: solana.reason, mintAuthority: solana.mintAuthority, freezeAuthority: solana.freezeAuthority, topHolderPercent: solana.topHolderPercent, goplus: goplus.details, fastTracked: true };
      }
      console.log(`🛡️  FAST TRACK SECURITY PASSED: ${tokenAddress}\n`);
      return { passed: true, mintAuthority: null, freezeAuthority: null, topHolderPercent: solana.topHolderPercent, goplus: goplus.details, fastTracked: true };
    }

    return { passed: true, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: goplus.details, fastTracked: true };
  }

  // ── STANDARD PATH ────────────────────────────────────────────────────────────

  // Step 1: Bundle detection (with momentum override built in)
  if (FEATURE_FLAGS.enableBundleDetection && poolCreatedAt) {
    const bundle = await checkBundle(tokenAddress, poolCreatedAt, pair);
    if (bundle.reject) {
      await logSkip(tokenAddress, chain, bundle.reason, { mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplusResult: null });
      return { passed: false, reason: bundle.reason, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: emptyGoplus(), bundlePattern: bundle.pattern };
    }
    console.log(`✅ Bundle check passed (pattern: ${bundle.pattern})`);
  }

  // Step 2: Deployer history
  if (FEATURE_FLAGS.enableDeployerCheck && deployer) {
    const dep = await checkDeployer(deployer);
    if (dep.reject) {
      await logSkip(tokenAddress, chain, dep.reason, { mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplusResult: null });
      return { passed: false, reason: dep.reason, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: emptyGoplus(), deployerRisk: dep.riskScore, deployerPattern: dep.pattern };
    }
    console.log(`✅ Deployer check passed (risk: ${dep.riskScore}/100 | pattern: ${dep.pattern})`);
  }

  // Step 3: GoPlus API
  const goplus = await checkGoPlus(tokenAddress, chain);
  if (!goplus.passed && goplus.reason !== "No GoPlus data found") {
    await logSkip(tokenAddress, chain, goplus.reason ?? "GoPlus failed", { mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplusResult: goplus.details });
    return { passed: false, reason: goplus.reason, mintAuthority: null, freezeAuthority: null, topHolderPercent: 0, goplus: goplus.details };
  }
  console.log(`✅ GoPlus check passed`);

  // Step 4: Solana on-chain
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

async function logSkip(
  address: string,
  chain:   string,
  reason:  string,
  details: { mintAuthority: string | null; freezeAuthority: string | null; topHolderPercent: number; goplusResult: any; }
): Promise<void> {
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