// File path: src/services/events/signal-types.ts
/**
 * SIGNAL EVENT TYPES
 * All events flowing through the Event Pipeline/Signal Bus
 */

// ─── Token Events ───────────────────────────────────────────────────────

export interface TokenDetectedEvent {
  type: 'TOKEN_DETECTED';
  token: string;
  mint: string;
  name: string;
  symbol: string;
  timestamp: number;
  source: string; // 'dexscreener' | 'pumpfun' | 'raydium'
}

export interface LiquiditySpikeEvent {
  type: 'LIQUIDITY_SPIKE';
  token: string;
  liquidityBefore: number;
  liquidityAfter: number;
  percentChange: number;
  timestamp: number;
}

export interface VolumeAccelerationEvent {
  type: 'VOLUME_ACCELERATION';
  token: string;
  volumeM5: number;
  volumeH1: number;
  acceleration: number; // ratio
  timestamp: number;
}

export interface BreakoutDetectedEvent {
  type: 'BREAKOUT_DETECTED';
  token: string;
  breakoutPrice: number;
  resistanceLevel: number;
  confidenceScore: number;
  timestamp: number;
}

// ─── Wallet Events ──────────────────────────────────────────────────────

export interface WhaleEntryEvent {
  type: 'WHALE_ENTRY';
  token: string;
  walletAddress: string;
  amount: number;
  confidence: number;
  timestamp: number;
}

export interface InsiderClusterEvent {
  type: 'INSIDER_CLUSTER';
  token: string;
  walletCount: number;
  coordLevel: number; // 0-100
  timestamp: number;
}

export interface DormantWalletActiveEvent {
  type: 'DORMANT_WALLET_ACTIVE';
  token: string;
  walletAddress: string;
  dormancyPeriod: number; // days
  historicalWinRate: number;
  timestamp: number;
}

// ─── Social Events ──────────────────────────────────────────────────────

export interface NarrativeExpansionEvent {
  type: 'NARRATIVE_EXPANSION';
  token: string;
  narrative: string;
  velocityScore: number; // 0-100
  mentions: number;
  engagement: number;
  timestamp: number;
}

export interface InfluencerRotationEvent {
  type: 'INFLUENCER_ROTATION';
  token: string;
  influencer: string;
  sentiment: 'bullish' | 'neutral' | 'bearish';
  reach: number;
  timestamp: number;
}

export interface SocialVelocitySpikeEvent {
  type: 'SOCIAL_VELOCITY_SPIKE';
  token: string;
  postsPerHour: number;
  mentionChange: number;
  sentiment: number; // -100 to +100
  timestamp: number;
}

// ─── Market Context Events ──────────────────────────────────────────────

export interface RegimeChangeEvent {
  type: 'REGIME_CHANGE';
  previousRegime: 'HEALTHY' | 'WARMING' | 'COLD';
  newRegime: 'HEALTHY' | 'WARMING' | 'COLD';
  regimeScore: number; // 0-100
  timestamp: number;
}

export interface NarrativeSaturationEvent {
  type: 'NARRATIVE_SATURATION';
  narrative: string;
  saturation: number; // 0-100
  capitalRotation: string; // which narrative attention rotating to
  timestamp: number;
}

// ============================================
// PHASE 2: INTELLIGENCE PIPELINE EVENTS
// ============================================

// ─── Ingestion ──────────────────────────────────────────────────────

export interface SignalIngestedEvent {
  type: 'SIGNAL_INGESTED';
  tokenAddress: string;
  tokenName: string;
  description: string;
  marketData: Record<string, any>;
  onChainData: Record<string, any>;
  walletAddress?: string;
  scanner?: string;
  gatewayPassed: boolean;
  ingestionTime: number;
  timestamp: number;
}

export interface SignalDeduplicatedEvent {
  type: 'SIGNAL_DEDUPLICATED';
  token: string;
  mint: string;
  name: string;
  symbol: string;
  timestamp: number;
  source: string;
  reason: string;
}

