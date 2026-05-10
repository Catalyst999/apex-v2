// src/services/scanner/helius-webhook.ts

import { Request, Response } from 'express';
import express, { Application } from "express";
import axios                    from "axios";
import { HELIUS, SERVER }       from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookPair {
  tokenAddress:  string;
  poolAddress:   string;
  deployer:      string;
  poolCreatedAt: number;
  initialSol:    number;
  signature:     string;
}

// ─── Raydium program IDs ──────────────────────────────────────────────────────

const RAYDIUM_AMM_PROGRAM  = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_CLMM_PROGRAM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

// ─── Webhook server ───────────────────────────────────────────────────────────

export function createWebhookServer(
  onNewPair: (pair: WebhookPair) => Promise<void>
): Application {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "catalyst-apex-trader", timestamp: new Date().toISOString() });
  });

  app.post("/webhook", async (req: Request, res: Response) => {
    try {
      const secret = req.headers["authorization"] ?? req.query.secret;
      if (HELIUS.WEBHOOK_SECRET && secret !== HELIUS.WEBHOOK_SECRET) {
        console.warn("⚠️  Webhook: unauthorized request rejected");
        return res.status(401).json({ error: "unauthorized" });
      }

      const events: any[] = Array.isArray(req.body) ? req.body : [req.body];
      console.log(`📡 Webhook received: ${events.length} event(s)`);

      // Respond immediately — Helius retries if no response within 10s
      res.status(200).json({ received: events.length });

      for (const event of events) {
        try {
          const pair = parseWebhookEvent(event);
          if (pair) {
            console.log(`🆕 New pair via Helius: ${pair.tokenAddress}`);
            await onNewPair(pair);
          }
        } catch (parseErr: any) {
          console.error("❌ Webhook parse error:", parseErr.message);
        }
      }

    } catch (err: any) {
      console.error("❌ Webhook handler error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: "internal error" });
    }
  });

  return app;
}

// ─── Event parser ─────────────────────────────────────────────────────────────

function parseWebhookEvent(event: any): WebhookPair | null {
  try {
    const accountKeys: string[] = event?.accountData?.map((a: any) => a.account) ?? [];
    const instructions: any[]   = event?.instructions ?? [];

    const isRaydium =
      accountKeys.includes(RAYDIUM_AMM_PROGRAM) ||
      accountKeys.includes(RAYDIUM_CLMM_PROGRAM) ||
      instructions.some((ix: any) =>
        ix.programId === RAYDIUM_AMM_PROGRAM ||
        ix.programId === RAYDIUM_CLMM_PROGRAM
      );

    if (!isRaydium) return null;

    const tokenTransfers: any[] = event?.tokenTransfers ?? [];
    if (tokenTransfers.length === 0) return null;

    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const newTokenTransfer = tokenTransfers.find(
      (t: any) => t.mint && t.mint !== SOL_MINT
    );
    if (!newTokenTransfer) return null;

    const tokenAddress  = newTokenTransfer.mint as string;
    const deployer      = event?.feePayer ?? event?.signers?.[0] ?? "";
    const poolCreatedAt = event?.timestamp ?? Math.floor(Date.now() / 1000);
    const signature     = event?.signature ?? "";

    const solTransfer = tokenTransfers.find((t: any) => t.mint === SOL_MINT);
    const initialSol  = solTransfer ? Math.abs(Number(solTransfer.tokenAmount)) / 1e9 : 0;

    if (initialSol < 1) return null;

    const programIds  = [RAYDIUM_AMM_PROGRAM, RAYDIUM_CLMM_PROGRAM];
    const poolAddress = accountKeys.find(
      (key) => !programIds.includes(key) && key !== deployer
    ) ?? "";

    return { tokenAddress, poolAddress, deployer, poolCreatedAt, initialSol, signature };

  } catch (err: any) {
    console.error("❌ Event parse error:", err.message);
    return null;
  }
}

// ─── Webhook registration ─────────────────────────────────────────────────────

export async function registerHeliusWebhook(): Promise<string | null> {
  try {
    if (!HELIUS.API_KEY) {
      console.error("❌ HELIUS_API_KEY not set");
      return null;
    }
    if (!SERVER.publicUrl) {
      console.error("❌ PUBLIC_URL not set");
      return null;
    }

    const webhookUrl = `${SERVER.publicUrl}/webhook`;
    console.log(`📡 Registering Helius webhook: ${webhookUrl}`);

    const listRes = await axios.get(
      `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS.API_KEY}`
    );
    const existing = (listRes.data ?? []).find(
      (w: any) => w.webhookURL === webhookUrl
    );

    if (existing) {
      console.log(`✅ Webhook already registered (ID: ${existing.webhookID})`);
      return existing.webhookID;
    }

    const res = await axios.post(
      `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS.API_KEY}`,
      {
        webhookURL:       webhookUrl,
        transactionTypes: ["Any"],
        accountAddresses: [RAYDIUM_AMM_PROGRAM, RAYDIUM_CLMM_PROGRAM],
        webhookType:      "enhanced",
        authHeader:       HELIUS.WEBHOOK_SECRET,
      }
    );

    const webhookId = res.data?.webhookID;
    console.log(`✅ Helius webhook registered (ID: ${webhookId})`);
    return webhookId;

  } catch (err: any) {
    console.error("❌ Webhook registration failed:", err.message);
    return null;
  }
}

// ─── DexScreener enrichment ───────────────────────────────────────────────────

export async function enrichPairFromDexScreener(tokenAddress: string): Promise<any | null> {
  try {
    await new Promise((r) => setTimeout(r, 3000));

    const res = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`,
      { timeout: 10000 }
    );

    const pairs: any[] = res.data ?? [];
    return pairs[0] ?? null;

  } catch (err: any) {
    console.error(`❌ DexScreener enrichment failed: ${err.message}`);
    return null;
  }
}