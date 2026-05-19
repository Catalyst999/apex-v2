/**
 * CONFIGURATION - CATALYST APEX TRADER
 * Clean, hierarchical, event-first, deterministic-first
 * 
 * DO NOT store secrets here. Use environment variables.
 * DO NOT add feature flags without documenting them.
 * DO NOT modify this without understanding the impact.
 */

import { readFileSync } from 'fs';
import { Keypair } from '@solana/web3.js';

// ============================================================================
// ENVIRONMENT VARIABLES LOADER
// ============================================================================

function loadSolanaKeypair(): Keypair | null {
  const secretKeyJson = process.env.SOLANA_KEYPAIR_SECRET?.trim();
  const keyPath = process.env.SOLANA_KEY_PATH?.trim();

  if (secretKeyJson) {
    try {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKeyJson)));
    } catch (error) {
      console.error('[Config] Invalid SOLANA_KEYPAIR_SECRET:', error);
    }
  }

  if (keyPath) {
    try {
      const fileContents = readFileSync(keyPath, 'utf8').trim();
      if (fileContents) {
        const secretArray = JSON.parse(fileContents);
        return Keypair.fromSecretKey(Uint8Array.from(secretArray));
      }
    } catch (error) {
      console.error(`[Config] Failed to read SOLANA_KEY_PATH="${keyPath}":`, error);
    }
  }

  return null;
}

function envOrEmpty(key: string): string {
  return process.env[key]?.trim() || '';
}

function isPlaceholderEnv(value: string): boolean {
  const placeholderValues = [
    'https://your-project.supabase.co',
    'your-project.supabase.co',
    'your-service-role-key',
    'service-role-key',
    'your-anon-key',
    'anon-key',
    'postgresql://postgres:password@localhost:5432/postgres',
  ];

  return placeholderValues.includes(value.trim().toLowerCase());
}

const SOLANA_KEYPAIR = loadSolanaKeypair();

// ============================================================================
// INFRASTRUCTURE LAYER
// ============================================================================

export const INFRASTRUCTURE = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  VERSION: process.env.VERSION || '1.0.0',
  BUILD: process.env.BUILD || 'development',
  ORACLE_REGION: process.env.ORACLE_REGION || 'us-phoenix-1',
  CLOUDFLARE_ENABLED: process.env.CLOUDFLARE_ENABLED === 'true',
  BOT_STARTED_AT: new Date().toISOString(),
};

// ============================================================================
// SUPABASE (External Cloud, Not Self-Hosted)
// ============================================================================

const supabaseServiceKey = envOrEmpty('SUPABASE_SERVICE_KEY') || envOrEmpty('SUPABASE_API_KEY');
const supabaseAnonKey = envOrEmpty('NEXT_PUBLIC_SUPABASE_ANON_KEY') || envOrEmpty('SUPABASE_ANON_KEY');

export const SUPABASE = {
  URL: envOrEmpty('SUPABASE_URL'),
  ANON_KEY: envOrEmpty('SUPABASE_ANON_KEY'),
  SERVICE_KEY: supabaseServiceKey,
};

export const SUPABASE_PUBLIC = {
  URL: envOrEmpty('NEXT_PUBLIC_SUPABASE_URL') || envOrEmpty('SUPABASE_URL'),
  ANON_KEY: supabaseAnonKey,
};

// ============================================================================
// SOLANA RPC (Hybrid Routing: Public + Helius)
// ============================================================================

export const SOLANA = {
  NETWORK: 'mainnet-beta',
  COMMITMENT: 'confirmed' as const,
  
  // Primary RPC endpoints
  RPC_URL: envOrEmpty('RPC_URL') || 'https://api.mainnet-beta.solana.com',
  WS_RPC_URL: envOrEmpty('WS_RPC_URL') || 'wss://api.mainnet-beta.solana.com',
  rpcUrl: envOrEmpty('RPC_URL') || 'https://api.mainnet-beta.solana.com',
  wssUrl: envOrEmpty('WS_RPC_URL') || 'wss://api.mainnet-beta.solana.com',
  
  // Helius (premium RPC, webhooks, enrichment)
  HELIUS_API_KEY: envOrEmpty('HELIUS_API_KEY'),
  HELIUS_WEBHOOK_SECRET: envOrEmpty('HELIUS_WEBHOOK_SECRET'),
  HELIUS_WEBHOOK_URL: envOrEmpty('HELIUS_WEBHOOK_URL'),
  
  // Keypair for execution
  keypair: SOLANA_KEYPAIR,
  
  // Execution parameters
  maxSlippageBps: 100,
  priorityFeeLamports: 10000,
};