// ─── Enrichment ──────────────────────────────────────────────────────

export interface SignalEnrichedEvent {
  type: 'SIGNAL_ENRICHED';
  tokenAddress: string;
  tokenName: string;
  abnormalityScore: number;
  abnormalitySeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  abnormalityType: string;
  emotionPhase: string;
  emotionIntensity: number;
  predictedNextPhase: string;
  hasPvPRisk: boolean;
  pvPPatterns: string[];
  pvPSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  enrichedAt: number;
  timestamp: number;
}

export interface NarrativeScoredEvent {
  type: 'NARRATIVE_SCORED';
  tokenAddress: string;
  tokenName: string;
  narrativeMatched: boolean;
  narrativeCategory: string;
  narrativeTier: 1 | 2 | 3;
  narrativeFreshness: number;
  narrativeSaturation: number;
  capitalRotationStrength: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  narrativeStage: 'EMERGING' | 'GROWING' | 'PEAK' | 'DECLINING' | 'DEAD';
  convictionBoost: number;
  narrativeConfidence: number;
  scoredAt: number;
  timestamp: number;
}

export interface MarketMemoryScoredEvent {
  type: 'MARKET_MEMORY_SCORED';
  tokenAddress: string;
  tokenName: string;
  patternFound: boolean;
  matchedPatternId: string;
  patternName: string;
  matchConfidence: number;
  historicalWinRate: number;
  historicalAvgHoldTime: number;
  historicalAvgROI: number;
  estimatedProbabilitySuccess: number;
  estimatedProbabilityRug: number;
  estimatedProbabilityDump: number;
  predictedPeakTime: number;
  recommendedHoldTime: number;
  scoredAt: number;
  timestamp: number;
}

export interface PatternAnalyzedEvent {
  type: 'PATTERN_ANALYZED';
  tokenAddress: string;
  tokenName: string;
  currentShape: string;
  shapeConfidence: number;
  volumeSignature: string;
  nextMilestone: string;
  historicalMatchFound: boolean;
  matchedHistoricalPattern: string;
  matchConfidence: number;
  historicalROI: number;
  historicalDuration: number;
  predictedFailureTime: number;
  failureProbability: number;
  failureMode: 'RUG' | 'DUMP' | 'STALL' | 'RECOVERY' | 'UNKNOWN';
  recommendedStopLoss: number;
  recommendedTakeProfit: number;
  patternQuality: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
  patternConfidence: number;
  analyzedAt: number;
  timestamp: number;
}

// ─── Conviction ──────────────────────────────────────────────────────

export interface ConvictionCalculatedEvent {
  type: 'CONVICTION_CALCULATED';
  tokenAddress: string;
  tokenName: string;
  signals: Record<string, number>;
  conviction: number;
  convictionMode: 'AGGRESSIVE' | 'CAUTIOUS' | 'DEFENSIVE' | 'OBSERVATION' | 'INACTIVE';
  recommendedPositionSize: number;
  recommendedLeverage: number;
  adjustedConviction: number;
  confidenceMultiplier: number;
  estimatedStopLoss: number;
  estimatedTakeProfit: number;
  timeToFailure: number;
  aggregatedAt: number;
  timestamp: number;
}

// ─── Routing ──────────────────────────────────────────────────────

export interface TradeSignalEvent {
  type: 'TRADE_SIGNAL';
  tokenAddress: string;
  tokenName: string;
  decision: 'TRADE' | 'WAIT' | 'AVOID';
  severity: 'BUY' | 'SCALP' | 'MICRO' | 'AVOID' | 'SCAM_RISK';
  confidence: number;
  reasons: string[];
  positionSize: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  riskScore: number;
  rugPullProbability: number;
  dumpProbability: number;
  marketRegime: string;
  volatilityLevel: number;
  decidedAt: number;
  timestamp: number;
}

// ─── Execution ──────────────────────────────────────────────────────

