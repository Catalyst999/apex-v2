/**
 * CONFIGURATION - HYBRID BACKWARD COMPATIBLE + DELIVERY 1
 * Supports both old imports (SUPABASE, SOLANA, etc.) and new wallet system
 * Ready for production without breaking existing code
 */

/// <reference types="node" />

import { readFileSync } from 'fs';
import { Keypair, PublicKey } from '@solana/web3.js';

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

  if (process.env.SOLANA_KEYPAIR_PUBLIC) {
    console.warn('[Config] SOLANA_KEYPAIR_PUBLIC is set without SOLANA_KEYPAIR_SECRET; public key only is not enough to construct a signing keypair.');
  }

  return null;
}

const SOLANA_KEYPAIR = loadSolanaKeypair();

// ============================================================================
// LEGACY EXPORTS (Backward Compatibility)
// ============================================================================

// SUPABASE CONFIG - For src/db/supabase.ts
export const SUPABASE = {
  URL: process.env.SUPABASE_URL || '',
  ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
};

// SOLANA CONFIG - For execution/scanner modules
export const SOLANA = {
  RPC_URL: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  WS_RPC_URL: process.env.WS_RPC_URL || 'wss://api.mainnet-beta.solana.com',
  NETWORK: 'mainnet-beta',
  COMMITMENT: 'confirmed',
  maxSlippageBps: 100,
  priorityFeeLamports: 10000,
  rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',  // camelCase alias
  wssUrl: process.env.WS_RPC_URL || 'wss://api.mainnet-beta.solana.com', // camelCase alias
  keypair: SOLANA_KEYPAIR,
};

// HELIUS CONFIG - For Helius API integration
export const HELIUS = {
  API_KEY: process.env.HELIUS_API_KEY || '',
  WEBHOOK_SECRET: process.env.HELIUS_WEBHOOK_SECRET || '',
  apiKey: process.env.HELIUS_API_KEY || '', // camelCase alias
};