// ============================================================================
// WALLETS (Multi-Wallet, Manual + Auto-Discovery)
// ============================================================================

export const WALLETS = {
  // Strict isolation: only one active wallet at a time
  ISOLATION_STRICT: process.env.WALLET_ISOLATION_STRICT !== 'false',
  
  // Maximum wallets allowed (3 per project knowledge)
  MAX_WALLETS: parseInt(process.env.MAX_WALLETS || '3'),
  
  // Automatic smart wallet discovery
  AUTO_DISCOVERY_ENABLED: process.env.WALLET_AUTO_DISCOVERY === 'true',
  
  // Wallet startup behavior
  REQUIRE_WALLET_SELECTION: true, // Prompt user at boot
  REMEMBER_LAST_WALLET: process.env.REMEMBER_LAST_WALLET === 'true',
};

// ============================================================================
// AI LAYER (Gemini as Analyst Overlay Only)
// ============================================================================

export const AI = {
  // Gemini Configuration (primary AI)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: 'gemini-2.0-flash',
  GEMINI_ENABLED: !!process.env.GEMINI_API_KEY,
  
  // Fallback to Anthropic/Claude (secondary)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: 'claude-3-5-haiku-20241022',
  ANTHROPIC_ENABLED: !!process.env.ANTHROPIC_API_KEY,
  
  // Grok (if available)
  GROK_API_KEY: process.env.GROK_API_KEY || '',
  GROK_ENABLED: !!process.env.GROK_API_KEY,
  
  // CRITICAL: AI RESTRICTIONS
  // These MUST remain false. AI is analyst layer only.
  USE_AI_FOR_SCORING: false,
  USE_AI_FOR_EXECUTION: false,
  USE_AI_FOR_RISK: false,
  USE_AI_FOR_ROUTING: false,
  USE_AI_FOR_THRESHOLDS: false,
  
  // ALLOWED: AI uses only
  USE_AI_FOR_SUMMARIZATION: true,
  USE_AI_FOR_JOURNALING: true,
  USE_AI_FOR_INTERPRETATION: true,
  USE_AI_FOR_NARRATIVE_ANALYSIS: true,
  USE_AI_FOR_BEHAVIORAL_INSIGHTS: true,
  
  // Token limits (daily)
  GEMINI_TOKEN_LIMIT: parseInt(process.env.GEMINI_TOKEN_LIMIT || '100000'),
  ANTHROPIC_TOKEN_LIMIT: parseInt(process.env.ANTHROPIC_TOKEN_LIMIT || '50000'),
  
  // Timeout
  AI_TIMEOUT_MS: parseInt(process.env.AI_TIMEOUT_MS || '5000'),
};

export const APIS = {
  coingecko: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
  goplus: process.env.GOPLUS_API_URL || 'https://api.goplus.com/v1',
  goPlus: process.env.GOPLUS_API_URL || 'https://api.goplus.com/v1',
  ethereum: process.env.ETHEREUM_API_URL || 'https://api.etherscan.io/api',
  solana: process.env.SOLANA_API_URL || SOLANA.RPC_URL,
  anthropic: process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1',
};

export const TRADE_AMOUNT_USD = parseFloat(process.env.TRADE_AMOUNT_USD || '100');

export const STRATEGY = {
  standard: {
    stopLossPercent: parseFloat(process.env.STANDARD_STOP_LOSS_PERCENT || '5'),
    trailingStopPercent: parseFloat(process.env.STANDARD_TRAILING_STOP_PERCENT || '8'),
  },
  moonbag: {
    trailingStopPercent: parseFloat(process.env.MOONBAG_TRAILING_STOP_PERCENT || '5'),
    minSolLamports: parseInt(process.env.MOONBAG_MIN_SOL_LAMPORTS || '50000000'),
  },
  security: {
    maxTopHolderPercent: parseFloat(process.env.STRATEGY_SECURITY_MAX_TOP_HOLDER_PERCENT || '10'),
  },
};

