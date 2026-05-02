// src/services/intelligence/pattern-anticipation-engine.ts
// Catalyst Apex Trader v3.0 — Pattern Anticipation Engine
//
// Instinct-like repetitive structure recognition.
// System learns the "rhythm" of how tokens behave.
// Not waiting for confirmation — predicting next move before it happens.
//
// Core: What pattern shape are we in? What comes next?
// Based on: time in pattern, volume signature, price structure, holder behavior

export type PatternShape =
  | "ACCUMULATION_BASE"         // quiet, low volume, holders accumulating
  | "ASCENDING_WEDGE"           // tightening, compression phase
  | "BREAKOUT_IMMINENT"         // pattern complete, break coming
  | "INITIAL_PUMP_PHASE"        // first 5-15min after breakout
  | "FOMO_ACCELERATION"         // 15min-1hr, volume + price up together
  | "EXHAUSTION_TOP"            // volume dying, price still up (trap)
  | "DUMP_PHASE"                // sharp decline with sell volume
  | "RECOVERY_BOUNCE"           // buyers return after dump
  | "STABILIZATION"             // settling at support
  | "DEATH_SPIRAL"              // continuous dump with no support
  | "UNKNOWN";

export interface PatternSnapshot {
  shape:                PatternShape;
  confidence:           number;        // 0-100 how sure
  minutesInPattern:     number;        // time spent here
  predictedNextShape:   PatternShape;
  nextShapeProbability: number;        // 0-100
  volumeSignature:      "RISING" | "STEADY" | "DECLINING";
  priceVelocity:        "ACCELERATING" | "STEADY" | "DECELERATING";
  structureIntegrity:   number;        // 0-100 (how clean is the pattern)
  nextMilestone:        string;        // what to watch for next
  estimatedTimeToNext:  number;        // minutes
  actionableSignal:     string;        // what should trader do
}

// ─── Pattern Recognition ──────────────────────────────────────────────────

