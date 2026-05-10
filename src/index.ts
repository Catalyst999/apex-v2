// src/index.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { printConfig } from "./core/config";
import { supabase }    from "./db/supabase";
import { startBot, sendAlert }    from "./services/telegram/bot";
import { eventBus } from "./services/events/event-bus";
import { scanOnChain } from "./services/scanner/onchain-scanner";
// import "./core/signal-queue";
import { startWebsocketMonitoring } from "./services/intelligence/websocket-monitor";
import { TokenDetectedEvent } from "./services/events/signal-types";

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

  console.log("🔍 Initial on-chain scan...");
  try {
    await scanOnChain();
  } catch (error) {
    console.error('[Scanner] Initial scan error:', error);
  }

  console.log("🔌 Starting Solana websocket monitor...");
  await startWebsocketMonitoring();

  console.log("✅ System fully operational - listening for on-chain events");
}

boot();