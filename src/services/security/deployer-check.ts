// src/services/security/deployer-check.ts
// Catalyst Apex Trader v2.1 — Deployer History Tracker
// FIX: Uses correct Helius Enhanced Transactions API (not deprecated v0 endpoint).

import axios    from "axios";
import { supabase } from "../../db/supabase";
import { HELIUS }   from "../../core/config";

export interface DeployerCheckResult {
  reject:    boolean;
  reason:    string;
  rugRate:   number;
  riskScore: number;
  pattern:   string;
}

interface DeployerProfile {
  address:        string;
  tokens_created: number;
  rug_rate:       number;
  avg_lifespan:   number;
  victims:        number;
  pattern:        string;
  last_active:    number;
  risk_score:     number;
}

// ─── Risk score calculator ────────────────────────────────────────────────────

function calculateRiskScore(profile: Partial<DeployerProfile>): number {
  let score = 0;

  const rugRate       = profile.rug_rate       ?? 0;
  const tokensCreated = profile.tokens_created ?? 0;
  const avgLifespan   = profile.avg_lifespan   ?? 999;
  const victims       = profile.victims        ?? 0;

  score += rugRate * 50;

  if (tokensCreated >= 20)      score += 20;
  else if (tokensCreated >= 10) score += 12;
  else if (tokensCreated >= 5)  score += 6;

  if (avgLifespan <= 0.5)      score += 20;
  else if (avgLifespan <= 2)   score += 14;
  else if (avgLifespan <= 6)   score += 8;

  if (victims >= 500)          score += 10;
  else if (victims >= 100)     score += 6;
  else if (victims >= 20)      score += 3;

  return Math.min(100, Math.round(score));
}

// ─── Helius deployer profiling — FIXED endpoint ───────────────────────────────

