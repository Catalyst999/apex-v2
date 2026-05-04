/**
 * FILE PATH: src/services/intelligence/types/reverse-engineering-types.ts
 * 
 * COPY THIS FILE TO:
 * - src/services/intelligence/types/reverse-engineering-types.ts
 * 
 * IMPORTED BY:
 * - src/services/intelligence/reverse-engineering-engine.ts
 * - src/services/scoring/router.ts
 * 
 * REVERSE ENGINEERING ENGINE - TYPE DEFINITIONS
 * Behavioral pattern extraction from historical runners
 */

// ============================================================================
// CONVICTION TRIGGERS
// ============================================================================

export type ConvictionTriggerType =
  | 'DORMANT_CHART_REVIVAL'
  | 'EARLY_CULT_BEHAVIOR'
  | 'STEALTH_ACCUMULATION'
  | 'HIGH_SIGNAL_LOW_NOISE'
  | 'WHALE_REENTRY'
  | 'HOLDER_LOCKUP'
  | 'LIQUIDITY_STABILITY'
  | 'MEMETIC_EXPANSION'
  | 'SOCIAL_VELOCITY_SPIKE'
  | 'RETAIL_DELAY_WINDOW';

export interface ConvictionTrigger {
  type: ConvictionTriggerType;
  timestamp: number;
  confidence: number; // 0-1
  timeUntilExplosion: number | null; // ms until market cap 10x
  metrics: {
    [key: string]: number | string;
  };
}

// ============================================================================
// HISTORICAL PATTERN ANALYSIS
// ============================================================================

export interface HistoricalRunnerPattern {
  tokenAddress: string;
  
  // Timeline
  launchTimestamp: number;
  explosionTimestamp: number;
  analysisTimestamp: number;

  // Market movement
  initialMarketCap: number;
  peakMarketCap: number;
  finalMarketCap: number;
  totalROI: number;
  timeToExplosion: number; // ms

  // Triggers and patterns
  convictionTriggersFound: ConvictionTrigger[];
  topPredictiveTriggers: ConvictionTriggerType[];
  triggerCount: number;

  // Behavioral metrics
  holderRetentionRate: number; // 0-1
  walletCoordinationScore: number; // 0-1
  liquidityExplosionVelocity: number; // x per hour
  socialMomentumBuild: number; // mention acceleration
}

// ============================================================================
// BEHAVIORAL FINGERPRINT
// ============================================================================

export interface BehavioralFingerprint {
  tokenAddress: string;
  
  // Pattern signature
  triggerPattern: ConvictionTriggerType[]; // Top 3-5 triggers
  triggerCount: number; // Total triggers detected
  
  // Outcome
  roi: number;
  timeToExplosion: number; // ms
  confidence: number; // 0-1 how reliable this pattern is

  // Metadata
  analysisTimestamp: number;
}

// ============================================================================
// PATTERN LIBRARY
// ============================================================================

export interface PatternLibraryEntry {
  id: string;
  
  // Reference patterns (canonical examples)
  referenceTokens: string[]; // e.g., ["PEPE", "SHIBA", "BONK"]
  
  // Trigger composition
  triggerSequence: ConvictionTriggerType[];
  triggerFrequency: Map<ConvictionTriggerType, number>; // How often each appears
  
  // Statistics
  hitCount: number; // How many tokens matched this
  successRate: number; // % that exploded
  averageROI: number;
  averageTimeToExplosion: number;
  
  // Reliability
  confidence: number; // 0-1
  
  // Naming
  patternName: string; // e.g., "EARLY_MEME_CULT_FORMATION"
  description: string;
}

// ============================================================================
// PATTERN MATCHING RESULTS
// ============================================================================

export interface PatternRepeatingConditions {
  triggersUsedInAnalysis: number;
  triggerTypesDetected: number;
  topPredictiveTriggers: ConvictionTriggerType[];
  triggerStrengthMap: Map<ConvictionTriggerType, number>; // 0-1 strength
  averageTimeToExplosion: number; // ms
}

export interface BeastModeAlignment {
  tokenAddress: string;
  matchCount: number; // How many historical patterns match
  topMatch: BehavioralFingerprint;
  averageSimilarity: number; // 0-1
  beastModeConfidence: number; // 0-1 confidence in beast classification
  suggestedConvictionMultiplier?: number; // 1.0 - 2.0x
}

// ============================================================================
// REVERSE ENGINEERING CONTEXT
// ============================================================================

export interface ReverseEngineerContext {
  tokenAddress: string;
  analysisStartedAt: number;

  // Historical metrics
  initialMarketCap: number;
  peakMarketCap: number;
  timeToExplosion: number; // ms from launch to 10x
  totalROI: number;

  // Extracted intelligence
  convictionTriggersFound: ConvictionTrigger[];
  behavioralFingerprints: BehavioralFingerprint[];
  repeatingPatterns: PatternRepeatingConditions[];
  
  // Beast mode analysis
  beastModeAlignment: BeastModeAlignment | null;

  // Metadata
  walletId: string; // If analyzing per-wallet
  comparisonTokens: string[]; // What tokens to compare against
}

// ============================================================================
// DATABASE SCHEMAS (Supabase)
// ============================================================================

export interface ReverseEngineeringAnalysis {
  id: string;
  token_address: string;
  initial_market_cap: number;
  peak_market_cap: number;
  time_to_explosion_ms: number;
  total_roi: number;
  triggers_found: number;
  trigger_types_detected: number;
  top_predictive_triggers: string[];
  average_time_to_explosion_ms: number;
  created_at: string;
  updated_at: string;
}

export interface ReverseEngineeringBehavioralFingerprint {
  id: string;
  token_address: string;
  trigger_pattern: string[]; // ConvictionTriggerType[]
  trigger_count: number;
  roi: number;
  time_to_explosion_ms: number;
  confidence: number;
  analysis_timestamp: number;
  created_at: string;
}

export interface ReverseEngineeringMatches {
  id: string;
  wallet_id: string;
  token_address: string;
  matched_pattern_names: string[];
  top_match_pattern: string;
  similarity_score: number;
  recommended_conviction_boost: number;
  is_beast_mode_candidate: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ReverseEngineeringConfig {
  // Thresholds
  earlyPhaseMarketCapMax: number; // 500k
  accumulationPhaseMarketCapMax: number; // 5M
  explosionMarketCapMultiplier: number; // 10x
  minTriggerConfidence: number; // 0.3
  minPatternSimilarity: number; // 0.5

  // Pattern matching
  topPatternCount: number; // Top N patterns to track
  minReferenceTokens: number; // Minimum tokens to establish pattern

  // Beast mode
  beastModeConfidenceThreshold: number; // 0.75
  beastModeConvictionBoost: number; // 1.5x

  // Caching
  analysisCacheDurationMs: number; // 7 days
  patternRefreshIntervalMs: number; // 24 hours

  // Integration
  feedIntoMarketMemory: boolean;
  feedIntoConvictionScaler: boolean;
  feedIntoInsiderMomentum: boolean;
}