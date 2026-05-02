// src/core/config.ts
// Catalyst Apex Trader v3.0 — Configuration
// Updated with behavioral intelligence feature flags
// All new flags are OPT-IN to preserve existing Railway deployment

import * as dotenv from "dotenv";
dotenv.config();

// ─── Database ─────────────────────────────────────────────────────────────
export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_KEY = process.env.SUPABASE_KEY!;

// ─── Wallets & Keys ───────────────────────────────────────────────────────
export const TRADING_WALLET = process.env.TRADING_WALLET!;
export const TRADING_KEY = process.env.TRADING_KEY!;
export const MONITORING_WALLET = process.env.MONITORING_WALLET || "";

// ─── APIs ─────────────────────────────────────────────────────────────────
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";
export const MAGIC_EDEN_API_KEY = process.env.MAGIC_EDEN_API_KEY || "";
export const DEXSCREENER_API_KEY = process.env.DEXSCREENER_API_KEY || "";
export const GOPLUS_API_KEY = process.env.GOPLUS_API_KEY || "";

// ─── Telegram ─────────────────────────────────────────────────────────────
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

// ─── Claude API (Haiku) ────────────────────────────────────────────────────
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// ─── Original Feature Flags ────────────────────────────────────────────────
// Keep as-is. Set to "true" in Railway env to enable
export const FEATURE_FLAGS = {
  // Original system flags — unchanged
  enableBundleDetection: process.env.ENABLE_BUNDLE_DETECTION === "true",
  enableDeployerCheck: process.env.ENABLE_DEPLOYER_CHECK === "true",
  useHeliusWebhooks: process.env.USE_HELIUS_WEBHOOKS === "true",
  usePumpFunMonitor: process.env.USE_PUMP_FUN_MONITOR === "true",
  useOutlierV2: process.env.USE_OUTLIER_V2 === "true",
  usePumpFunScanner: process.env.USE_PUMP_FUN_SCANNER === "true",

  // ─── Behavioral Intelligence Stack — All OPT-IN ───────────────────────
  // Set these to "true" in Railway when ready to activate
  useSmartWalletTracker: process.env.USE_SMART_WALLET_TRACKER === "true",
  useNarrativeEngine: process.env.USE_NARRATIVE_ENGINE === "true",

  // Core behavioral intelligence (Phase 1)
  useMarketMemory: process.env.USE_MARKET_MEMORY === "true",
  useEmotionModeler: process.env.USE_EMOTION_MODELER === "true",
  useNarrativeRotation: process.env.USE_NARRATIVE_ROTATION === "true",
  usePvpSurvivalDetector: process.env.USE_PVP_SURVIVAL_DETECTOR === "true",
  useDynamicConviction: process.env.USE_DYNAMIC_CONVICTION === "true",
  usePatternAnticipation: process.env.USE_PATTERN_ANTICIPATION === "true",

  // Advanced features (Phase 2)
  useBullRunIntelligence: process.env.USE_BULL_RUN_INTELLIGENCE === "true",
  usePortfolioCorrelation: process.env.USE_PORTFOLIO_CORRELATION === "true",
  useInsiderDetector: process.env.USE_INSIDER_DETECTOR === "true",
  useMEVProtection: process.env.USE_MEV_PROTECTION === "true",

  // Trading control
  tradingActive: process.env.TRADING_ACTIVE === "true",
  dryRun: process.env.DRY_RUN === "true",
};

// ─── Risk Management ──────────────────────────────────────────────────────
export const RISK_CONFIG = {
  maxPositionSizeUSD: parseInt(process.env.MAX_POSITION_SIZE || "500"),
  maxLossPerTradePercent: parseFloat(process.env.MAX_LOSS_PERCENT || "2"),
  maxOpenPositions: parseInt(process.env.MAX_OPEN_POSITIONS || "5"),
  dailyLossLimit: parseFloat(process.env.DAILY_LOSS_LIMIT || "10"),
  maxLeverageDefault: parseInt(process.env.MAX_LEVERAGE || "3"),
};

