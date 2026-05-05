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
  token: string;
  walletId: string;
  conviction: number; // 0-100
  mode: 'AGGRESSIVE' | 'CAUTIOUS' | 'DEFENSIVE' | 'OBSERVATION' | 'INACTIVE';
  timestamp: number;
}

export interface TradeSignalEvent {
  type: 'TRADE_SIGNAL';
  token: string;
  walletId: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  conviction: number;
  positionSize: number;
  timestamp: number;
}

// ─── Outcome Events ─────────────────────────────────────────────────────

export interface TradeExecutedEvent {
  type: 'TRADE_EXECUTED';
  token: string;
  walletId: string;
  entryPrice: number;
  positionSize: number;
  leverage: number;
  timestamp: number;
}

export interface TradeClosedEvent {
  type: 'TRADE_CLOSED';
  tradeId: string;
  token: string;
  walletId: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  reason: string;
  timestamp: number;
}

export interface OutcomeLoggedEvent {
  type: 'OUTCOME_LOGGED';
  tradeId: string;
  token: string;
  walletId: string;
  outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN';
  pnl: number;
  learnings: string[];
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
  | InvalidationSignalEvent
  | RugRiskDetectedEvent
  | WhaleExitEvent
  | LiquidityCollapseEvent
  | ConvictionCalculatedEvent
  | TradeSignalEvent
  | TradeExecutedEvent
  | TradeClosedEvent
  | OutcomeLoggedEvent
  | PatternRecordedEvent
  | MemoryUpdatedEvent;

export type SignalEventType = SignalEvent['type'];
