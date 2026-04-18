import { printConfig } from "./core/config";
import { supabase } from "./db/supabase";
import { startBot } from "./services/telegram/bot";
import { startServer } from "./server";

async function boot() {
  printConfig();

  const { error } = await supabase.from("pairs").select("id").limit(1);
  if (error) {
    console.error("❌ Supabase connection failed:", error.message);
    return;
  }
  console.log("✅ Supabase connected");

  startServer();
  await startBot();
}

boot();



console.log("DEBUG ENV:", {
  ENABLE_BUNDLE_DETECTION: process.env.ENABLE_BUNDLE_DETECTION,
  ENABLE_DEPLOYER_CHECK:   process.env.ENABLE_DEPLOYER_CHECK,
  USE_HELIUS_WEBHOOKS:     process.env.USE_HELIUS_WEBHOOKS,
});