// ─── Market Regime Thresholds ──────────────────────────────────────────────
export const MARKET_REGIME = {
  // How to determine overall market health
  minAverageNarrativeScore: 40, // below this = bad regime
  minLiquidityUSD: 50000, // minimum total liquidity to scout
  maxOpenPositionsInBadRegime: 1,
  tradingPauseOnBadRegime: false, // set true to pause when market bad
};

// ─── Narrative Engine Tiers ───────────────────────────────────────────────
export const NARRATIVE_TIERS = {
  // Tier 1: Established, strong narrative (AI, gaming, etc)
  tier1Categories: ["AI", "DEFI", "SOLANA_SPECIFIC"],
  tier1MinScore: 70,
  tier1Multiplier: 1.5, // can be 1.5x more aggressive

  // Tier 2: Medium narrative strength
  tier2Categories: ["STORY", "INFRA", "L2"],
  tier2MinScore: 50,
  tier2Multiplier: 1.0,

  // Tier 3: Weak/unproven narrative
  tier3Categories: ["SHITCOIN", "MEME", "UNKNOWN"],
  tier3MinScore: 30,
  tier3Multiplier: 0.5, // must be very strong signal to trade
};

// ─── Conviction Scaling Thresholds ────────────────────────────────────────
export const CONVICTION_THRESHOLDS = {
  // Auto-adjust position sizing based on alignment score
  aggressiveMinScore: 80,
  cautiousMinScore: 60,
  defensiveMinScore: 40,
  observationMinScore: 30,
  // Below observationMinScore = INACTIVE
};

// ─── PvP Warfare Detection Sensitivity ────────────────────────────────────
export const PVP_SENSITIVITY = {
  // How aggressive to be in detecting fake breakouts, traps, etc
  fakeBreakoutThreshold: 0.75, // 0-1, higher = more sensitive
  engagementFarmThreshold: 0.70,
  exitTrapThreshold: 0.80,
  spoofedMomentumThreshold: 0.75,
};

// ─── Timing Optimization (from timing.ts) ──────────────────────────────────
export const OPTIMAL_TRADING_WINDOWS = {
  prime: { start: 18, end: 22 }, // 6pm-10pm UTC (best conditions)
  good: { start: 14, end: 18 }, // 2pm-6pm UTC
  prePump: { start: 2, end: 3 }, // 2am-3am UTC (Asian whale activity)
  avoid: { start: 11, end: 14 }, // 11am-2pm UTC (worst conditions)
  dead: { start: 22, end: 2 }, // 10pm-2am UTC (low activity)
};

// ─── Smart Wallet Tracking Thresholds ──────────────────────────────────────
export const SMART_WALLET_CONFIG = {
  minWinRatePercent: 60, // wallet must have 60%+ win rate to be "smart"
  minTradesForReputation: 10, // must have at least 10 trades
  confidenceBoost: 1.5, // multiply score by 1.5 if smart wallet buying
};

// ─── Logging & Debug ──────────────────────────────────────────────────────
export const LOG_CONFIG = {
  verbose: process.env.VERBOSE_LOGS === "true",
  logAllSignals: process.env.LOG_ALL_SIGNALS === "true",
  logToFile: process.env.LOG_TO_FILE === "true",
  logFilePath: "./logs/catalyst-apex.log",
};

// ─── Server Config ────────────────────────────────────────────────────────
export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || "3000"),
  nodeEnv: process.env.NODE_ENV || "production",
};

// ─── Validation ────────────────────────────────────────────────────────────

export function validateConfig(): void {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "TRADING_WALLET",
    "TRADING_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  console.log("✅ Configuration validated successfully");
  console.log(`📊 Feature flags enabled: ${Object.values(FEATURE_FLAGS).filter(Boolean).length}`);
  console.log(`🚀 Trading active: ${FEATURE_FLAGS.tradingActive ? "YES" : "NO (DRY RUN)"}`);
}