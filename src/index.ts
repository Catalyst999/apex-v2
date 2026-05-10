// src/index.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { printConfig, SERVER, HELIUS } from "./core/config";
import { supabase }    from "./db/supabase";
import { startBot, sendAlert }    from "./services/telegram/bot";
import { eventBus } from "./services/events/event-bus";
import { scanOnChain } from "./services/scanner/onchain-scanner";
// import "./core/signal-queue";
import { createWebhookServer, registerHeliusWebhook, WebhookPair } from "./services/scanner/helius-webhook";
import { signalGateway } from "./services/gateway/signal-gateway";
import { startWssMonitor } from "./services/scanner/monitor";
import { TokenDetectedEvent } from "./services/events/signal-types";

async function handleNewPair(pair: WebhookPair): Promise<void> {
  console.log(`[Webhook] New pair received ${pair.tokenAddress} — ${pair.initialSol.toFixed(2)} SOL`);

  try {
    await signalGateway.shouldAnalyze({
      address: pair.tokenAddress,
      mint: pair.tokenAddress,
      name: 'Unknown',
      symbol: 'UNK',
      liquidity: { usd: pair.initialSol * 200, depth: pair.initialSol * 100 },
      deployer: pair.deployer,
      createdAt: pair.poolCreatedAt,
      volume: { m5: 0, h1: 0 },
      buys: { m5: 0 },
      sells: { m5: 0 },
    });
  } catch (error) {
    console.error('[Webhook] Error handling new pair:', (error as Error)?.message || error);
  }
}

async function boot() {
  printConfig();

  const { error } = await supabase.from("pairs").select("id").limit(1);
  if (error) {
    console.error("❌ Supabase connection failed:", error.message);
    return;
  }
  console.log("✅ Supabase connected");

  await startBot();

  // Subscribe to signal events for alerts
  eventBus.subscribe('TOKEN_DETECTED', async (event) => {
    if (event.type !== 'TOKEN_DETECTED') return;
    const detected = event as TokenDetectedEvent;

    const message = `
🚨 **TRADING SIGNAL DETECTED**

📍 Token: \`${detected.token || detected.mint}\`
🔍 Source: ${detected.source || 'unknown'}
⏰ Time: ${new Date(detected.timestamp).toLocaleTimeString()}

Signal detected and logged for analysis.
    `.trim();

    await sendAlert(message);
  });

  const webhookApp = createWebhookServer(handleNewPair);
  webhookApp.listen(SERVER.PORT, () => {
    console.log(`🌐 Webhook server listening on port ${SERVER.PORT}`);
  });

  if (HELIUS.API_KEY && HELIUS.WEBHOOK_SECRET) {
    await registerHeliusWebhook();
  } else {
    console.warn('[Webhook] Helius webhook not registered: HELIUS_API_KEY and HELIUS_WEBHOOK_SECRET are required');
  }

  console.log("🔍 Initial on-chain scan...");
  try {
    await scanOnChain();
  } catch (error) {
    console.error('[Scanner] Initial scan error:', error);
  }

  setInterval(async () => {
    try {
      await scanOnChain();
    } catch (error) {
      console.error('[Scanner] Scheduled scan error:', error);
    }
  }, 60000);

  console.log("🔌 Starting Solana websocket monitor...");
  await startWssMonitor();

  console.log("✅ System fully operational - listening for on-chain events");
}

boot();