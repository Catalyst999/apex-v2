import * as dotenv from "dotenv";
import * as fs from "fs";
import { Keypair } from "@solana/web3.js";
dotenv.config();

// ─── Helper ──────────────────────────────────────────────────────────────────
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env variable: ${key}`);
  return value;
}

// ─── Solana Keypair Loader ────────────────────────────────────────────────────
function loadSolanaKeypair(): Keypair {
  // Railway cloud — load from env variable
  if (process.env.SOLANA_PRIVATE_KEY) {
    const parsed = JSON.parse(process.env.SOLANA_PRIVATE_KEY);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  // Local dev — load from file
  const keyPath = process.env.SOLANA_KEY_PATH ?? "";
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Solana key not found at: ${keyPath}`);
  }
  const raw = fs.readFileSync(keyPath, "utf-8");
  const parsed = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

// ─── Mode ─────────────────────────────────────────────────────────────────────
export type TradeMode = "testing" | "live";
export const MODE = (process.env.TRADE_MODE ?? "testing") as TradeMode;
export const TRADE_AMOUNT_USD = MODE === "live" ? 5 : 3;

// ─── Solana ───────────────────────────────────────────────────────────────────
export const SOLANA = {
  rpcUrl:              requireEnv("ALCHEMY_SOL_RPC"),
  wssUrl:              requireEnv("ALCHEMY_SOL_WSS"),
  keypair:             loadSolanaKeypair(),
  maxSlippageBps:      1000,
  priorityFeeLamports: 1_000_000,
};

// ─── BSC ──────────────────────────────────────────────────────────────────────
export const BSC = {
  rpcUrl:             process.env.BSC_RPC_URL ?? "https://bsc-dataseed1.binance.org",
  privateKey:         requireEnv("BSC_PRIVATE_KEY"),
  maxSlippagePercent: 10,
  gasPriceGwei:       7,
};

// ─── APIs ─────────────────────────────────────────────────────────────────────
export const APIS = {
  dexscreener:   "https://api.dexscreener.com/latest/dex",
  geckoTerminal: "https://api.geckoterminal.com/api/v2",
  goPlus:        "https://api.gopluslabs.io/api/v1",
  coingecko:     "https://api.coingecko.com/api/v3",
  anthropic:     requireEnv("ANTHROPIC_API_KEY"),
};

// ─── Supabase ─────────────────────────────────────────────────────────────────
export const SUPABASE = {
  url:     requireEnv("SUPABASE_URL"),
  anonKey: requireEnv("SUPABASE_ANON_KEY"),
};

// ─── Telegram ─────────────────────────────────────────────────────────────────
export const TELEGRAM = {
  botToken:   requireEnv("TELEGRAM_BOT_TOKEN"),
  chatId:     requireEnv("TELEGRAM_CHAT_ID"),
  miniAppUrl: process.env.MINI_APP_URL ?? "",
};

// ─── Strategy ─────────────────────────────────────────────────────────────────
export const STRATEGY = {
  outlier: {
    maxAgeMinutes:  10,
    minVolLiqRatio: 1.5,
    minBrandScore:  65,
  },
  standard: {
    minConfidenceScore:   55,
    takeProfitMultiplier: 2,
    stopLossPercent:      30,
  },
  moonbag: {
    triggerMultiplier:   2,
    sellPercent:         50,
    trailingStopPercent: 25,
    minSolLamports:      10_000,
  },
  security: {
    maxTopHolderPercent: 15,
  },
};

// ─── Helius ───────────────────────────────────────────────────────────────────
// Used for bundle detection, deployer profiling, and (later) real-time webhooks.
export const HELIUS = {
  apiKey:        process.env.HELIUS_API_KEY        ?? "",
  rpcUrl:        process.env.HELIUS_RPC_URL        ?? "",
  webhookSecret: process.env.HELIUS_WEBHOOK_SECRET ?? "",
};

// ─── Server ───────────────────────────────────────────────────────────────────
// Used when Helius webhooks are active — Railway needs a public URL + open port.
export const SERVER = {
  publicUrl:   process.env.PUBLIC_URL    ?? "",
  webhookPort: parseInt(process.env.WEBHOOK_PORT ?? "3001"),
};

// ─── Feature Flags ────────────────────────────────────────────────────────────
// Turn each upgrade on/off via .env without touching code.
// Start with bundle + deployer set to true. Leave the rest false for now.
export const FEATURE_FLAGS = {
  enableBundleDetection: process.env.ENABLE_BUNDLE_DETECTION === "true",
  enableDeployerCheck:   process.env.ENABLE_DEPLOYER_CHECK   === "true",
  useHeliusWebhooks:     process.env.USE_HELIUS_WEBHOOKS     === "true",
  usePumpFunMonitor:     process.env.USE_PUMP_FUN_MONITOR    === "true",
  useOutlierV2:          process.env.USE_OUTLIER_V2          === "true",
};

// ─── Boot Log ─────────────────────────────────────────────────────────────────
export function printConfig(): void {
  console.log(`
╔══════════════════════════════════════╗
║     CATALYST APEX TRADER — ONLINE    ║
╠══════════════════════════════════════╣
║ Mode         : ${MODE.toUpperCase().padEnd(22)}║
║ Trade Amount : $${String(TRADE_AMOUNT_USD).padEnd(21)}║
║ SOL Wallet   : ${SOLANA.keypair.publicKey.toBase58().slice(0, 20)}...  ║
║ Bundle Check : ${(FEATURE_FLAGS.enableBundleDetection ? "ON" : "OFF").padEnd(22)}║
║ Deployer Chk : ${(FEATURE_FLAGS.enableDeployerCheck   ? "ON" : "OFF").padEnd(22)}║
╚══════════════════════════════════════╝
  `);
}