// SERVER CONFIG - For HTTP server setup
export const SERVER = {
  PORT: parseInt(process.env.PORT || '3000'),
  HOST: '0.0.0.0',
  ENVIRONMENT: process.env.NODE_ENV || 'development',
  webhookPort: parseInt(process.env.PORT || '3000'), // camelCase alias
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${parseInt(process.env.PORT || '3000')}`,
};

// STRATEGY CONFIG - For trading strategies
export const STRATEGY = {
  MODE: process.env.STRATEGY_MODE || 'aggressive',
  USE_SMART_MONEY: process.env.USE_SMART_MONEY !== 'false',
  USE_NARRATIVE: process.env.USE_NARRATIVE !== 'false',
  POSITION_SIZE_METHOD: 'conviction_weighted',
  moonbag: {
    trailingStopPercent: parseFloat(process.env.MOONBAG_TRAILING_STOP || '3'),
    minSolLamports: BigInt(process.env.MOONBAG_MIN_SOL || '100000'),
  },
  standard: {
    stopLossPercent: parseFloat(process.env.STANDARD_STOP_LOSS || '5'),
  },
  security: {
    maxTopHolderPercent: parseFloat(process.env.MAX_TOP_HOLDER_PCT || '20'),
  },
};

// APIS CONFIG - External API keys
export const APIS = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GROK_API_KEY: process.env.GROK_API_KEY || '',
  X_API_KEY: process.env.X_API_KEY || '',
  X_API_SECRET: process.env.X_API_SECRET || '',
  coingecko: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
  anthropic: process.env.ANTHROPIC_API_KEY || '', // camelCase alias
  goPlus: process.env.GOPLUS_API_URL || 'https://api.gopluslabs.io/api/v1',
  security: process.env.SECURITY_API_URL || 'https://api.gopluslabs.io/api/v1',
};

// RISK CONFIG - Risk management parameters
export const RISK_CONFIG = {
  MAX_POSITION_SIZE_USD: parseFloat(process.env.DEFAULT_MAX_POSITION_USD || '5000'),
  MAX_TOTAL_EXPOSURE_USD: parseFloat(process.env.DEFAULT_MAX_EXPOSURE_USD || '50000'),
  MAX_LEVERAGE: parseFloat(process.env.DEFAULT_MAX_LEVERAGE || '3'),
  MAX_POSITIONS: parseInt(process.env.DEFAULT_MAX_POSITIONS || '5'),
  STOP_LOSS_PERCENT: parseFloat(process.env.DEFAULT_STOP_LOSS_PERCENT || '5'),
  TAKE_PROFIT_PERCENT: parseFloat(process.env.DEFAULT_TP_PERCENT || '25'),
  MAX_DAILY_LOSS_USD: parseFloat(process.env.DEFAULT_DAILY_LOSS_USD || '10000'),
  maxPositionSizeUSD: parseFloat(process.env.DEFAULT_MAX_POSITION_USD || '5000'), // camelCase alias
  maxLeverageDefault: parseFloat(process.env.DEFAULT_MAX_LEVERAGE || '3'), // camelCase alias
  dailyLossLimit: parseFloat(process.env.DEFAULT_DAILY_LOSS_USD || '10000'), // camelCase alias
};

// CONVICTION THRESHOLDS - Signal thresholds
export const CONVICTION_THRESHOLDS = {
  AGGRESSIVE: 0.80,
  CAUTIOUS: 0.60,
  DEFENSIVE: 0.40,
  OBSERVATION: 0.30,
  INACTIVE: 0.00,
};

// MARKET REGIME CONFIG
export const MARKET_REGIME = {
  ENABLE_DAMPENING: process.env.ENABLE_REGIME_DAMPENING !== 'false',
  MIN_SCORE: parseFloat(process.env.MARKET_REGIME_MIN_SCORE || '40'),
  MIN_LIQUIDITY: parseFloat(process.env.MARKET_REGIME_MIN_LIQUIDITY || '50000'),
  TRADING_PAUSED: process.env.MARKET_REGIME_TRADING_PAUSE === 'true',
  minAverageNarrativeScore: parseFloat(process.env.MARKET_REGIME_MIN_NARRATIVE || '40'),
  tradingPauseOnBadRegime: process.env.MARKET_REGIME_PAUSE_ON_BAD !== 'false',
  maxOpenPositionsInBadRegime: parseInt(process.env.MARKET_REGIME_MAX_POS_BAD || '1'),
};

// BUNDLE THRESHOLDS - Bundle detection
export const BUNDLE_THRESHOLDS = {
  SAME_WALLET_MAX: parseInt(process.env.BUNDLE_SAME_WALLET_MAX || '5'),
  SAME_TX_MAX: parseInt(process.env.BUNDLE_SAME_TX_MAX || '3'),
  TIME_WINDOW_SECONDS: parseInt(process.env.BUNDLE_TIME_WINDOW || '60'),
  momentumOverridePriceChange: parseFloat(process.env.BUNDLE_MOMENTUM_PRICE || '15'),
  momentumOverrideMinBuys: parseInt(process.env.BUNDLE_MOMENTUM_BUYS || '50'),
  momentumOverrideMinHolders: parseInt(process.env.BUNDLE_MOMENTUM_HOLDERS || '100'),
  momentumOverrideMinVol24h: parseFloat(process.env.BUNDLE_MOMENTUM_VOL || '500000'),
  sameBlockMinWallets: parseInt(process.env.BUNDLE_SAME_BLOCK_MIN || '5'),
  commonFunderPct: parseFloat(process.env.BUNDLE_COMMON_FUNDER || '0.3'),
  mirrorAmountsMinCount: parseInt(process.env.BUNDLE_MIRROR_AMOUNTS || '3'),
  freshWalletPct: parseFloat(process.env.BUNDLE_FRESH_WALLET || '0.5'),
};

// MODE - Legacy mode string
export const MODE = process.env.MODE || 'trading';

// FEATURE FLAGS - Feature toggles
export const FEATURE_FLAGS = {
  USE_SMART_MONEY: process.env.USE_SMART_MONEY !== 'false',
  USE_NARRATIVE: process.env.USE_NARRATIVE !== 'false',
  USE_EMOTION_MODELER: process.env.USE_EMOTION_MODELER !== 'false',
  USE_MARKET_MEMORY: process.env.USE_MARKET_MEMORY !== 'false',
  USE_PVP_DETECTOR: process.env.USE_PVP_SURVIVAL_DETECTOR !== 'false',
  USE_PATTERN_ANTICIPATION: process.env.USE_PATTERN_ANTICIPATION !== 'false',
  ENABLE_HELIUS_WEBHOOK: process.env.ENABLE_HELIUS_WEBHOOK !== 'false',
  ENABLE_PUMPFUN: process.env.ENABLE_PUMPFUN !== 'false',
  DRY_RUN: process.env.DRY_RUN === 'true',
  // camelCase aliases
  useEmotionModeler: process.env.USE_EMOTION_MODELER !== 'false',
  usePvpSurvivalDetector: process.env.USE_PVP_SURVIVAL_DETECTOR !== 'false',
  useNarrativeRotation: process.env.USE_NARRATIVE_ROTATION !== 'false',
  usePumpFunScanner: process.env.ENABLE_PUMPFUN !== 'false',
  enableBundleDetection: process.env.ENABLE_BUNDLE_DETECTION !== 'false',
  enableDeployerCheck: process.env.ENABLE_DEPLOYER_CHECK !== 'false',
};

// TRADE AMOUNT - Default trade amount
export const TRADE_AMOUNT_USD = parseFloat(process.env.TRADE_AMOUNT_USD || '100');

// X_API - Twitter/X configuration
export const X_API = {
  API_KEY: process.env.X_API_KEY || '',
  API_SECRET: process.env.X_API_SECRET || '',
  BEARER_TOKEN: process.env.X_BEARER_TOKEN || '',
  bearerToken: process.env.X_BEARER_TOKEN || '', // camelCase alias
};

// TELEGRAM CONFIG - With legacy property names
export const TELEGRAM = {
  TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  botToken: process.env.TELEGRAM_BOT_TOKEN || '', // Legacy name
  chatId: process.env.ALLOWED_CHAT_IDS ? parseInt(process.env.ALLOWED_CHAT_IDS.split(',')[0]) : 0,
  ALLOWED_CHATS: process.env.ALLOWED_CHAT_IDS?.split(',').map(id => id.trim()) || [],
  WALLET_COMMANDS_ENABLED: process.env.WALLET_COMMANDS !== 'false',
  TRADING_ALERTS: process.env.TRADING_ALERTS !== 'false',
  ERROR_ALERTS: process.env.ERROR_ALERTS !== 'false',
};

// ============================================================================
// NEW DELIVERY 1 EXPORTS (Wallet & Behavioral Intelligence)
// ============================================================================

export const WALLET_CONFIG = {
  ISOLATION_STRICT: process.env.WALLET_ISOLATION_STRICT !== 'false',
  MAX_WALLETS: parseInt(process.env.MAX_WALLETS || '3'),
  AUTO_DISCOVERY: process.env.WALLET_AUTO_DISCOVERY === 'true',

  DEFAULT_RISK: {
    MAX_POSITION_USD: RISK_CONFIG.MAX_POSITION_SIZE_USD,
    MAX_TOTAL_EXPOSURE_USD: RISK_CONFIG.MAX_TOTAL_EXPOSURE_USD,
    MAX_LEVERAGE: RISK_CONFIG.MAX_LEVERAGE,
    MAX_POSITIONS: RISK_CONFIG.MAX_POSITIONS,
    STOP_LOSS_PERCENT: RISK_CONFIG.STOP_LOSS_PERCENT,
    TAKE_PROFIT_PERCENT: RISK_CONFIG.TAKE_PROFIT_PERCENT,
    MAX_DAILY_LOSS_USD: RISK_CONFIG.MAX_DAILY_LOSS_USD,
  },

  STRATEGIES: {
    CONSERVATIVE: {
      CAPITAL_ALLOCATION: 0.03,
      MAX_LEVERAGE: 1,
      CONVICTION_THRESHOLD: 0.40,
      POSITION_SIZE_MULTIPLIER: 0.5,
    },
    AGGRESSIVE: {
      CAPITAL_ALLOCATION: 0.15,
      MAX_LEVERAGE: 3,
      CONVICTION_THRESHOLD: 0.60,
      POSITION_SIZE_MULTIPLIER: 1.5,
    },
    EXPERIMENTAL: {
      CAPITAL_ALLOCATION: 0.08,
      MAX_LEVERAGE: 2,
      CONVICTION_THRESHOLD: 0.50,
      POSITION_SIZE_MULTIPLIER: 1.0,
    },
  },
};

export const INTELLIGENCE = {
  MARKET_MEMORY: {
    USE_MARKET_MEMORY: process.env.USE_MARKET_MEMORY !== 'false',
    PATTERN_MIN_CONFIDENCE: parseFloat(process.env.PATTERN_MIN_CONFIDENCE || '0.3'),
    PATTERN_MAX_AGE_DAYS: parseInt(process.env.PATTERN_MAX_AGE_DAYS || '90'),
    LEARNING_ENABLED: process.env.LEARNING_ENABLED !== 'false',
  },

  CONVICTION: {
    USE_CONVICTION_SCALER: process.env.USE_CONVICTION_SCALER !== 'false',
    SIGNAL_WEIGHTS: {
      SMART_MONEY: parseFloat(process.env.WEIGHT_SMART_MONEY || '0.30'),
      NARRATIVE_VITALITY: parseFloat(process.env.WEIGHT_NARRATIVE || '0.20'),
      HOLDER_BEHAVIOR: parseFloat(process.env.WEIGHT_HOLDERS || '0.20'),
      MARKET_REGIME: parseFloat(process.env.WEIGHT_REGIME || '0.15'),
      MARKET_MEMORY: parseFloat(process.env.WEIGHT_MEMORY || '0.15'),
    },
    ADAPTIVE_WEIGHTS: process.env.ADAPTIVE_WEIGHTS === 'true',
  },

  EMOTION: {
    USE_EMOTION_MODELER: process.env.USE_EMOTION_MODELER !== 'false',
    DETECT_GREED_EXPANSION: process.env.DETECT_GREED !== 'false',
    DETECT_PANIC_FLUSH: process.env.DETECT_PANIC !== 'false',
    DETECT_EUPHORIA: process.env.DETECT_EUPHORIA !== 'false',
    DETECT_FATIGUE: process.env.DETECT_FATIGUE !== 'false',
  },

  PATTERN: {
    USE_PATTERN_ANTICIPATION: process.env.USE_PATTERN_ANTICIPATION !== 'false',
    PREDICTION_CONFIDENCE_MIN: parseFloat(process.env.PATTERN_PRED_MIN || '0.4'),
    SHAPE_LIBRARY_SIZE: parseInt(process.env.SHAPE_LIBRARY_SIZE || '100'),
  },

  MARKET_REGIME: {
    ENABLE_REGIME_DAMPENING: MARKET_REGIME.ENABLE_DAMPENING,
    REGIME_MIN_SCORE: MARKET_REGIME.MIN_SCORE,
    REGIME_MIN_LIQUIDITY: MARKET_REGIME.MIN_LIQUIDITY,
  },

  PVP: {
    USE_PVP_DETECTOR: process.env.USE_PVP_SURVIVAL_DETECTOR !== 'false',
    ATTACK_SENSITIVITY: parseFloat(process.env.PVP_SENSITIVITY || '0.7'),
  },

  NARRATIVE: {
    USE_NARRATIVE_TRACKER: process.env.USE_NARRATIVE_ROTATION !== 'false',
    CAPITAL_FLOW_MIN_THRESHOLD: parseFloat(process.env.NARRATIVE_CF_MIN || '100000'),
  },
};

export const AI = {
  CLAUDE: {
    USE_CLAUDE: process.env.USE_CLAUDE === 'true',
    API_KEY: process.env.ANTHROPIC_API_KEY || '',
    MODEL: 'claude-3-5-haiku-20241022',
    MAX_TOKENS: 1000,
    TRIGGER_THRESHOLD: parseFloat(process.env.CLAUDE_TRIGGER_THRESHOLD || '0.7'),
    TIMEOUT_MS: 5000,
  },

  GROK: {
    USE_GROK: process.env.USE_GROK === 'true',
    API_KEY: process.env.GROK_API_KEY || '',
  },

  USAGE: {
    EVENT_DRIVEN_ONLY: true,
    COMPRESS_INPUT: true,
    STRUCTURED_OUTPUT: true,
    TOKEN_EFFICIENCY: true,
  },
};

export const EXECUTION = {
  RISK_ENGINE: {
    ENABLED: process.env.RISK_ENGINE_ENABLED !== 'false',
    POSITION_SIZING_METHOD: 'conviction_weighted',
    LEVERAGE_MODE: 'wallet_aware',
  },

  TRADING: {
    PAUSED: process.env.TRADING_PAUSED === 'true',
    LIVE_MODE: process.env.LIVE_TRADING !== 'false',
    DRY_RUN: process.env.DRY_RUN === 'true',
    MAX_SLIPPAGE_BPS: parseInt(process.env.MAX_SLIPPAGE_BPS || '50'),
  },

  JUPITER: {
    API_URL: 'https://quote-api.jup.ag/v6',
    PROGRAM_ID: 'JUP6LkbZbjS1jKKwapdHNr8InjaTUvnWWePzJ6woFym',
  },

  MEV_PROTECTION: {
    ENABLED: process.env.MEV_PROTECTION === 'true',
  },
};

export const DATABASE = {
  SUPABASE_URL: SUPABASE.URL,
  SUPABASE_KEY: SUPABASE.ANON_KEY,
  SUPABASE_SERVICE_KEY: SUPABASE.SERVICE_KEY,
  BACKUP_ENABLED: process.env.BACKUP_ENABLED !== 'false',
  RETENTION_DAYS: parseInt(process.env.DATA_RETENTION_DAYS || '180'),
};

export const MARKET_DATA = {
  HELIUS_API_KEY: HELIUS.API_KEY,
  HELIUS_WEBHOOK_SECRET: HELIUS.WEBHOOK_SECRET,
  COLLECT_CANDLES: process.env.COLLECT_CANDLES === 'true',
  COLLECT_HOLDERS: process.env.COLLECT_HOLDERS === 'true',
  COLLECT_VOLUME: process.env.COLLECT_VOLUME === 'true',
};

export const LOGGING = {
  VERBOSE: process.env.VERBOSE_LOGS === 'true',
  LOG_ALL_SIGNALS: process.env.LOG_ALL_SIGNALS === 'true',
  LOG_TRADES: process.env.LOG_TRADES !== 'false',
  LOG_ERRORS: process.env.LOG_ERRORS !== 'false',
};

export const STATE = {
  BOT_STARTED_AT: new Date().toISOString(),
  VERSION: process.env.VERSION || '1.0.0',
  BUILD: process.env.BUILD || 'development',
};

// ============================================================================
// VALIDATION
// ============================================================================

export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!SUPABASE.URL) errors.push('SUPABASE_URL not set');
  if (!SUPABASE.ANON_KEY) errors.push('SUPABASE_ANON_KEY not set');
  if (!TELEGRAM.TOKEN) errors.push('TELEGRAM_BOT_TOKEN not set');

  if (WALLET_CONFIG.ISOLATION_STRICT && WALLET_CONFIG.MAX_WALLETS < 1) {
    errors.push('MAX_WALLETS must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function printConfig(): void {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         CATALYST APEX TRADER - CONFIGURATION               ║
╠════════════════════════════════════════════════════════════╣
║ System: ${STATE.BUILD.padEnd(49)} ║
║ Version: ${STATE.VERSION.padEnd(48)} ║
║                                                            ║
║ 👛 WALLET ISOLATION:                                      ║
║    Strict Mode: ${String(WALLET_CONFIG.ISOLATION_STRICT).padEnd(39)} ║
║    Max Wallets: ${String(WALLET_CONFIG.MAX_WALLETS).padEnd(40)} ║
║                                                            ║
║ 🧠 BEHAVIORAL INTELLIGENCE:                               ║
║    Memory Engine: ${String(INTELLIGENCE.MARKET_MEMORY.USE_MARKET_MEMORY).padEnd(36)} ║
║    Conviction Scaler: ${String(INTELLIGENCE.CONVICTION.USE_CONVICTION_SCALER).padEnd(33)} ║
║    Emotion Modeler: ${String(INTELLIGENCE.EMOTION.USE_EMOTION_MODELER).padEnd(35)} ║
║    Pattern Anticipation: ${String(INTELLIGENCE.PATTERN.USE_PATTERN_ANTICIPATION).padEnd(30)} ║
║    PvP Detector: ${String(INTELLIGENCE.PVP.USE_PVP_DETECTOR).padEnd(37)} ║
║                                                            ║
║ ⚙️  EXECUTION:                                            ║
║    Live Trading: ${String(EXECUTION.TRADING.LIVE_MODE).padEnd(37)} ║
║    Paused: ${String(EXECUTION.TRADING.PAUSED).padEnd(45)} ║
║                                                            ║
║ 📡 INTEGRATIONS:                                          ║
║    Telegram: ${String(!!TELEGRAM.TOKEN).padEnd(42)} ║
║    Supabase: ${String(!!SUPABASE.URL).padEnd(41)} ║
║    Helius: ${String(!!HELIUS.API_KEY).padEnd(44)} ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
}