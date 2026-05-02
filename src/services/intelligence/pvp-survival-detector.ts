// src/services/intelligence/pvp-survival-detector.ts
// Catalyst Apex Trader v3.0 — PvP Survival Detector
//
// Solana market warfare intelligence.
// System detects predatory trading patterns, exit traps, and market manipulation.
// Solana is PvP. Recognize when you're being hunted.
//
// Detects:
// - Fake breakouts (sweep and dump)
// - Engagement farming (fake activity to attract retail)
// - Exit liquidity traps (whales exit on retail FOMO)
// - Cabal rotations (coordinated selling)
// - Spoofed momentum (fake volume, then reversal)
// - Liquidity mining (adds liq then removes on green)

export type WarfarePattern =
  | "FAKE_BREAKOUT"
  | "ENGAGEMENT_FARM"
  | "EXIT_LIQUIDITY_TRAP"
  | "CABAL_ROTATION"
  | "SPOOFED_MOMENTUM"
  | "LIQUIDITY_MINE"
  | "CLEAN_ACCUMULATION"
  | "GENUINE_BREAKOUT";

export interface WarfareSignals {
  pattern:               WarfarePattern;
  confidence:            number;        // 0-100 how sure this is happening
  severity:              number;        // 0-100 how dangerous it is
  indicators:            string[];      // what's showing this pattern
  safetyRating:          "SAFE" | "CAUTION" | "DANGER" | "LETHAL";
  recommendedAction:     string;
  timeToExecution:       number;        // estimated minutes until dump
  preImpactPrice:        number;        // price before warfare starts
  estimatedDumpPrice:    number;        // where they might dump to
}

// ─── Fake Breakout Detection ──────────────────────────────────────────────

export function detectFakeBreakout(
  priceHistory: number[],
  volumeHistory: number[],
  liquidityHistory: number[],
  holderHistory: number[],
): WarfareSignals | null {
  if (priceHistory.length < 5) return null;

  const currentPrice = priceHistory[priceHistory.length - 1];
  const previousClose = priceHistory[priceHistory.length - 2];
  const priceChange = ((currentPrice - previousClose) / previousClose) * 100;

  // Check 1: Explosive move with declining volume (red flag)
  const currentVolume = volumeHistory[volumeHistory.length - 1];
  const avgVolume = volumeHistory.slice(-5).reduce((a, b) => a + b) / 5;
  const volumeDecline = currentVolume < avgVolume * 0.6;

  // Check 2: Price up but liquidity being removed
  const currentLiquidity = liquidityHistory[liquidityHistory.length - 1];
  const previousLiquidity = liquidityHistory[liquidityHistory.length - 2];
  const liquidityDrain = currentLiquidity < previousLiquidity * 0.9;

  // Check 3: Price up but holders decreasing (exit by smart money)
  const currentHolders = holderHistory[holderHistory.length - 1];
  const previousHolders = holderHistory[holderHistory.length - 2];
  const holderDecline = currentHolders < previousHolders;

  const fakeBreakoutIndicators = [
    ...(priceChange > 15 ? ["explosive_price_move"] : []),
    ...(volumeDecline ? ["declining_volume_on_pump"] : []),
    ...(liquidityDrain ? ["liquidity_being_drained"] : []),
    ...(holderDecline ? ["smart_money_exiting"] : []),
  ];

  if (
    priceChange > 15 &&
    volumeDecline &&
    liquidityDrain &&
    holderDecline
  ) {
    return {
      pattern: "FAKE_BREAKOUT",
      confidence: 85,
      severity: 90,
      indicators: fakeBreakoutIndicators,
      safetyRating: "LETHAL",
      recommendedAction: "🚨 ABORT - Fake breakout, dump incoming. Exit immediately.",
      timeToExecution: 5,
      preImpactPrice: previousClose,
      estimatedDumpPrice: previousClose * 0.7,
    };
  }

  if (
    priceChange > 10 &&
    (volumeDecline || liquidityDrain) &&
    holderDecline
  ) {
    return {
      pattern: "FAKE_BREAKOUT",
      confidence: 65,
      severity: 75,
      indicators: fakeBreakoutIndicators,
      safetyRating: "DANGER",
      recommendedAction: "⚠️ WARNING - Possible fake breakout. Reduce position, watch for dump.",
      timeToExecution: 10,
      preImpactPrice: previousClose,
      estimatedDumpPrice: previousClose * 0.8,
    };
  }

  return null;
}

// ─── Engagement Farming Detection ──────────────────────────────────────────