export const CONVICTION_THRESHOLDS = {
  aggressive: parseFloat(process.env.CONVICTION_THRESHOLD_AGGRESSIVE || '80'),
  cautious: parseFloat(process.env.CONVICTION_THRESHOLD_CAUTIOUS || '60'),
  defensive: parseFloat(process.env.CONVICTION_THRESHOLD_DEFENSIVE || '40'),
  observation: parseFloat(process.env.CONVICTION_THRESHOLD_OBSERVATION || '30'),
};

export const MARKET_REGIME = {
  HEALTHY: 'HEALTHY',
  WARMING: 'WARMING',
  COLD: 'COLD',
  minAverageNarrativeScore: parseFloat(process.env.MIN_AVERAGE_NARRATIVE_SCORE || '50'),
  tradingPauseOnBadRegime: process.env.TRADING_PAUSE_ON_BAD_REGIME === 'true',
  maxOpenPositionsInBadRegime: parseInt(process.env.MAX_OPEN_POSITIONS_IN_BAD_REGIME || '1'),
};

export const HELIUS = {
  apiKey: SOLANA.HELIUS_API_KEY,
  API_KEY: SOLANA.HELIUS_API_KEY,
  webhookSecret: SOLANA.HELIUS_WEBHOOK_SECRET,
  WEBHOOK_SECRET: SOLANA.HELIUS_WEBHOOK_SECRET,
  webhookUrl: SOLANA.HELIUS_WEBHOOK_URL,
  WEBHOOK_URL: SOLANA.HELIUS_WEBHOOK_URL,
};

export const HYBRID_RPC = {
  rpcUrl: SOLANA.RPC_URL,
  wssUrl: SOLANA.WS_RPC_URL,
  PUBLIC_RPC_URL: process.env.PUBLIC_RPC_URL || SOLANA.RPC_URL,
  RPC_MAX_RETRIES: parseInt(process.env.RPC_MAX_RETRIES || '3'),
  RPC_BATCH_SIZE: parseInt(process.env.RPC_BATCH_SIZE || '20'),
  RPC_COOLDOWN_MS: parseInt(process.env.RPC_COOLDOWN_MS || '250'),
  HELIUS_ENRICHMENT_CONVICTION_THRESHOLD: parseFloat(process.env.HELIUS_ENRICHMENT_CONVICTION_THRESHOLD || '70'),
  RPC_URL: SOLANA.RPC_URL,
  WS_RPC_URL: SOLANA.WS_RPC_URL,
};

export const BUNDLE_THRESHOLDS = {
  maxBundleSize: parseInt(process.env.BUNDLE_MAX_SIZE || '5'),
  minBundleValueUsd: parseFloat(process.env.BUNDLE_MIN_VALUE_USD || '1000'),
  momentumOverridePriceChange: parseFloat(process.env.BUNDLE_MOMENTUM_OVERRIDE_PRICE_CHANGE || '0.15'),
  momentumOverrideMinBuys: parseInt(process.env.BUNDLE_MOMENTUM_OVERRIDE_MIN_BUYS || '50'),
  momentumOverrideMinHolders: parseInt(process.env.BUNDLE_MOMENTUM_OVERRIDE_MIN_HOLDERS || '25'),
  momentumOverrideMinVol24h: parseInt(process.env.BUNDLE_MOMENTUM_OVERRIDE_MIN_VOL24H || '1000'),
  sameBlockMinWallets: parseInt(process.env.BUNDLE_SAME_BLOCK_MIN_WALLETS || '3'),
  commonFunderPct: parseFloat(process.env.BUNDLE_COMMON_FUNDER_PCT || '0.25'),
  mirrorAmountsMinCount: parseInt(process.env.BUNDLE_MIRROR_AMOUNTS_MIN_COUNT || '2'),
  freshWalletPct: parseFloat(process.env.BUNDLE_FRESH_WALLET_PCT || '0.25'),
};

export const X_API = {
  key: process.env.X_API_KEY || '',
  bearerToken: process.env.X_API_BEARER_TOKEN || process.env.X_API_KEY || '',
};

// ============================================================================
// EXECUTION & TRADING MODES
// ============================================================================