export interface TradeExecutedEvent {
  type: 'TRADE_EXECUTED';
  tokenAddress: string;
  tokenName: string;
  tradeId: string;
  entryPrice: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  mode: 'SHADOW' | 'SEMI_AUTO' | 'FULL_AUTO';
  executedAt: number;
  timestamp: number;
}

export interface TradeClosedEvent {
  type: 'TRADE_CLOSED';
  tokenAddress: string;
  tokenName: string;
  tradeId: string;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  leverage: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIMEOUT' | 'MANUAL' | 'ERROR';
  pnl: number;
  roi: number;
  executedAt: number;
  closedAt: number;
  timestamp: number;
}

// ─── Learning ──────────────────────────────────────────────────────

export interface OutcomeRecordedEvent {
  type: 'OUTCOME_RECORDED';
  tokenAddress: string;
  tokenName: string;
  tradeId: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  roi: number;
  holdTime: number;
  won: boolean;
  narrativeCategory: string;
  patternShape: string;
  convictionAtEntry: number;
  antiPatterns: string[];
  journalEntry: string;
  lessonLearned: string;
  recordedAt: number;
  timestamp: number;
  token?: string;
}

// ─── Failure Events ──────────────────────────────────────────────────

export interface ProcessingFailedEvent {
  type: 'SIGNAL_ENRICHMENT_FAILED' | 'NARRATIVE_SCORING_FAILED' | 'MARKET_MEMORY_SCORING_FAILED' | 
        'PATTERN_ANALYSIS_FAILED' | 'CONVICTION_CALCULATION_FAILED' | 'ROUTING_DECISION_FAILED' | 
        'OUTCOME_PROCESSING_FAILED';
  tokenAddress?: string;
  error: any;
  timestamp: number;
}

// ─── Risk/Invalidation Events ────────────────────────────────────────

export interface InvalidationSignalEvent {
  type: 'INVALIDATION_SIGNAL';
  token: string;
  signal: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: number;
}

export interface RugRiskDetectedEvent {
  type: 'RUG_RISK_DETECTED';
  token: string;
  riskScore: number; // 0-100
  indicators: string[];
  timestamp: number;
}

export interface WhaleExitEvent {
  type: 'WHALE_EXIT';
  token: string;
  walletAddress: string;
  amount: number;
  timestamp: number;
}

export interface LiquidityCollapseEvent {
  type: 'LIQUIDITY_COLLAPSE';
  token: string;
  liquidityBefore: number;
  liquidityAfter: number;
  severity: number; // 0-100
  timestamp: number;
}

// ─── Intelligence Events ─────────────────────────────────────────────────

export interface ConvictionCalculatedEvent {
  type: 'CONVICTION_CALCULATED';
  tokenAddress: string;
  tokenName: string;
  signals: Record<string, number>;
  conviction: number;
  convictionMode: 'AGGRESSIVE' | 'CAUTIOUS' | 'DEFENSIVE' | 'OBSERVATION' | 'INACTIVE';
  recommendedPositionSize: number;
  recommendedLeverage: number;
  adjustedConviction: number;
  confidenceMultiplier: number;
  estimatedStopLoss: number;
  estimatedTakeProfit: number;
  timeToFailure: number;
  aggregatedAt: number;
  timestamp: number;
  walletId?: string;
  token?: string;
}

export interface TradeSignalEvent {
  type: 'TRADE_SIGNAL';
  tokenAddress: string;
  tokenName: string;
  decision: 'TRADE' | 'WAIT' | 'AVOID';
  severity: 'BUY' | 'SCALP' | 'MICRO' | 'AVOID' | 'SCAM_RISK';
  confidence: number;
  reasons: string[];
  positionSize: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  riskScore: number;
  rugPullProbability: number;
  dumpProbability: number;
  marketRegime: string;
  volatilityLevel: number;
  decidedAt: number;
  conviction?: any;
  token?: string;
  timestamp: number;
}