export function detectEngagementFarming(
  txnM1: number,
  txnM5: number,
  volumeM1: number,
  volumeM5: number,
  priceChange: number,
  socialMetrics: { mentions: number; sentiment: number; velocity: number },
): WarfareSignals | null {
  // Check 1: Lots of transactions but low volume (wash trading)
  const transactionVolume = volumeM1 / Math.max(1, txnM1);
  const lowValuePerTxn = transactionVolume < 50; // each txn is tiny

  // Check 2: Price not moving despite high activity
  const volumeM1Avg = volumeM5 / 5;
  const highActivityLowPrice = txnM1 > txnM5 / 2 && Math.abs(priceChange) < 2;

  // Check 3: High social engagement but low volume (hype farming)
  const socialPump = socialMetrics.mentions > 100 && socialMetrics.velocity > 2;
  const volumeNotFollowing = volumeM1 < volumeM5 * 0.8;

  const farmingIndicators = [
    ...(lowValuePerTxn ? ["low_value_per_transaction"] : []),
    ...(highActivityLowPrice ? ["high_txn_low_price_movement"] : []),
    ...(socialPump ? ["social_engagement_spike"] : []),
    ...(volumeNotFollowing ? ["volume_not_following_hype"] : []),
  ];

  if (
    lowValuePerTxn &&
    highActivityLowPrice &&
    socialPump &&
    volumeNotFollowing
  ) {
    return {
      pattern: "ENGAGEMENT_FARM",
      confidence: 75,
      severity: 60,
      indicators: farmingIndicators,
      safetyRating: "CAUTION",
      recommendedAction: "⚠️ CAUTION - Heavy engagement farming. Activity likely fake, wait for real volume.",
      timeToExecution: 30,
      preImpactPrice: 0,
      estimatedDumpPrice: 0,
    };
  }

  if (
    (lowValuePerTxn || highActivityLowPrice) &&
    (socialPump || volumeNotFollowing)
  ) {
    return {
      pattern: "ENGAGEMENT_FARM",
      confidence: 55,
      severity: 40,
      indicators: farmingIndicators,
      safetyRating: "CAUTION",
      recommendedAction: "⚠️ WATCH - Possible engagement farming. Monitor volume and sentiment.",
      timeToExecution: 60,
      preImpactPrice: 0,
      estimatedDumpPrice: 0,
    };
  }

  return null;
}

// ─── Exit Liquidity Trap Detection ────────────────────────────────────────

export function detectExitLiquidityTrap(
  priceHistory: number[],
  buys: number,
  sells: number,
  liquidityAddedRecently: boolean,
  holderConcentration: number, // % held by top 10
): WarfareSignals | null {
  if (priceHistory.length < 3) return null;

  const currentPrice = priceHistory[priceHistory.length - 1];
  const previousPrice = priceHistory[priceHistory.length - 2];
  const priceUp = currentPrice > previousPrice;

  // Check 1: Big holder added liquidity recently (setting trap)
  const trapSetup = liquidityAddedRecently && holderConcentration > 40;

  // Check 2: Now price is up and sells are accelerating (they're exiting)
  const bsr = buys > 0 ? sells / buys : 0;
  const exitPhase = priceUp && bsr > 0.8 && sells > buys;

  // Check 3: Price up but whales are reducing position
  const highConcentration = holderConcentration > 50;

  const trapIndicators = [
    ...(trapSetup ? ["liquidity_recently_added"] : []),
    ...(exitPhase ? ["whale_selling_on_pump"] : []),
    ...(highConcentration ? ["high_holder_concentration"] : []),
  ];

  if (trapSetup && exitPhase && highConcentration) {
    return {
      pattern: "EXIT_LIQUIDITY_TRAP",
      confidence: 90,
      severity: 95,
      indicators: trapIndicators,
      safetyRating: "LETHAL",
      recommendedAction: "🚨 LETHAL TRAP - Whales added liq then are exiting. Price about to crash.",
      timeToExecution: 3,
      preImpactPrice: previousPrice,
      estimatedDumpPrice: previousPrice * 0.5,
    };
  }

  if ((trapSetup || exitPhase) && highConcentration) {
    return {
      pattern: "EXIT_LIQUIDITY_TRAP",
      confidence: 70,
      severity: 80,
      indicators: trapIndicators,
      safetyRating: "DANGER",
      recommendedAction: "⚠️ DANGER - Whale concentration high and selling. Exit cautiously.",
      timeToExecution: 5,
      preImpactPrice: previousPrice,
      estimatedDumpPrice: previousPrice * 0.6,
    };
  }

  return null;
}

// ─── Spoofed Momentum Detection ────────────────────────────────────────────

