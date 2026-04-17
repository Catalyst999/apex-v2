// src/services/scanner/helius-webhook.ts
// Catalyst Apex Trader v2.1 — Helius Webhook Service
//
// Replaces DexScreener polling with real-time on-chain detection.
// Helius fires a POST to our Railway URL the moment a new Raydium
// liquidity pool is created — 1-3 seconds after token launch.
//
// How it works:
// 1. We run an Express server on port 3001
// 2. Helius sends a POST request to /webhook every time a new LP is created
// 3. We parse the transaction, extract token address + deployer + pool time
// 4. We call the same security → score → signal pipeline as before
// 5. DexScreener is kept as fallback if Helius data is incomplete

import express, { Request, Response, Application }  from "express";
import axios            from "axios";
import { HELIUS, SERVER, STRATEGY } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookPair {
  tokenAddress:  string;
  poolAddress:   string;
  deployer:      string;
  poolCreatedAt: number;   // unix seconds
  initialSol:    number;   // SOL added to pool at creation
  signature:     string;   // transaction signature
}

// ─── Raydium program IDs ──────────────────────────────────────────────────────
// These are the on-chain program addresses for Raydium AMM and CLMM.
// Helius fires our webhook when transactions involve these programs.

const RAYDIUM_AMM_PROGRAM  = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_CLMM_PROGRAM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

// ─── Webhook server ───────────────────────────────────────────────────────────

export function createWebhookServer(
  onNewPair: (pair: WebhookPair) => Promise<void>
): Application {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // Health check — Railway uses this to confirm the service is running
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "catalyst-apex-trader", timestamp: new Date().toISOString() });
  });

  // Main webhook endpoint — Helius POSTs here on every matching transaction
  app.post("/webhook", async (req: Request, res: Response) => {
    try {
      // Verify the request is from Helius using our secret
      const secret = req.headers["authorization"] ?? req.query.secret;
      if (HELIUS.webhookSecret && secret !== HELIUS.webhookSecret) {
        console.warn("⚠️  Webhook: unauthorized request rejected");
        return res.status(401).json({ error: "unauthorized" });
      }

      const events: any[] = Array.isArray(req.body) ? req.body : [req.body];
      console.log(`📡 Webhook received: ${events.length} event(s)`);

      // Process each event — don't await so we return 200 immediately
      // Helius retries if we don't respond within 10 seconds
      res.status(200).json({ received: events.length });

      for (const event of events) {
        try {
          const pair = parseWebhookEvent(event);
          if (pair) {
            console.log(`🆕 New pair detected via Helius: ${pair.tokenAddress}`);
            await onNewPair(pair);
          }
        } catch (parseErr: any) {
          console.error("❌ Webhook parse error:", parseErr.message);
        }
      }

    } catch (err: any) {
      console.error("❌ Webhook handler error:", err.message);
      res.status(500).json({ error: "internal error" });
    }
  });

  return app;
}

// ─── Event parser ─────────────────────────────────────────────────────────────
// Extracts token address, deployer, and pool creation time from a Helius
// enhanced transaction event.

function parseWebhookEvent(event: any): WebhookPair | null {
  try {
    // Check this event involves Raydium
    const accountKeys: string[] = event?.accountData?.map((a: any) => a.account) ?? [];
    const instructions: any[]   = event?.instructions ?? [];

    const isRaydium = accountKeys.includes(RAYDIUM_AMM_PROGRAM) ||
                      accountKeys.includes(RAYDIUM_CLMM_PROGRAM) ||
                      instructions.some((ix: any) =>
                        ix.programId === RAYDIUM_AMM_PROGRAM ||
                        ix.programId === RAYDIUM_CLMM_PROGRAM
                      );

    if (!isRaydium) return null;

    // Extract token transfers to find the new token
    const tokenTransfers: any[] = event?.tokenTransfers ?? [];
    if (tokenTransfers.length === 0) return null;

    // The new token is the one that isn't SOL (native mint)
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const newTokenTransfer = tokenTransfers.find(
      (t: any) => t.mint && t.mint !== SOL_MINT
    );
    if (!newTokenTransfer) return null;

    const tokenAddress  = newTokenTransfer.mint as string;
    const deployer      = event?.feePayer ?? event?.signers?.[0] ?? "";
    const poolCreatedAt = event?.timestamp ?? Math.floor(Date.now() / 1000);
    const signature     = event?.signature ?? "";

    // Calculate initial SOL added — sum of SOL transfers in this tx
    const solTransfer = tokenTransfers.find((t: any) => t.mint === SOL_MINT);
    const initialSol  = solTransfer ? Math.abs(Number(solTransfer.tokenAmount)) / 1e9 : 0;

    // Reject dust pools — less than 1 SOL initial liquidity
    if (initialSol < 1) return null;

    // Extract pool address from account keys
    // The pool address is typically the first non-program account key
    const programIds    = [RAYDIUM_AMM_PROGRAM, RAYDIUM_CLMM_PROGRAM];
    const poolAddress   = accountKeys.find(
      (key) => !programIds.includes(key) && key !== deployer
    ) ?? "";

    return { tokenAddress, poolAddress, deployer, poolCreatedAt, initialSol, signature };

  } catch (err: any) {
    console.error("❌ Event parse error:", err.message);
    return null;
  }
}

// ─── Helius webhook registration ──────────────────────────────────────────────
// Call this once to tell Helius where to send events.
// Registers our Railway URL with Helius API.

export async function registerHeliusWebhook(): Promise<string | null> {
  try {
    if (!HELIUS.apiKey) {
      console.error("❌ HELIUS_API_KEY not set — cannot register webhook");
      return null;
    }
    if (!SERVER.publicUrl) {
      console.error("❌ PUBLIC_URL not set — cannot register webhook");
      return null;
    }

    const webhookUrl = `${SERVER.publicUrl}/webhook`;
    console.log(`📡 Registering Helius webhook: ${webhookUrl}`);

    // Check if webhook already exists
    const listRes = await axios.get(
      `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS.apiKey}`
    );
    const existing = (listRes.data ?? []).find(
      (w: any) => w.webhookURL === webhookUrl
    );

    if (existing) {
      console.log(`✅ Webhook already registered (ID: ${existing.webhookID})`);
      return existing.webhookID;
    }

    // Register new webhook
    const res = await axios.post(
      `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS.apiKey}`,
      {
        webhookURL:         webhookUrl,
        transactionTypes:   ["Any"],
        accountAddresses:   [RAYDIUM_AMM_PROGRAM, RAYDIUM_CLMM_PROGRAM],
        webhookType:        "enhanced",
        authHeader:         HELIUS.webhookSecret,
      }
    );

    const webhookId = res.data?.webhookID;
    console.log(`✅ Helius webhook registered successfully (ID: ${webhookId})`);
    return webhookId;

  } catch (err: any) {
    console.error("❌ Webhook registration failed:", err.message);
    return null;
  }
}

// ─── Fetch full pair data from DexScreener ────────────────────────────────────
// After Helius fires, we still need price/volume/liquidity data.
// DexScreener fills in the market data after the on-chain detection.

export async function enrichPairFromDexScreener(tokenAddress: string): Promise<any | null> {
  try {
    // Wait 3 seconds for DexScreener to index the new pair
    await new Promise((r) => setTimeout(r, 3000));

    const res = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`,
      { timeout: 10000 }
    );

    const pairs: any[] = res.data ?? [];
    return pairs[0] ?? null;

  } catch (err: any) {
    console.error(`❌ DexScreener enrichment failed for ${tokenAddress}:`, err.message);
    return null;
  }
}