export const EXECUTION = {
  // System mode: shadow (simulate) | semi-auto (alert+approve) | full-auto (autonomous)
  MODE: (process.env.SYSTEM_MODE || 'shadow') as 'shadow' | 'semi-auto' | 'full-auto' | 'testing',
  
  // Global trading pause (overrides mode)
  TRADING_PAUSED: process.env.TRADING_PAUSED === 'true',
  
  // Dry run: simulate execution without actual blockchain
  DRY_RUN: process.env.DRY_RUN === 'true',
  
  // Live mode (if false, all trades simulated)
  LIVE_TRADING: process.env.LIVE_TRADING === 'true',
  
  // Max slippage for market orders (basis points)
  MAX_SLIPPAGE_BPS: parseInt(process.env.MAX_SLIPPAGE_BPS || '50'),
};

export const MODE = EXECUTION.MODE;

// ============================================================================
// RISK MANAGEMENT (Per-Wallet Strategy)
// ============================================================================

export const RISK = {
  // Position sizing
  MAX_POSITION_USD: parseFloat(process.env.MAX_POSITION_USD || '500'),
  MAX_EXPOSURE_USD: parseFloat(process.env.MAX_EXPOSURE_USD || '5000'),
  MAX_LEVERAGE: parseFloat(process.env.MAX_LEVERAGE || '1'),
  
  // Stop loss / take profit
  STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT || '5'),
  TAKE_PROFIT_PERCENT: parseFloat(process.env.TAKE_PROFIT_PERCENT || '25'),
  
  // Daily loss limit
  MAX_DAILY_LOSS_USD: parseFloat(process.env.MAX_DAILY_LOSS_USD || '1000'),
  
  // Position limits
  MAX_OPEN_POSITIONS: parseInt(process.env.MAX_OPEN_POSITIONS || '5'),
  
  // Regime-based dampening
  ENABLE_REGIME_DAMPENING: process.env.ENABLE_REGIME_DAMPENING !== 'false',
  REGIME_DAMPENING_MULTIPLIER: parseFloat(process.env.REGIME_DAMPENING_MULTIPLIER || '0.5'),
};

export const RISK_CONFIG = {
  maxPositionSizeUSD: RISK.MAX_POSITION_USD,
  maxExposureUSD: RISK.MAX_EXPOSURE_USD,
  maxLeverageDefault: RISK.MAX_LEVERAGE,
  stopLossPercent: RISK.STOP_LOSS_PERCENT,
  takeProfitPercent: RISK.TAKE_PROFIT_PERCENT,
  dailyLossLimit: RISK.MAX_DAILY_LOSS_USD,
};

// ============================================================================
// POSITION SIZING & SURVIVAL EXECUTION
// ============================================================================

export const POSITION_SIZING = {
  // Capital states drive everything
  CAPITAL_STATE_ENABLED: true,
  
  // Position sizing rules (per capital state)
  CONVICTION_MULTIPLIER_ENABLED: true,
  
  // Tomorrow test: Position can't exceed this % in isolation
  TOMORROW_TEST_MAX_PERCENT: 50,
  
  // Anti-spreading: Max simultaneous positions per capital state
  ADAPTIVE_MAX_POSITIONS: true,
  
  // Buy-now test: Evaluate before every update
  BUY_NOW_TEST_ENABLED: true,
  
  // Profit taking: Gradual, intelligent scale-outs
  PROFIT_TAKING_ENABLED: true,
  
  // Psychological: Auto-reduce after losses
  PSYCHOLOGICAL_RISK_MANAGEMENT_ENABLED: true,
  
  // Minimum conviction thresholds (per state, these are base)
  MIN_CONVICTION_OVERRIDE: {
    MICRO: 80,
    SMALL: 70,
    MEDIUM: 60,
    AGGRESSIVE: 50,
    DEFENSIVE: 85,
    DRAWDOWN: 95,
    RECOVERY: 75,
  }
};

// ============================================================================
// SIGNAL GATEWAY (Pre-filtering)
// ============================================================================

export const GATEWAY = {
  // Minimum liquidity to pass gateway (USD)
  MIN_LIQUIDITY_USD: parseFloat(process.env.GATEWAY_MIN_LIQUIDITY || '10000'),
  
  // Minimum holders
  MIN_HOLDERS: parseInt(process.env.GATEWAY_MIN_HOLDERS || '50'),
  
  // Maximum top holder concentration
  MAX_TOP_HOLDER_PERCENT: parseFloat(process.env.GATEWAY_MAX_TOP_HOLDER || '40'),
  
  // Token age minimum (minutes)
  MIN_TOKEN_AGE_MINUTES: parseInt(process.env.GATEWAY_MIN_AGE || '5'),
  
  // Abnormality threshold (0-100, higher = more abnormal)
  ABNORMALITY_THRESHOLD: parseInt(process.env.GATEWAY_ABNORMALITY_THRESHOLD || '50'),
};