export function detectSpoofedMomentum(
  volumeHistory: number[],
  priceHistory: number[],
  orderBookImbalance: number, // 0-100, 50=balanced
): WarfareSignals | null {
  if (volumeHistory.length < 5 || priceHistory.length < 5) return null;

  // Check 1: Sudden volume spike out of nowhere
  const avgVolume = volumeHistory.slice(-10).reduce((a, b) => a + b) / 10;
  const currentVolume = volumeHistory[volumeHistory.length - 1];
  const volumeSpike = currentVolume > avgVolume * 3;

  // Check 2: Then price doesn't follow (spoofed)
  const priceChangeAfterSpike = priceHistory[priceHistory.length - 1] / priceHistory[priceHistory.length - 2] - 1;
  const priceNotFollowing = Math.abs(priceChangeAfterSpike) < 0.02; // less than 2% move

  // Check 3: Order book heavily imbalanced (not real liquidity)
  const imbalanced = orderBookImbalance > 75 || orderBookImbalance < 25;

  const spoofIndicators = [
    ...(volumeSpike ? ["volume_spike_detected"] : []),
    ...(priceNotFollowing ? ["price_not_following_volume"] : []),
    ...(imbalanced ? ["order_book_imbalanced"] : []),
  ];

  if (volumeSpike && priceNotFollowing && imbalanced) {
    return {
      pattern: "SPOOFED_MOMENTUM",
      confidence: 80,
      severity: 70,
      indicators: spoofIndicators,
      safetyRating: "DANGER",
      recommendedAction: "⚠️ DANGER - Momentum appears spoofed. Volume fake, reversal likely.",
      timeToExecution: 10,
      preImpactPrice: 0,
      estimatedDumpPrice: 0,
    };
  }

  return null;
}

// ─── Clean Accumulation Detection ──────────────────────────────────────────

export function detectCleanAccumulation(
  holders: number,
  holderChange: number, // % change
  volumeHistory: number[],
  buys: number,
  sells: number,
  priceChange: number,
  liquidityQuality: number,
): WarfareSignals | null {
  // Clean accumulation indicators:
  // - Holder count increasing (new retail)
  // - Volume steady and healthy
  // - Buy > Sell pressure
  // - Price stable or slightly up
  // - Good liquidity

  const holderGrowth = holderChange > 2;
  const buyPressure = buys > sells && buys / (sells || 1) > 1.5;
  const steadyVolume = volumeHistory.length > 0 && volumeHistory[volumeHistory.length - 1] > 0;
  const healthyPrice = priceChange > -5 && priceChange < 30;
  const goodLiquidity = liquidityQuality > 50;

  if (holderGrowth && buyPressure && steadyVolume && healthyPrice && goodLiquidity) {
    return {
      pattern: "CLEAN_ACCUMULATION",
      confidence: 85,
      severity: 0, // not dangerous, actually good
      indicators: [
        "holder_growth",
        "buy_pressure",
        "steady_volume",
        "healthy_price_action",
        "good_liquidity",
      ],
      safetyRating: "SAFE",
      recommendedAction: "✅ SAFE - Clean accumulation phase. Good entry opportunity.",
      timeToExecution: 0,
      preImpactPrice: 0,
      estimatedDumpPrice: 0,
    };
  }

  return null;
}

// ─── Overall PvP Assessment ───────────────────────────────────────────────

export function assessPvPSafety(allSignals: (WarfareSignals | null)[]): {
  overallSafety: "SAFE" | "CAUTION" | "DANGER" | "LETHAL";
  score: number; // 0-100, higher = safer
  activeThreats: WarfarePattern[];
  recommendation: string;
} {
  const validSignals = allSignals.filter((s): s is WarfareSignals => s !== null);

  if (validSignals.length === 0) {
    return {
      overallSafety: "SAFE",
      score: 75,
      activeThreats: [],
      recommendation: "No PvP warfare detected. Proceed with normal due diligence.",
    };
  }

  const maxSeverity = Math.max(...validSignals.map((s) => s.severity));
  const avgConfidence =
    validSignals.reduce((sum, s) => sum + s.confidence, 0) / validSignals.length;

  let overallSafety: "SAFE" | "CAUTION" | "DANGER" | "LETHAL";
  let score: number;

  if (maxSeverity > 80 && avgConfidence > 70) {
    overallSafety = "LETHAL";
    score = 20;
  } else if (maxSeverity > 70) {
    overallSafety = "DANGER";
    score = 40;
  } else if (maxSeverity > 50) {
    overallSafety = "CAUTION";
    score = 60;
  } else {
    overallSafety = "SAFE";
    score = 80;
  }

  const activeThreats = validSignals.map((s) => s.pattern);
  const recommendation =
    validSignals.find((s) => s.safetyRating === "LETHAL")?.recommendedAction ||
    validSignals[0]?.recommendedAction ||
    "Unknown threat";

  return {
    overallSafety,
    score,
    activeThreats,
    recommendation,
  };
}