// src/index.ts

import { printConfig } from "./core/config";
import { supabase }    from "./db/supabase";
import { startBot }    from "./services/telegram/bot";

async function boot() {
  printConfig();

  const { error } = await supabase.from("pairs").select("id").limit(1);
  if (error) {
    console.error("❌ Supabase connection failed:", error.message);
    return;
  }
  console.log("✅ Supabase connected");

  await startBot();
}

boot();