export function identifyPatternShape(
  timeInMinutes: number,
  priceHistory: number[],
  volumeHistory: number[],
  buySellHistory: number[], // ratio history
  holderHistory: number[],
  narrativeIntensity: number, // 0-100
): PatternSnapshot {
  if (priceHistory.length < 5) {
    return {
      shape: "UNKNOWN",
      confidence: 0,
      minutesInPattern: timeInMinutes,
      predictedNextShape: "UNKNOWN",
      nextShapeProbability: 0,
      volumeSignature: "STEADY",
      priceVelocity: "STEADY",
      structureIntegrity: 0,
      nextMilestone: "Collecting data",
      estimatedTimeToNext: 60,
      actionableSignal: "Observe",
    };
  }

  const currentPrice = priceHistory[priceHistory.length - 1];
  const priceStart = priceHistory[0];
  const totalPriceChange = ((currentPrice - priceStart) / priceStart) * 100;

  const currentVolume = volumeHistory[volumeHistory.length - 1];
  const avgVolume = volumeHistory.reduce((a, b) => a + b) / volumeHistory.length;
  const volumeAccel = currentVolume / avgVolume;

  const currentBsr = buySellHistory[buySellHistory.length - 1] || 1;
  const avgBsr = buySellHistory.reduce((a, b) => a + b) / buySellHistory.length;

  const currentHolders = holderHistory[holderHistory.length - 1] || 0;
  const holdersTrend = holderHistory.length > 1 ? 
    ((currentHolders - holderHistory[0]) / holderHistory[0]) * 100 : 0;

  // ─── Pattern Detection Logic ──────────────────────────────────────────

  let shape: PatternShape = "UNKNOWN";
  let confidence = 50;
  let structureIntegrity = 50;

  // ACCUMULATION_BASE: low volume, price stable, holders growing
  if (
    timeInMinutes < 5 &&
    Math.abs(totalPriceChange) < 5 &&
    volumeAccel < 1.2 &&
    holdersTrend > 2 &&
    currentBsr > 1.2
  ) {
    shape = "ACCUMULATION_BASE";
    confidence = 80;
    structureIntegrity = 85;
  }

  // ASCENDING_WEDGE: price range tightening, volume low
  if (
    timeInMinutes > 5 &&
    timeInMinutes < 20 &&
    Math.abs(totalPriceChange) > 5 &&
    Math.abs(totalPriceChange) < 20 &&
    volumeAccel < 0.8
  ) {
    shape = "ASCENDING_WEDGE";
    confidence = 75;
    structureIntegrity = 70;
  }

  // BREAKOUT_IMMINENT: wedge breaking up, volume starting to increase
  if (
    shape === "ASCENDING_WEDGE" &&
    currentBsr > avgBsr &&
    volumeAccel > 1.2
  ) {
    shape = "BREAKOUT_IMMINENT";
    confidence = 85;
    structureIntegrity = 80;
  }

  // INITIAL_PUMP_PHASE: just broke out, volume spike, price up 10-30%
  if (
    timeInMinutes < 15 &&
    totalPriceChange > 10 &&
    totalPriceChange < 40 &&
    volumeAccel > 1.5 &&
    currentBsr > 2
  ) {
    shape = "INITIAL_PUMP_PHASE";
    confidence = 90;
    structureIntegrity = 75;
  }

  // FOMO_ACCELERATION: 15min-1hr, price and volume both up
  if (
    timeInMinutes >= 15 &&
    timeInMinutes < 120 &&
    totalPriceChange > 30 &&
    volumeAccel > 1.2 &&
    narrativeIntensity > 60
  ) {
    shape = "FOMO_ACCELERATION";
    confidence = 85;
    structureIntegrity = 70;
  }

  // EXHAUSTION_TOP: price high, but volume dropping and BSR normalizing
  if (
    totalPriceChange > 40 &&
    volumeAccel < avgVolume * 0.8 &&
    currentBsr < 1.5 &&
    currentBsr >= avgBsr
  ) {
    shape = "EXHAUSTION_TOP";
    confidence = 80;
    structureIntegrity = 75;
  }

  // DUMP_PHASE: sharp price down with high sell volume
  if (
    totalPriceChange < -10 &&
    currentBsr < 0.5 &&
    volumeAccel > 1.5
  ) {
    shape = "DUMP_PHASE";
    confidence = 85;
    structureIntegrity = 85;
  }

  // RECOVERY_BOUNCE: price recovering from dump, buys returning
  if (
    shape === "DUMP_PHASE" &&
    currentBsr > 1.5 &&
    totalPriceChange > -20
  ) {
    shape = "RECOVERY_BOUNCE";
    confidence = 75;
    structureIntegrity = 70;
  }

  // STABILIZATION: price stable after recovery, low volume
  if (
    (shape === "RECOVERY_BOUNCE" || shape === "DUMP_PHASE") &&
    Math.abs(totalPriceChange) < 10 &&
    volumeAccel < 1
  ) {
    shape = "STABILIZATION";
    confidence = 70;
    structureIntegrity = 80;
  }

  // DEATH_SPIRAL: continuous dump, no recovery, volume staying high
  if (
    totalPriceChange < -30 &&
    volumeAccel > 1 &&
    currentBsr < 0.3 &&
    holdersTrend < -5
  ) {
    shape = "DEATH_SPIRAL";
    confidence = 90;
    structureIntegrity = 85;
  }

  // ─── Predict Next Shape ───────────────────────────────────────────────

  let predictedNextShape: PatternShape = "UNKNOWN";
  let nextProbability = 0;

  const shapeTransitions: Record<PatternShape, [PatternShape, number][]> = {
    ACCUMULATION_BASE: [
      ["ASCENDING_WEDGE", 70],
      ["BREAKOUT_IMMINENT", 20],
      ["UNKNOWN", 10],
    ],
    ASCENDING_WEDGE: [
      ["BREAKOUT_IMMINENT", 80],
      ["INITIAL_PUMP_PHASE", 15],
      ["STABILIZATION", 5],
    ],
    BREAKOUT_IMMINENT: [
      ["INITIAL_PUMP_PHASE", 85],
      ["FOMO_ACCELERATION", 10],
      ["EXHAUSTION_TOP", 5],
    ],
    INITIAL_PUMP_PHASE: [
      ["FOMO_ACCELERATION", 75],
      ["EXHAUSTION_TOP", 20],
      ["DUMP_PHASE", 5],
    ],
    FOMO_ACCELERATION: [
      ["EXHAUSTION_TOP", 70],
      ["DUMP_PHASE", 25],
      ["RECOVERY_BOUNCE", 5],
    ],
    EXHAUSTION_TOP: [
      ["DUMP_PHASE", 80],
      ["RECOVERY_BOUNCE", 15],
      ["DEATH_SPIRAL", 5],
    ],
    DUMP_PHASE: [
      ["RECOVERY_BOUNCE", 60],
      ["STABILIZATION", 25],
      ["DEATH_SPIRAL", 15],
    ],
    RECOVERY_BOUNCE: [
      ["STABILIZATION", 70],
      ["FOMO_ACCELERATION", 20],
      ["DUMP_PHASE", 10],
    ],
    STABILIZATION: [
      ["ACCUMULATION_BASE", 50],
      ["ASCENDING_WEDGE", 30],
      ["UNKNOWN", 20],
    ],
    DEATH_SPIRAL: [["DEATH_SPIRAL", 90], ["UNKNOWN", 10]],
    UNKNOWN: [["UNKNOWN", 50], ["ACCUMULATION_BASE", 50]],
  };

  const transitions = shapeTransitions[shape] || [];
  if (transitions.length > 0) {
    const best = transitions[0];
    predictedNextShape = best[0];
    nextProbability = best[1];
  }

  // ─── Volume Signature ──────────────────────────────────────────────────

  let volumeSignature: "RISING" | "STEADY" | "DECLINING";
  if (volumeHistory.length >= 3) {
    const recent = volumeHistory.slice(-3);
    if (recent[2] > recent[1] && recent[1] > recent[0]) {
      volumeSignature = "RISING";
    } else if (recent[2] < recent[1] && recent[1] < recent[0]) {
      volumeSignature = "DECLINING";
    } else {
      volumeSignature = "STEADY";
    }
  } else {
    volumeSignature = "STEADY";
  }

  // ─── Price Velocity ───────────────────────────────────────────────────

  let priceVelocity: "ACCELERATING" | "STEADY" | "DECELERATING";
  if (priceHistory.length >= 3) {
    const vel1 = Math.abs(priceHistory[priceHistory.length - 2] - priceHistory[priceHistory.length - 3]);
    const vel2 = Math.abs(priceHistory[priceHistory.length - 1] - priceHistory[priceHistory.length - 2]);
    if (vel2 > vel1 * 1.2) {
      priceVelocity = "ACCELERATING";
    } else if (vel2 < vel1 * 0.8) {
      priceVelocity = "DECELERATING";
    } else {
      priceVelocity = "STEADY";
    }
  } else {
    priceVelocity = "STEADY";
  }

  // ─── Next Milestone ───────────────────────────────────────────────────

  const milestoneMap: Record<PatternShape, string> = {
    ACCUMULATION_BASE: "Watch for breakout signal (volume + price spike)",
    ASCENDING_WEDGE: "Watch for wedge break (volume expands on break)",
    BREAKOUT_IMMINENT: "Expect initial pump (watch for entry)",
    INITIAL_PUMP_PHASE: "Monitor for FOMO phase (continue buying)",
    FOMO_ACCELERATION: "Watch for exhaustion signals (volume declining)",
    EXHAUSTION_TOP: "Expect dump incoming (reduce position)",
    DUMP_PHASE: "Watch for recovery bounce (exit point)",
    RECOVERY_BOUNCE: "Determine if genuine recovery or dead cat bounce",
    STABILIZATION: "Wait for new pattern to form",
    DEATH_SPIRAL: "Exit all positions immediately",
    UNKNOWN: "Collect more data before deciding",
  };

  const nextMilestone = milestoneMap[shape] || "Unknown";

  // ─── Estimated Time to Next ───────────────────────────────────────────

  const timeMap: Record<PatternShape, number> = {
    ACCUMULATION_BASE: 10,
    ASCENDING_WEDGE: 15,
    BREAKOUT_IMMINENT: 5,
    INITIAL_PUMP_PHASE: 10,
    FOMO_ACCELERATION: 30,
    EXHAUSTION_TOP: 10,
    DUMP_PHASE: 5,
    RECOVERY_BOUNCE: 20,
    STABILIZATION: 45,
    DEATH_SPIRAL: 0,
    UNKNOWN: 60,
  };

  const estimatedTimeToNext = timeMap[shape] || 60;

  // ─── Actionable Signal ────────────────────────────────────────────────

  const actionMap: Record<PatternShape, string> = {
    ACCUMULATION_BASE: "🕐 WATCH - Wait for accumulation to break out",
    ASCENDING_WEDGE: "⏳ PREPARE - Breakout incoming, get ready to enter",
    BREAKOUT_IMMINENT: "🚀 ENTER - Breakout signal forming, good entry",
    INITIAL_PUMP_PHASE: "✅ RIDE - Early pump, optimal entry window",
    FOMO_ACCELERATION: "📈 RIDE - Momentum strong, hold position",
    EXHAUSTION_TOP: "⚠️ REDUCE - Volume dying, start taking profit",
    DUMP_PHASE: "🚨 EXIT - Sharp decline, exit immediately",
    RECOVERY_BOUNCE: "🤔 WATCH - Recovery forming, exit on strength",
    STABILIZATION: "🕐 WAIT - Price stabilizing, next move forming",
    DEATH_SPIRAL: "❌ STOP LOSS - Continuous dump, exit all",
    UNKNOWN: "🔍 OBSERVE - Need more data to determine pattern",
  };

  const actionableSignal = actionMap[shape] || "Unknown";

  return {
    shape,
    confidence,
    minutesInPattern: timeInMinutes,
    predictedNextShape,
    nextShapeProbability: nextProbability,
    volumeSignature,
    priceVelocity,
    structureIntegrity,
    nextMilestone,
    estimatedTimeToNext,
    actionableSignal,
  };
}

// ─── Pattern Cleanliness Score ────────────────────────────────────────────

export function scorePatternCleanliness(
  shape: PatternShape,
  confidence: number,
  volumeTrend: "RISING" | "STEADY" | "DECLINING",
  priceTrend: "ACCELERATING" | "STEADY" | "DECELERATING",
): number {
  let score = confidence;

  // Bonus for volume/price alignment
  if (shape === "INITIAL_PUMP_PHASE" || shape === "FOMO_ACCELERATION") {
    if (volumeTrend === "RISING" && priceTrend === "ACCELERATING") {
      score += 15;
    }
  }

  if (shape === "DUMP_PHASE") {
    if (volumeTrend === "RISING" && priceTrend === "DECELERATING") {
      score += 10;
    }
  }

  return Math.min(100, score);
}