// ============================================================================
// INTELLIGENCE ENGINES (Deterministic-First)
// ============================================================================

export const INTELLIGENCE = {
  // Ignition detection
  IGNITION_ENABLED: process.env.IGNITION_ENABLED !== 'false',
  IGNITION_THRESHOLD: parseFloat(process.env.IGNITION_THRESHOLD || '0.75'),
  
  // Revival engine (dormant chart reactivation)
  REVIVAL_ENABLED: process.env.REVIVAL_ENABLED !== 'false',
  REVIVAL_SIGNAL_THRESHOLD: parseInt(process.env.REVIVAL_SIGNAL_THRESHOLD || '75'),
  MAX_DORMANCY_DAYS: parseInt(process.env.REVIVAL_MAX_DORMANCY_DAYS || '90'),
  
  // Narrative tracking
  NARRATIVE_ENABLED: process.env.NARRATIVE_ENABLED !== 'false',
  NARRATIVE_MIN_SCORE: parseFloat(process.env.NARRATIVE_MIN_SCORE || '40'),
  
  // Smart money tracking
  SMART_MONEY_ENABLED: process.env.SMART_MONEY_ENABLED !== 'false',
  
  // Market memory
  MARKET_MEMORY_ENABLED: process.env.MARKET_MEMORY_ENABLED !== 'false',
  PATTERN_MIN_CONFIDENCE: parseFloat(process.env.PATTERN_MIN_CONFIDENCE || '0.3'),
  
  // Conviction scoring
  CONVICTION_ENABLED: process.env.CONVICTION_ENABLED !== 'false',
  CONVICTION_WEIGHT_IGNITION: parseFloat(process.env.CONVICTION_WEIGHT_IGNITION || '0.3'),
  CONVICTION_WEIGHT_NARRATIVE: parseFloat(process.env.CONVICTION_WEIGHT_NARRATIVE || '0.25'),
  CONVICTION_WEIGHT_MEMORY: parseFloat(process.env.CONVICTION_WEIGHT_MEMORY || '0.25'),
  CONVICTION_WEIGHT_REGIME: parseFloat(process.env.CONVICTION_WEIGHT_REGIME || '0.2'),
};

export const REVIVAL_ENGINE = {
  enabled: INTELLIGENCE.REVIVAL_ENABLED,
  ENABLE_REVIVAL_ENGINE: INTELLIGENCE.REVIVAL_ENABLED,
  signalThreshold: INTELLIGENCE.REVIVAL_SIGNAL_THRESHOLD,
  SIGNAL_THRESHOLD: INTELLIGENCE.REVIVAL_SIGNAL_THRESHOLD,
  maxDormancyDays: INTELLIGENCE.MAX_DORMANCY_DAYS,
  MAX_DORMANCY_DAYS: INTELLIGENCE.MAX_DORMANCY_DAYS,
  MAX_WATCHLIST_SIZE: parseInt(process.env.REVIVAL_MAX_WATCHLIST_SIZE || '100'),
};

export const FEATURE_FLAGS = {
  ...AI,
  revivalEnabled: INTELLIGENCE.REVIVAL_ENABLED,
  smartMoneyEnabled: INTELLIGENCE.SMART_MONEY_ENABLED,
  marketMemoryEnabled: INTELLIGENCE.MARKET_MEMORY_ENABLED,
  usePumpFunScanner: process.env.USE_PUMP_FUN_SCANNER === 'true',
  useEmotionModeler: process.env.USE_EMOTION_MODELER === 'true',
  useNarrativeRotation: process.env.USE_NARRATIVE_ROTATION === 'true',
};

// ============================================================================
// TELEGRAM (Alerts & Control)
// ============================================================================