async function profileDeployerFromChain(deployerAddress: string): Promise<Partial<DeployerProfile>> {
  try {
    // Step 1: Get signatures via Helius RPC (correct endpoint)
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`;
    const sigRes = await axios.post(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id:      1,
        method:  "getSignaturesForAddress",
        params:  [deployerAddress, { limit: 100 }],
      },
      { timeout: 10000 }
    );

    const signatures: string[] = (sigRes.data?.result ?? []).map((s: any) => s.signature);

    if (signatures.length === 0) {
      return { tokens_created: 0, avg_lifespan: 24, rug_rate: 0, pattern: "unknown", victims: 0, last_active: Math.floor(Date.now() / 1000) };
    }

    // Step 2: Parse a sample via Enhanced API to look for CREATE patterns
    const batchSize = Math.min(signatures.length, 25);
    const txRes = await axios.post(
      `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`,
      { transactions: signatures.slice(0, batchSize) },
      { timeout: 12000 }
    );

    const txs: any[]    = txRes.data ?? [];
    const tokensCreated = txs.filter((tx: any) =>
      (tx.type === "CREATE" || tx.description?.toLowerCase().includes("create"))
    ).length;

    // Estimate avg lifespan from timestamp gaps between create events
    const timestamps = txs
      .filter((tx: any) => tx.timestamp)
      .map((tx: any) => tx.timestamp as number)
      .sort((a, b) => b - a);

    let avgLifespan = 24;
    if (timestamps.length >= 3) {
      const gaps: number[] = [];
      for (let i = 0; i < timestamps.length - 1; i++) {
        gaps.push((timestamps[i] - timestamps[i + 1]) / 3600);
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avgGap < 2) avgLifespan = avgGap;
    }

    const last48h      = Date.now() / 1000 - 48 * 3600;
    const recentTokens = txs.filter((tx: any) => tx.timestamp >= last48h).length;

    const pattern =
      recentTokens >= 5                                 ? "insta-dump"      :
      tokensCreated >= 10 && avgLifespan < 6            ? "serial-rugger"   :
      tokensCreated >= 3                                ? "repeat-deployer" :
      "unknown";

    const rugRate =
      pattern === "insta-dump"      ? 0.9 :
      pattern === "serial-rugger"   ? 0.7 :
      pattern === "repeat-deployer" ? 0.3 :
      0;

    return {
      tokens_created: tokensCreated,
      avg_lifespan:   avgLifespan,
      rug_rate:       rugRate,
      pattern,
      victims:        0,
      last_active:    Math.floor(Date.now() / 1000),
    };
  } catch (err: any) {
    console.warn(`⚠️ Could not profile deployer ${deployerAddress}:`, err.message);
    return {
      tokens_created: 0,
      avg_lifespan:   24,
      rug_rate:       0,
      pattern:        "unknown",
      victims:        0,
      last_active:    Math.floor(Date.now() / 1000),
    };
  }
}

// ─── Rejection thresholds ─────────────────────────────────────────────────────

const REJECT_RUG_RATE   = 0.5;
const REJECT_RISK_SCORE = 70;
const REJECT_PATTERNS   = ["insta-dump", "honeypot", "serial-rugger"];

// ─── Main export ──────────────────────────────────────────────────────────────

export async function checkDeployer(deployerAddress: string): Promise<DeployerCheckResult> {
  try {
    console.log(`👤 Deployer check: ${deployerAddress}`);

    // Fast path — check our DB first
    const { data: existing, error } = await supabase
      .from("deployer_profiles")
      .select("*")
      .eq("address", deployerAddress)
      .single();

    if (existing && !error) {
      const profile = existing as DeployerProfile;

      if (profile.rug_rate >= REJECT_RUG_RATE) {
        console.log(`🚫 Deployer rejected (rug rate): ${(profile.rug_rate * 100).toFixed(0)}%`);
        return { reject: true, reason: `Deployer has ${(profile.rug_rate * 100).toFixed(0)}% rug rate`, rugRate: profile.rug_rate, riskScore: profile.risk_score, pattern: profile.pattern };
      }

      if (profile.risk_score >= REJECT_RISK_SCORE) {
        console.log(`🚫 Deployer rejected (risk score): ${profile.risk_score}/100`);
        return { reject: true, reason: `Deployer risk score: ${profile.risk_score}/100`, rugRate: profile.rug_rate, riskScore: profile.risk_score, pattern: profile.pattern };
      }

      if (REJECT_PATTERNS.includes(profile.pattern)) {
        console.log(`🚫 Deployer rejected (pattern): ${profile.pattern}`);
        return { reject: true, reason: `Deployer pattern: ${profile.pattern}`, rugRate: profile.rug_rate, riskScore: profile.risk_score, pattern: profile.pattern };
      }

      console.log(`✅ Deployer OK (known): score ${profile.risk_score}/100 | pattern: ${profile.pattern}`);
      return { reject: false, reason: "", rugRate: profile.rug_rate, riskScore: profile.risk_score, pattern: profile.pattern };
    }

    // Unknown deployer — profile from chain
    console.log(`🔎 Unknown deployer — profiling from chain...`);
    const chainProfile = await profileDeployerFromChain(deployerAddress);
    const riskScore    = calculateRiskScore(chainProfile);

    const fullProfile: DeployerProfile = {
      address:        deployerAddress,
      tokens_created: chainProfile.tokens_created ?? 0,
      rug_rate:       chainProfile.rug_rate        ?? 0,
      avg_lifespan:   chainProfile.avg_lifespan    ?? 24,
      victims:        chainProfile.victims         ?? 0,
      pattern:        chainProfile.pattern         ?? "unknown",
      last_active:    chainProfile.last_active     ?? Math.floor(Date.now() / 1000),
      risk_score:     riskScore,
    };

    await supabase.from("deployer_profiles").upsert({
      ...fullProfile,
      updated_at: new Date().toISOString(),
    });

    console.log(`📝 Deployer profiled: pattern=${fullProfile.pattern} | rug_rate=${(fullProfile.rug_rate * 100).toFixed(0)}% | risk=${riskScore}/100`);

    if (fullProfile.rug_rate >= REJECT_RUG_RATE) {
      return { reject: true, reason: `New deployer profile: ${(fullProfile.rug_rate * 100).toFixed(0)}% rug rate`, rugRate: fullProfile.rug_rate, riskScore, pattern: fullProfile.pattern };
    }

    if (riskScore >= REJECT_RISK_SCORE) {
      return { reject: true, reason: `New deployer profile: risk score ${riskScore}/100`, rugRate: fullProfile.rug_rate, riskScore, pattern: fullProfile.pattern };
    }

    if (REJECT_PATTERNS.includes(fullProfile.pattern)) {
      return { reject: true, reason: `New deployer profile: pattern ${fullProfile.pattern}`, rugRate: fullProfile.rug_rate, riskScore, pattern: fullProfile.pattern };
    }

    console.log(`✅ Deployer OK (new profile): ${deployerAddress}`);
    return { reject: false, reason: "", rugRate: fullProfile.rug_rate, riskScore, pattern: fullProfile.pattern };

  } catch (err: any) {
    console.error("❌ Deployer check error:", err.message);
    return { reject: false, reason: "", rugRate: 0, riskScore: 0, pattern: "unknown" };
  }
}