export interface SignalFilteredEvent {
  type: 'SIGNAL_FILTERED';
  tokenAddress: string;
  conviction: number;
  timestamp: number;
  reason?: string;
  token?: string;
}

export interface SignalWatchedEvent {
  type: 'SIGNAL_WATCHED';
  tokenAddress: string;
  conviction: number;
  timestamp: number;
  reason?: string;
  token?: string;
}

// ─── Outcome Events ─────────────────────────────────────────────────────

export interface TradeExecutedEvent {
  type: 'TRADE_EXECUTED';
  tokenAddress: string;
  tokenName: string;
  tradeId: string;
  entryPrice: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  mode: 'SHADOW' | 'SEMI_AUTO' | 'FULL_AUTO';
  executedAt: number;
  timestamp: number;
  walletId?: string;
  token?: string;
}

export interface TradeClosedEvent {
  type: 'TRADE_CLOSED';
  tokenAddress: string;
  tokenName: string;
  tradeId: string;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  leverage: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIMEOUT' | 'MANUAL' | 'ERROR';
  pnl: number;
  roi: number;
  executedAt: number;
  closedAt: number;
  timestamp: number;
  walletId?: string;
  token?: string;
  pnlPercent?: number;
}

export interface OutcomeLoggedEvent {
  type: 'OUTCOME_LOGGED';
  tradeId: string;
  tokenAddress: string;
  tokenName: string;
  walletId: string;
  outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN';
  pnl: number;
  learnings: string[];
  timestamp: number;
  token?: string;
}
export interface SignalWeightsUpdatedEvent {
  type: 'SIGNAL_WEIGHTS_UPDATED';
  walletId: string;
  walletState: {
    capitalState: string;
    balance?: number;
    currentDrawdown?: number;
    consecutiveLosses?: number;
  };
  baseConviction: number;
  adjustment: {
    convictionMultiplier: number;
    confidenceThreshold: number;
    positionSizeMultiplier: number;
    reason: string;
  };
  outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN' | 'UNKNOWN';
  timestamp: number;
}
// ─── Memory Update Events ────────────────────────────────────────────────

export interface PatternRecordedEvent {
  type: 'PATTERN_RECORDED';
  category: string;
  outcome: 'WIN' | 'LOSS' | 'NEUTRAL';
  confidence: number;
  timestamp: number;
}

export interface MemoryUpdatedEvent {
  type: 'MEMORY_UPDATED';
  patterns: number;
  averageWinRate: number;
  averageConfidence: number;
  timestamp: number;
}

// ─── Union Type ─────────────────────────────────────────────────────────

export type SignalEvent =
  | TokenDetectedEvent
  | LiquiditySpikeEvent
  | VolumeAccelerationEvent
  | BreakoutDetectedEvent
  | WhaleEntryEvent
  | InsiderClusterEvent
  | DormantWalletActiveEvent
  | NarrativeExpansionEvent
  | InfluencerRotationEvent
  | SocialVelocitySpikeEvent
  | RegimeChangeEvent
  | NarrativeSaturationEvent
  | SignalIngestedEvent
  | SignalDeduplicatedEvent
  | SignalEnrichedEvent
  | NarrativeScoredEvent
  | MarketMemoryScoredEvent
  | PatternAnalyzedEvent
  | InvalidationSignalEvent
  | RugRiskDetectedEvent
  | WhaleExitEvent
  | LiquidityCollapseEvent
  | ConvictionCalculatedEvent
  | TradeSignalEvent
  | SignalFilteredEvent
  | SignalWatchedEvent
  | TradeExecutedEvent
  | TradeClosedEvent
  | OutcomeRecordedEvent
  | ProcessingFailedEvent
  | OutcomeLoggedEvent
  | SignalWeightsUpdatedEvent
  | PatternRecordedEvent
  | MemoryUpdatedEvent;

export type SignalEventType = SignalEvent['type'];
