/**
 * FILE PATH: src/services/intelligence/types/insider-momentum-types.ts
 * 
 * COPY THIS FILE TO:
 * - src/services/intelligence/types/insider-momentum-types.ts
 * 
 * IMPORTED BY:
 * - src/services/intelligence/insider-momentum-engine.ts
 * 
 * INSIDER MOMENTUM - TYPE DEFINITIONS
 * All interfaces for insider momentum detection
 */

// ============================================================================
// SIGNAL TYPES
// ============================================================================

export interface DormancySignal {
  isInDormancy: boolean;
  dormancyDurationMs: number;
  volatility: number;
  volume: number;
  breakoutDetected: boolean;
  volumeSpikePercent: number;
  priceSurgePercent: number;
}

export interface WalletCoordinationSignal {
  coordinatedWallets: string[];
  profitableWalletCount: number;
  walletClusteringScore: number; // 0-100
  clusteringTightness: number; // How tightly clustered the entries are
  entriesInTimeWindow: number; // Wallets entering in last 10 minutes
  historicalWalletOverlap: number; // % wallets that appeared in previous pumps
}

export interface HolderRetentionSignal {
  holderCountChange: number;
  holderRetentionRate: number; // 0-1
  sellPressureScore: number; // 0-100 (lower = better)
  diamondHandScore: number; // 0-100
  expectedExitsVsActual: {
    expected: number;
    actual: number;
    retentionRate: number;
  };
  cultFormationIndicators: {
    retentionStrong: boolean;
    holdersIncreasing: boolean;
    sellPressureLow: boolean;
  };
}

export interface LiquidityExplosionSignal {
  lpGrowthRate: number; // Multiplier (e.g., 5 = 5x)
  liquidityAddedVsRemoved: number; // Ratio
  marketCapVelocity: number; // Growth per minute
  marketCapExplosionDetected: boolean;
  liquidityExplosionScore: number; // 0-100
  generationalRunnerPattern: boolean; // 7k → 2.6m style
}

export interface SocialIgnitionSignal {
  mentionVelocity: number; // Change percent in last 1h
  sentimentPolarity: number; // 0-1 (0=bearish, 1=bullish)
  engagementAcceleration: number; // Change percent
  keywordSpikes: string[];
  narrativeThemes: string[];
  engagementType: 'organic' | 'coordinated' | 'influencer' | 'unknown';
  socialIgnitionScore: number; // 0-100
}

// ============================================================================
// COMPOSITE SCORING
// ============================================================================

export interface InsiderMomentumScore {
  score: number; // 0-100 composite score
  dormancyScore: number;
  coordinationScore: number;
  retentionScore: number;
  liquidityScore: number;
  socialScore: number;
  timestamp: number;
}

export type BeastCandidateLabel =
  | 'EARLY_MEME_FORMATION'
  | 'CULT_FORMING'
  | 'INSIDER_ROTATION'
  | 'VIRAL_BREAKOUT'
  | 'LIQUIDITY_EXPLOSION'
  | 'RETAIL_FOMO_PHASE'
  | 'HIGH_PRIORITY_ALERT'
  | 'BEAST_MODE_CANDIDATE'
  | 'GENERATIONAL_RUNNER';

// ============================================================================
// CONTEXT & ANALYSIS
// ============================================================================

export interface InsiderMomentumContext {
  tokenAddress: string;
  walletId: string;

  // Current metrics
  currentMetrics: TokenMetrics;

  // Signals
  dormancySignal: DormancySignal;
  coordinationSignal: WalletCoordinationSignal;
  retentionSignal: HolderRetentionSignal;
  liquiditySignal: LiquidityExplosionSignal;
  socialSignal: SocialIgnitionSignal;

  // Composite
  momentumScore: InsiderMomentumScore;
  beastLabel: BeastCandidateLabel | null;

  // History & patterns
  historicalSimilarity: {
    pepeStylePattern: number; // 0-1 similarity
    shibaStylePattern: number;
    bonkStylePattern: number;
    customPatterns: Map<string, number>;
  };

  // Recommendations
  confidence: number; // 0-1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  suggestedAction: 'SKIP' | 'WATCH' | 'SMALL_POSITION' | 'AGGRESSIVE';
}

// ============================================================================
// INPUT METRICS (FROM SCANNER)
// ============================================================================

export interface TokenMetrics {
  // Price & Volatility
  price: number;
  priceChangePercent: number;
  volatility: number; // 1h volatility
  volume: number;
  volumeChangePercent: number;

  // Holders
  uniqueHolders: number;
  holderCount: number;
  holderCountChange: number;

  // Wallet activity
  incomingWallets: string[];
  outgoingWallets: string[];
  buyVolume: number;
  sellVolume: number;
  buyPressure: number; // 0-1

  // Liquidity
  liquidityUSD: number;
  lpGrowthRatio: number; // Multiplier
  lpAddedVsRemoved: number;

  // Market cap
  marketCap: number;
  marketCapChange1h: number;

  // Social metrics
  socialMentions: any[];
  socialMentionChange: number; // Percent change
  engagement: number;
  engagementChange: number; // Percent change
  sentiment: number; // 0-1
}

// ============================================================================
// DATABASE SCHEMAS (Supabase)
// ============================================================================

export interface InsiderMomentumAlert {
  id: string;
  wallet_id: string;
  token_address: string;
  momentum_score: number;
  beast_label: BeastCandidateLabel | null;
  dormancy_score: number;
  coordination_score: number;
  retention_score: number;
  liquidity_score: number;
  social_score: number;
  coordinated_wallets_count: number;
  holder_retention_rate: number;
  lp_growth_rate: number;
  market_cap_velocity: number;
  created_at: string;
  updated_at: string;
}

export interface InsiderMomentumHistory {
  id: string;
  wallet_id: string;
  token_address: string;
  momentum_score_history: number[];
  beast_label_history: BeastCandidateLabel[];
  timestamp_history: number[];
  entry_price: number;
  exit_price: number | null;
  outcome: 'GENERATIONAL' | 'SUCCESSFUL' | 'PARTIAL' | 'LOSS' | 'PENDING' | null;
  roi_percent: number | null;
  created_at: string;
}

export interface WalletCoordinationRecord {
  id: string;
  wallet_id: string;
  coordinated_wallet: string;
  token_address: string;
  coordination_score: number;
  entry_time: string;
  is_profitable: boolean;
  profit_percent: number | null;
  created_at: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface InsiderMomentumConfig {
  // Thresholds
  dormancyMinDurationMs: number;
  dormancyMaxVolume: number;
  dormancyMaxVolatility: number;
  walletClusterTimeWindowMs: number;
  walletClusterMinCount: number;
  holderRetentionMinimum: number;
  lpExplosionThreshold: number;
  liquidityIgnitionVelocityThreshold: number;

  // Scoring
  scoringWeights: {
    dormancy: number;
    coordination: number;
    retention: number;
    liquidity: number;
    social: number;
  };

  // Alerts
  highPriorityThreshold: number; // 70
  beastModeThreshold: number; // 85
  generationalRunnerThreshold: number; // 95

  // AI efficiency
  grokEnabled: boolean;
  grokSocialOnly: boolean;
  claudeValidationEnabled: boolean;
  claudeOnlyForEdgeCases: boolean;

  // Caching
  scoresCacheDurationMs: number;
  patternsRefreshIntervalMs: number;
}