export const TELEGRAM = {
  // Bot token
  BOT_TOKEN: envOrEmpty('TELEGRAM_BOT_TOKEN'),
  botToken: envOrEmpty('TELEGRAM_BOT_TOKEN'),
  chatId: envOrEmpty('TELEGRAM_CHAT_ID'),
  
  // Authorized chat IDs (comma-separated)
  ALLOWED_CHAT_IDS: (envOrEmpty('ALLOWED_CHAT_IDS') || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),
  ALLOWED_CHATS: (envOrEmpty('ALLOWED_CHATS') || envOrEmpty('ALLOWED_CHAT_IDS') || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean),
  
  // Alert types
  SEND_SIGNAL_ALERTS: process.env.SEND_SIGNAL_ALERTS !== 'false',
  SEND_TRADE_ALERTS: process.env.SEND_TRADE_ALERTS !== 'false',
  SEND_ERROR_ALERTS: process.env.SEND_ERROR_ALERTS !== 'false',
  SEND_HEALTH_ALERTS: process.env.SEND_HEALTH_ALERTS !== 'false',
};

// ============================================================================
// SERVER (HTTP/Webhooks)
// ============================================================================

export const SERVER = {
  PORT: parseInt(process.env.PORT || '3000'),
  HOST: '0.0.0.0',
  ENVIRONMENT: process.env.NODE_ENV || 'development',
  PUBLIC_URL: process.env.PUBLIC_URL || `http://localhost:${parseInt(process.env.PORT || '3000')}`,
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${parseInt(process.env.PORT || '3000')}`,
};

// ============================================================================
// VALIDATION & BOOT CHECKS
// ============================================================================

export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Critical infrastructure
  if (!SUPABASE.URL) errors.push('SUPABASE_URL is required');
  if (!SUPABASE.SERVICE_KEY) errors.push('SUPABASE_SERVICE_KEY is required');

  if (SUPABASE.URL && isPlaceholderEnv(SUPABASE.URL)) {
    errors.push('SUPABASE_URL is still using a placeholder value. Replace it with your real Supabase project URL.');
  }

  if (SUPABASE.SERVICE_KEY && isPlaceholderEnv(SUPABASE.SERVICE_KEY)) {
    errors.push('SUPABASE_SERVICE_KEY is still using a placeholder value. Replace it with your real Supabase service key.');
  }

  if (process.env.SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('[Config] Warning: SUPABASE_ANON_KEY is deprecated for backend config. Use NEXT_PUBLIC_SUPABASE_ANON_KEY for frontend only.');
  } else if (process.env.SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('[Config] Warning: SUPABASE_ANON_KEY is deprecated and ignored in favor of NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  if (process.env.SUPABASE_API_KEY && !process.env.SUPABASE_SERVICE_KEY) {
    console.warn('[Config] Warning: SUPABASE_API_KEY is deprecated. Using it as SUPABASE_SERVICE_KEY for backend service auth.');
  } else if (process.env.SUPABASE_API_KEY && process.env.SUPABASE_SERVICE_KEY) {
    console.warn('[Config] Warning: SUPABASE_API_KEY is deprecated and ignored in favor of SUPABASE_SERVICE_KEY.');
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is required when NEXT_PUBLIC_SUPABASE_ANON_KEY is provided.');
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is required when NEXT_PUBLIC_SUPABASE_URL is provided.');
  }

  // Critical integrations
  if (!TELEGRAM.BOT_TOKEN) {
    console.warn('[Config] Warning: TELEGRAM_BOT_TOKEN is not set. Telegram alerts and bot commands will be disabled.');
  }

  // RPC
  if (!SOLANA.RPC_URL) errors.push('RPC_URL is required');

  // AI (at least one should be configured)
  const aiConfigured = AI.GEMINI_ENABLED || AI.ANTHROPIC_ENABLED;
  if (!aiConfigured) {
    console.warn('[Config] Warning: No AI provider configured (GEMINI_API_KEY or ANTHROPIC_API_KEY)');
    console.warn('[Config] System will run without AI interpretation layer');
  }

  // Wallet constraints
  if (WALLETS.MAX_WALLETS < 1) errors.push('MAX_WALLETS must be at least 1');
  if (WALLETS.MAX_WALLETS > 10) errors.push('MAX_WALLETS capped at 10 for safety');

  // Risk constraints
  if (RISK.MAX_POSITION_USD <= 0) errors.push('MAX_POSITION_USD must be > 0');
  if (RISK.MAX_LEVERAGE < 1) errors.push('MAX_LEVERAGE must be >= 1');
  if (RISK.STOP_LOSS_PERCENT <= 0 || RISK.STOP_LOSS_PERCENT > 50) {
    errors.push('STOP_LOSS_PERCENT should be between 0-50%');
  }

  // Execution mode
  if (!['shadow', 'semi-auto', 'full-auto'].includes(EXECUTION.MODE)) {
    errors.push(`SYSTEM_MODE must be: shadow | semi-auto | full-auto (got ${EXECUTION.MODE})`);
  }

  if (process.env.EXECUTION_MODE) {
    errors.push('EXECUTION_MODE is deprecated. Use SYSTEM_MODE only as the single execution source of truth.');
  }

  if (EXECUTION.MODE === 'full-auto' && INFRASTRUCTURE.NODE_ENV !== 'production') {
    errors.push('SYSTEM_MODE=full-auto is not allowed in non-production environments.');
  }

  if (EXECUTION.MODE === 'full-auto' && EXECUTION.TRADING_PAUSED) {
    errors.push('SYSTEM_MODE=full-auto cannot run when TRADING_PAUSED=true.');
  }

  if (EXECUTION.DRY_RUN && EXECUTION.LIVE_TRADING) {
    errors.push('DRY_RUN and LIVE_TRADING cannot both be true.');
  }

  // AI safety checks
  if (AI.USE_AI_FOR_SCORING) errors.push('AI.USE_AI_FOR_SCORING must be false (safety)');
  if (AI.USE_AI_FOR_EXECUTION) errors.push('AI.USE_AI_FOR_EXECUTION must be false (safety)');
  if (AI.USE_AI_FOR_RISK) errors.push('AI.USE_AI_FOR_RISK must be false (safety)');

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// BOOT DIAGNOSTICS
// ============================================================================

export function printConfig(): void {
  const modeColors = {
    shadow: '🌑',
    'semi-auto': '⚠️',
    'full-auto': '🤖',
  };

  const modeEmoji = modeColors[EXECUTION.MODE as keyof typeof modeColors] || '❓';

  console.log(`
╔════════════════════════════════════════════════════════════╗
║       CATALYST APEX TRADER - BOOTSTRAP DIAGNOSTICS         ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║ 🎯 EXECUTION                                              ║
║    Mode: ${modeEmoji} ${EXECUTION.MODE.padEnd(40)} ║
║    Trading Paused: ${String(EXECUTION.TRADING_PAUSED).padEnd(38)} ║
║    Dry Run: ${String(EXECUTION.DRY_RUN).padEnd(44)} ║
║                                                            ║
║ 💼 WALLETS                                                ║
║    Max Wallets: ${String(WALLETS.MAX_WALLETS).padEnd(43)} ║
║    Isolation Strict: ${String(WALLETS.ISOLATION_STRICT).padEnd(35)} ║
║    Auto-Discovery: ${String(WALLETS.AUTO_DISCOVERY_ENABLED).padEnd(37)} ║
║                                                            ║
║ 🧠 AI LAYER                                               ║
║    Gemini: ${String(AI.GEMINI_ENABLED).padEnd(46)} ║
║    Claude: ${String(AI.ANTHROPIC_ENABLED).padEnd(45)} ║
║    Grok: ${String(AI.GROK_ENABLED).padEnd(47)} ║
║    (AI for: analysis, journaling, interpretation only)   ║
║                                                            ║
║ ⚙️  INFRASTRUCTURE                                        ║
║    Environment: ${INFRASTRUCTURE.NODE_ENV.padEnd(41)} ║
║    Supabase: ${String(!!SUPABASE.URL).padEnd(44)} ║
║    Helius RPC: ${String(!!SOLANA.HELIUS_API_KEY).padEnd(42)} ║
║    Telegram: ${String(!!TELEGRAM.BOT_TOKEN).padEnd(43)} ║
║                                                            ║
║ 💰 RISK PARAMETERS                                        ║
║    Max Position: $${String(RISK.MAX_POSITION_USD).padEnd(42)} ║
║    Max Exposure: $${String(RISK.MAX_EXPOSURE_USD).padEnd(41)} ║
║    Max Leverage: ${String(RISK.MAX_LEVERAGE).padEnd(42)} ║
║    Stop Loss: ${String(RISK.STOP_LOSS_PERCENT + '%').padEnd(42)} ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
}