import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA } from "../../core/config";

const connection = new Connection(SOLANA.rpcUrl, "confirmed");

export interface SolanaSecurityResult {
  passed: boolean;
  reason?: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  topHolderPercent: number;
}

export async function checkSolanaSecurity(
  tokenAddress: string
): Promise<SolanaSecurityResult> {
  try {
    const mint = new PublicKey(tokenAddress);

    // Retry mint info up to 3 times
    let mintInfo;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        mintInfo = await connection.getParsedAccountInfo(mint);
        break;
      } catch (retryErr: any) {
        if (attempt === 3) throw retryErr;
        console.log(`⏳ Alchemy busy, retrying (${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    const data = (mintInfo!.value?.data as any)?.parsed?.info;

    if (!data) {
      return {
        passed: false,
        reason: "Could not fetch mint info",
        mintAuthority: null,
        freezeAuthority: null,
        topHolderPercent: 0,
      };
    }

    const mintAuthority = data.mintAuthority ?? null;
    const freezeAuthority = data.freezeAuthority ?? null;

    if (mintAuthority !== null) {
      return {
        passed: false,
        reason: "Mint authority NOT revoked — rug risk",
        mintAuthority,
        freezeAuthority,
        topHolderPercent: 0,
      };
    }

    if (freezeAuthority !== null) {
      return {
        passed: false,
        reason: "Freeze authority NOT revoked — rug risk",
        mintAuthority,
        freezeAuthority,
        topHolderPercent: 0,
      };
    }

    // Skip holder check on free tier — pass with 0
    // Will add Birdeye holder check in Phase 3 scoring
    return {
      passed: true,
      mintAuthority: null,
      freezeAuthority: null,
      topHolderPercent: 0,
    };

  } catch (err: any) {
    console.error("❌ Solana security check error:", err.message);
    return {
      passed: false,
      reason: "Security check failed: " + err.message,
      mintAuthority: null,
      freezeAuthority: null,
      topHolderPercent: 0,
    };
  }
} 