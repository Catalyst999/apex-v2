import { checkSolanaSecurity } from "./solana";
import { checkGoPlus } from "./goplus";
import { supabase } from "../../db/supabase";

export interface FullSecurityResult {
  passed: boolean;
  reason?: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  topHolderPercent: number;
  goplus: {
    isHoneypot: boolean;
    isBlacklisted: boolean;
    isMintable: boolean;
    buyTax: number;
    sellTax: number;
  };
}

export async function runSecurityCheck(
  tokenAddress: string,
  chain: "solana" | "bsc"
): Promise<FullSecurityResult> {
  console.log(`🔒 Security check: ${tokenAddress}`);

  const goplus = await checkGoPlus(tokenAddress, chain);

  // Only hard fail if GoPlus found something bad — skip if just no data
  if (!goplus.passed && goplus.reason !== "No GoPlus data found") {
    await logSkip(tokenAddress, chain, goplus.reason ?? "GoPlus failed", {
      mintAuthority: null,
      freezeAuthority: null,
      topHolderPercent: 0,
      goplusResult: goplus.details,
    });
    return {
      passed: false,
      reason: goplus.reason,
      mintAuthority: null,
      freezeAuthority: null,
      topHolderPercent: 0,
      goplus: goplus.details,
    };
  }

  if (chain === "solana") {
    const solana = await checkSolanaSecurity(tokenAddress);
    if (!solana.passed) {
      await logSkip(tokenAddress, chain, solana.reason ?? "Solana check failed", {
        mintAuthority: solana.mintAuthority,
        freezeAuthority: solana.freezeAuthority,
        topHolderPercent: solana.topHolderPercent,
        goplusResult: goplus.details,
      });
      return {
        passed: false,
        reason: solana.reason,
        mintAuthority: solana.mintAuthority,
        freezeAuthority: solana.freezeAuthority,
        topHolderPercent: solana.topHolderPercent,
        goplus: goplus.details,
      };
    }

    console.log(`✅ Security passed: ${tokenAddress}`);
    return {
      passed: true,
      mintAuthority: null,
      freezeAuthority: null,
      topHolderPercent: solana.topHolderPercent,
      goplus: goplus.details,
    };
  }

  console.log(`✅ Security passed: ${tokenAddress}`);
  return {
    passed: true,
    mintAuthority: null,
    freezeAuthority: null,
    topHolderPercent: 0,
    goplus: goplus.details,
  };
}

async function logSkip(
  address: string,
  chain: string,
  reason: string,
  details: {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    topHolderPercent: number;
    goplusResult: any;
  }
) {
  await supabase.from("security_logs").insert({
    address,
    chain,
    skip_reason: reason,
    mint_authority: details.mintAuthority,
    freeze_authority: details.freezeAuthority,
    top_holder_pct: details.topHolderPercent,
    goplus_result: details.goplusResult,
  });
}