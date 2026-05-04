/**
 * FILE PATH: src/services/intelligence/types/bull-run-types.ts
 * 
 * COPY THIS FILE TO:
 * - src/services/intelligence/types/bull-run-types.ts
 * 
 * IMPORTED BY:
 * - src/services/intelligence/bull-run-intelligence-engine.ts
 * - src/services/scoring/router.ts
 * 
 * BULL RUN INTELLIGENCE - TYPE DEFINITIONS
 */

// ============================================================================
// REGIME PHASES
// ============================================================================

export type BullRunPhase =
  | 'BULL_RUN_ACCELERATING' // Score 80+, momentum explosive
  | 'BULL_RUN_SUSTAINED' // Score 65-79, strong momentum
  | 'GROWTH_PHASE' // Score 50-64, healthy growth
  | 'COOLING_PHASE' // Score 35-49, momentum fading
  | 'BEAR_WEAKNESS' // Score 20-34, sustained selling
  | 'BEAR_CRASH'; // Score <20, panic mode

// ============================================================================
// REGIME METRICS & SCORING
// ============================================================================

export interface RegimeMetrics {
  walletId: string;
  timestamp: number;

  // Individual signals
  cumulativeMomentum: number; // 0-1
  volatilityScore: number; // 0-1
  whaleBuyPressure: number; // 0-1
  marketWinRate: number; // 0-1
  liquidityHealth: number; // 0-1

  // Composite
  compositeScore: number; // 0-100
  phase: BullRunPhase;
  riskMultiplier: number; // 0.1-2.0
}

export interface RegimeScore {
  regimeScore: number; // 0-100 composite
  phase: BullRunPhase;
  riskMultiplier: number; // Position size multiplier
  momentumStrength: number; // 0-1
  volatilityLevel: string; // 'EXTREME' | 'HIGH' | 'NORMAL' | 'LOW'
  whaleBuyPressure: number; // 0-1
  marketWinRate: number; // 0-1
  liquidityHealth: number; // 0-1
  timestamp: number;
}

// ============================================================================
// MARKET REGIME
// ============================================================================

export interface BullRunRegime {
  phase: BullRunPhase;
  score: number; // 0-100
  riskMultiplier: number; // 0.1-2.0
  timestamp: number;
}

// ============================================================================
// SIGNALS
// ============================================================================

export interface MomentumSignal {
  priceUptrend: number; // 0-1
  marketCapUptrend: number; // 0-1
  volumeExpansion: number; // 0-1
  compositeMomentum: number; // 0-1
}

export interface VolatilitySignal {
  level: 'EXTREME' | 'HIGH' | 'NORMAL' | 'LOW';
  value: number; // 0-1 (0=extreme, 1=low volatility is good)
  isExtreme: boolean;
  isHigh: boolean;
}

export interface WhaleSignal {
  buyPressure: number; // 0-1
  phase: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
  largeInflows: number;
  largeOutflows: number;
}

export interface LiquiditySignal {
  totalLiquidity: number;
  liquidityChange: number; // Growth rate
  liquidityHealth: number; // 0-1
  slippageRisk: number; // 0-1 (0=safe, 1=risky)
}

// ============================================================================
// RISK MULTIPLIERS
// ============================================================================

export interface RiskMultiplier {
  phaseMultiplier: number; // Based on regime phase
  volatilityAdjustment: number; // Reduce for high volatility
  liquidityAdjustment: number; // Reduce for low liquidity
  finalMultiplier: number; // 0.1 - 2.0
}

// ============================================================================
// CONTEXT & ANALYSIS
// ============================================================================

export interface BullRunContext {
  walletId: string;
  timestamp: number;

  // Current regime
  regimeScore: number;
  phase: BullRunPhase;
  riskMultiplier: number;

  // Signals
  momentum: MomentumSignal;
  volatility: VolatilitySignal;
  whale: WhaleSignal;
  liquidity: LiquiditySignal;

  // Recommendations
  recommendedAction: 'AGGRESSIVE' | 'NORMAL' | 'CONSERVATIVE' | 'MINIMAL';
  suggestedPositionSize: 'FULL' | 'REDUCED' | 'MINIMAL' | 'NONE';
  riskAdjustment: string;

  // History
  recentTransitions: Array<{
    fromPhase: BullRunPhase;
    toPhase: BullRunPhase;
    timestamp: number;
  }>;
}

// ============================================================================
// REGIME TRANSITIONS
// ============================================================================

export interface RegimeTransition {
  fromPhase: BullRunPhase;
  toPhase: BullRunPhase;
  timestamp: number;
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: string;
}

// ============================================================================
// DATABASE SCHEMAS (Supabase)
// ============================================================================

export interface BullRunRegimeAnalysis {
  id: string;
  wallet_id: string;
  regime_score: number;
  regime_phase: BullRunPhase;
  momentum_strength: number;
  volatility_level: string;
  whale_buy_pressure: number;
  market_win_rate: number;
  liquidity_health: number;
  risk_multiplier: number;
  created_at: string;
  updated_at: string;
}

export interface BullRunRegimeTransition {
  id: string;
  wallet_id: string;
  from_phase: BullRunPhase;
  to_phase: BullRunPhase;
  timestamp_of_transition: number;
  created_at: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface BullRunConfig {
  // Phase thresholds
  bullAcceleratingMin: number; // 80
  bullSustainedMin: number; // 65
  growthPhaseMin: number; // 50
  coolingPhaseMin: number; // 35
  bearWeaknessMin: number; // 20

  // Signal thresholds
  growthPhaseMinMomentum: number; // 0.65
  coolingPhaseMaxMomentum: number; // 0.45
  distributionPhaseMaxMomentum: number; // 0.25

  volatilityExtremeThreshold: number; // 0.25
  volatilityHighThreshold: number; // 0.15
  volatilityNormalThreshold: number; // 0.08

  whaleAccumulationThreshold: number; // 0.7
  whaleLargeFlowThreshold: number; // Min $ value to count as "large"

  liquidityMinHealth: number; // 0.3

  // Risk multipliers
  riskMultiplierMax: number; // 2.0
  riskMultiplierMin: number; // 0.1

  // Scoring weights
  weights: {
    momentum: number;
    volatility: number;
    whale: number;
    winRate: number;
    liquidity: number;
  };

  // Alerts
  enableRegimeTransitionAlerts: boolean;
  enableVolatilityAlerts: boolean;
  enableLiquidityAlerts: boolean;
}