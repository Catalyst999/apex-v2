// src/index.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { printConfig } from "./core/config";
import { supabase }    from "./db/supabase";
import { startBot, sendAlert }    from "./services/telegram/bot";
import { eventBus } from "./services/events/event-bus";
import { scanOnChain } from "./services/scanner/onchain-scanner";

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

    const message = `
🚨 **TRADING SIGNAL DETECTED**

📍 Token: \`${event.token || event.mint}\`
🔍 Source: ${event.source || 'unknown'}
⏰ Time: ${new Date(event.timestamp).toLocaleTimeString()}

Signal detected and logged for analysis.
    `.trim();

    await sendAlert(message);
  });

  // Start signal scanning loop
  console.log("🔍 Starting signal scanning...");
  setInterval(async () => {
    try {
      await scanOnChain();
    } catch (error) {
      console.error("❌ Signal scanning error:", error);
    }
  }, 30000); // Scan every 30 seconds

  console.log("✅ System fully operational - scanning for signals");
}

boot();