// src/services/scoring/deployer-reputation.ts
// Catalyst Apex Trader v2.1 — Deployer Reputation Scorer
//
// Instead of only blocking bad deployers, this module REWARDS good ones.
// A deployer with a track record of successful tokens gets a score BOOST.
// This catches serial successful launchers early — before the crowd notices.
//
// Tiers:
// ELITE    — 3+ successful tokens, low rug rate → +25 score boost, skip deployer check
// TRUSTED  — 1-2 successful tokens, clean history → +15 boost
// NEUTRAL  — unknown / first deploy → 0
// RISKY    — mixed history → -10
// BLOCKED  — known rugger → reject (handled by deployer-check.ts)

import { supabase } from "../../db/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeployerTier = "ELITE" | "TRUSTED" | "NEUTRAL" | "RISKY" | "BLOCKED";

export interface DeployerReputation {
  tier:            DeployerTier;
  scoreBoost:      number;      // positive = add to token score
  skipDeployerCheck: boolean;   // ELITE = skip the slow chain check
  successfulTokens: number;
  rugRate:         number;
  reason:          string;
}

// ─── Main reputation lookup ────────────────────────────────────────────────────

export async function getDeployerReputation(
  deployerAddress: string,
): Promise<DeployerReputation> {
  if (!deployerAddress) {
    return neutral("No deployer address");
  }

  try {
    const { data: profile } = await supabase
      .from("deployer_profiles")
      .select("*")
      .eq("address", deployerAddress)
      .single();

    if (!profile) {
      return neutral("First-time deployer — no history");
    }

    const rugRate        = profile.rug_rate        ?? 0;
    const tokensCreated  = profile.tokens_created  ?? 0;
    const riskScore      = profile.risk_score       ?? 0;
    const pattern        = profile.pattern          ?? "unknown";

    // BLOCKED — known rugger, handled upstream by deployer-check.ts
    if (rugRate >= 0.5 || riskScore >= 70 || pattern === "insta-dump" || pattern === "serial-rugger") {
      return {
        tier:              "BLOCKED",
        scoreBoost:        -50,
        skipDeployerCheck: false,
        successfulTokens:  0,
        rugRate,
        reason:            `Known rugger: ${pattern}, ${(rugRate * 100).toFixed(0)}% rug rate`,
      };
    }

    // Count successful tokens from our pairs table (tokens that got alerts = we liked them)
    const { count: successCount } = await supabase
      .from("pairs")
      .select("id", { count: "exact", head: true })
      .eq("deployer", deployerAddress); // requires deployer column on pairs table

    const successful = successCount ?? 0;

    // ELITE — serial successful launcher
    if (successful >= 3 && rugRate < 0.1 && riskScore < 30) {
      return {
        tier:              "ELITE",
        scoreBoost:        25,
        skipDeployerCheck: true,
        successfulTokens:  successful,
        rugRate,
        reason:            `Elite deployer: ${successful} successful launches, ${(rugRate * 100).toFixed(0)}% rug rate`,
      };
    }

    // TRUSTED — 1-2 successful launches, clean
    if (successful >= 1 && rugRate < 0.2 && riskScore < 50) {
      return {
        tier:              "TRUSTED",
        scoreBoost:        15,
        skipDeployerCheck: false,
        successfulTokens:  successful,
        rugRate,
        reason:            `Trusted deployer: ${successful} clean launch(es), risk ${riskScore}/100`,
      };
    }

    // RISKY — mixed signals
    if (rugRate >= 0.2 || riskScore >= 40) {
      return {
        tier:              "RISKY",
        scoreBoost:        -10,
        skipDeployerCheck: false,
        successfulTokens:  successful,
        rugRate,
        reason:            `Risky deployer: ${(rugRate * 100).toFixed(0)}% rug rate, risk ${riskScore}/100`,
      };
    }

    // NEUTRAL
    return neutral(`Known deployer, ${tokensCreated} token(s) created — no strong signal`);

  } catch (err: any) {
    return neutral("DB lookup failed — treating as neutral");
  }
}

function neutral(reason: string): DeployerReputation {
  return {
    tier:              "NEUTRAL",
    scoreBoost:        0,
    skipDeployerCheck: false,
    successfulTokens:  0,
    rugRate:           0,
    reason,
  };
}

// ─── Log successful deploy (called when a token gets a BUY signal) ────────────

export async function recordSuccessfulDeploy(
  deployerAddress: string,
  tokenAddress:    string,
): Promise<void> {
  if (!deployerAddress) return;
  try {
    // Upsert the deployer profile with incremented success count
    const { data: existing } = await supabase
      .from("deployer_profiles")
      .select("tokens_created, rug_rate, risk_score")
      .eq("address", deployerAddress)
      .single();

    if (existing) {
      await supabase.from("deployer_profiles").update({
        tokens_created: (existing.tokens_created ?? 0) + 1,
        // Slightly improve rug rate on success
        rug_rate:       Math.max(0, (existing.rug_rate ?? 0) - 0.05),
        last_active:    Math.floor(Date.now() / 1000),
        updated_at:     new Date().toISOString(),
      }).eq("address", deployerAddress);
    }
  } catch {}
}