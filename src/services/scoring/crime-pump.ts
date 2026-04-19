// src/services/scoring/crime-pump.ts
// Catalyst Apex Trader v2.1 — Crime Pump Detector
//
// Detects two types of coordinated pumps:
//
// Type 1 — NARRATIVE CLUSTER (coordinated community pump)
// Multiple tokens launch around the same narrative in a short window.
// One token starts pulling ahead in volume — that's the canonical coin.
// Pattern: CT groups agree on a name/narrative and pile in together.
// Examples: Rave, Asteroid — crime/news events spawn multiple tokens,
// the one with real volume wins.
//
// Type 2 — SILENT ACCUMULATION (insider positioning)
// Token launches quietly, price barely moves, but wallet count is
// growing steadily and buy sizes are increasing over time.
// This is smart money positioning before the public push.
// Pattern: few large buys, price flat, then sudden volume spike.

export interface CrimePumpResult {
  detected:   boolean;
  type:       "NARRATIVE_CLUSTER" | "SILENT_ACCUMULATION" | "NONE";
  confidence: number;       // 0-100
  reason:     string;
  canonical:  boolean;      // true = this is likely THE coin for the narrative
  positioning: "EARLY" | "FORMING" | "LATE" | "NONE";
}

// ─── Keyword extractor ────────────────────────────────────────────────────────
// Pulls meaningful words from token name/symbol for narrative matching

function extractKeywords(name: string, symbol: string): string[] {
  const text = `${name} ${symbol}`.toLowerCase();

  // Remove common filler words
  const stopWords = new Set([
    "the", "a", "an", "of", "on", "in", "at", "to", "for", "and",
    "or", "but", "is", "are", "was", "were", "coin", "token", "sol",
    "solana", "pump", "fun", "inu", "ai", "based",
  ]);

  return text
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

// ─── Narrative similarity ─────────────────────────────────────────────────────
// Returns 0-1 similarity score between two token names

function narrativeSimilarity(keywordsA: string[], keywordsB: string[]): number {
  if (keywordsA.length === 0 || keywordsB.length === 0) return 0;

  let matches = 0;
  for (const kw of keywordsA) {
    if (keywordsB.some((b) => b.includes(kw) || kw.includes(b))) {
      matches++;
    }
  }

  return matches / Math.max(keywordsA.length, keywordsB.length);
}

// ─── Chart shape reader ───────────────────────────────────────────────────────
// Reads momentum shape from available price data
// Returns: "accumulation" | "breakout" | "fomo" | "dump" | "flat"

function readMomentumShape(pair: any): string {
  const priceM5  = pair.priceChange?.m5  ?? 0;
  const priceH1  = pair.priceChange?.h1  ?? 0;
  const buys     = pair.txns?.m5?.buys   ?? 0;
  const sells    = pair.txns?.m5?.sells  ?? 0;
  const volLiq   = (pair.volume?.m5 ?? 0) / Math.max(pair.liquidity?.usd ?? 1, 1);
  const bsr      = sells > 0 ? buys / sells : buys;

  // Accumulation: price flat/slight up, steady buying, low sells
  if (priceM5 >= 0 && priceM5 <= 15 && priceH1 >= 0 && priceH1 <= 30 && bsr >= 1.5) {
    return "accumulation";
  }

  // Breakout: price accelerating, high buy volume, strong momentum
  if (priceM5 >= 15 && volLiq >= 1.5 && bsr >= 2) {
    return "breakout";
  }

  // FOMO: price spiked very hard, vol/liq extreme — likely late
  if (priceM5 >= 50 || volLiq >= 10) {
    return "fomo";
  }

  // Dump: price falling, sells dominant
  if (priceM5 < -10 || bsr < 0.7) {
    return "dump";
  }

  // Flat: not much happening
  return "flat";
}

// ─── Type 1: Narrative cluster detection ─────────────────────────────────────

function detectNarrativeCluster(
  currentPair:  any,
  recentPairs:  any[],
): { found: boolean; matchCount: number; isCanonical: boolean; confidence: number } {
  const now         = Date.now();
  const windowMs    = 30 * 60 * 1000; // 30 minute window

  const currentKeywords = extractKeywords(
    currentPair.baseToken?.name ?? "",
    currentPair.baseToken?.symbol ?? ""
  );

  if (currentKeywords.length === 0) {
    return { found: false, matchCount: 0, isCanonical: false, confidence: 0 };
  }

  // Find recent pairs with similar narrative launched in the same window
  const similarPairs = recentPairs.filter((p) => {
    if (p.baseToken?.address === currentPair.baseToken?.address) return false;
    const age = now - (p.pairCreatedAt ?? 0);
    if (age > windowMs) return false;

    const otherKeywords = extractKeywords(
      p.baseToken?.name ?? "",
      p.baseToken?.symbol ?? ""
    );

    return narrativeSimilarity(currentKeywords, otherKeywords) >= 0.4;
  });

  if (similarPairs.length < 2) {
    return { found: false, matchCount: 0, isCanonical: false, confidence: 0 };
  }

  // Determine if this is the canonical coin
  // Canonical = highest volume among similar narrative tokens
  const currentVol = currentPair.volume?.m5 ?? 0;
  const maxSimilarVol = Math.max(...similarPairs.map((p) => p.volume?.m5 ?? 0));
  const isCanonical = currentVol >= maxSimilarVol;

  const confidence = Math.min(100, similarPairs.length * 25 + (isCanonical ? 20 : 0));

  return {
    found:       true,
    matchCount:  similarPairs.length,
    isCanonical,
    confidence,
  };
}

// ─── Type 2: Silent accumulation detection ────────────────────────────────────

function detectSilentAccumulation(pair: any): { found: boolean; confidence: number } {
  const priceM5   = pair.priceChange?.m5  ?? 0;
  const priceH1   = pair.priceChange?.h1  ?? 0;
  const buys      = pair.txns?.m5?.buys   ?? 0;
  const sells     = pair.txns?.m5?.sells  ?? 0;
  const volM5     = pair.volume?.m5       ?? 0;
  const volH1     = pair.volume?.h1       ?? 0;
  const liqUsd    = pair.liquidity?.usd   ?? 0;
  const mcap      = pair.marketCap ?? pair.fdv ?? 0;
  const now       = Date.now();
  const ageMin    = (now - (pair.pairCreatedAt ?? now)) / 1000 / 60;
  const bsr       = sells > 0 ? buys / sells : buys;

  // Silent accumulation pattern:
  // - Token 5-60 mins old (not brand new, has some history)
  // - Price barely moved (not pumped yet)
  // - Steady buying (bsr >= 1.5)
  // - Volume accelerating (h1 vol building, m5 vol healthy)
  // - Low MCap (under $100k — still early)
  // - Liquidity reasonable (not a dust pool)

  const conditions = {
    correctAge:        ageMin >= 5 && ageMin <= 60,
    priceFlat:         Math.abs(priceM5) <= 20 && priceH1 >= -10 && priceH1 <= 50,
    steadyBuying:      bsr >= 1.5 && buys >= 15,
    volumeBuilding:    volM5 > 0 && volH1 > volM5 * 2, // hourly vol > 2x last 5min pace
    lowMcap:           mcap === 0 || mcap <= 100_000,
    healthyLiquidity:  liqUsd >= 8_000,
  };

  const passedCount = Object.values(conditions).filter(Boolean).length;

  if (passedCount >= 4 && conditions.correctAge && conditions.steadyBuying) {
    return {
      found:      true,
      confidence: Math.min(100, passedCount * 16),
    };
  }

  return { found: false, confidence: 0 };
}

// ─── Positioning advice ───────────────────────────────────────────────────────
// Based on momentum shape, tells us where we are in the pump cycle

function getPositioning(pair: any, type: string): "EARLY" | "FORMING" | "LATE" | "NONE" {
  const shape = readMomentumShape(pair);
  const mcap  = pair.marketCap ?? pair.fdv ?? 0;

  if (type === "SILENT_ACCUMULATION") {
    if (shape === "accumulation") return "EARLY";
    if (shape === "breakout")     return "FORMING";
    if (shape === "fomo")         return "LATE";
  }

  if (type === "NARRATIVE_CLUSTER") {
    if (mcap <= 30_000)           return "EARLY";
    if (mcap <= 100_000)          return "FORMING";
    if (mcap <= 300_000)          return "LATE";
  }

  return "NONE";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectCrimePump(
  pair:        any,
  recentPairs: any[],
): CrimePumpResult {
  // Check narrative cluster first
  const cluster = detectNarrativeCluster(pair, recentPairs);
  if (cluster.found && cluster.confidence >= 50) {
    const positioning = getPositioning(pair, "NARRATIVE_CLUSTER");
    const shape       = readMomentumShape(pair);

    return {
      detected:    true,
      type:        "NARRATIVE_CLUSTER",
      confidence:  cluster.confidence,
      canonical:   cluster.isCanonical,
      positioning,
      reason:      `${cluster.matchCount + 1} tokens launched on same narrative in 30min window. ` +
                   `${cluster.isCanonical ? "This appears to be THE canonical coin (highest volume)." : "Not the volume leader — check for canonical coin."} ` +
                   `Chart shape: ${shape}. Positioning: ${positioning}.`,
    };
  }

  // Check silent accumulation
  const silent = detectSilentAccumulation(pair);
  if (silent.found && silent.confidence >= 50) {
    const positioning = getPositioning(pair, "SILENT_ACCUMULATION");
    const shape       = readMomentumShape(pair);

    return {
      detected:    true,
      type:        "SILENT_ACCUMULATION",
      confidence:  silent.confidence,
      canonical:   true, // silent accumulation is always the target coin
      positioning,
      reason:      `Price flat while wallets accumulate quietly. ` +
                   `Chart shape: ${shape}. Smart money positioning before public push. ` +
                   `Positioning: ${positioning}.`,
    };
  }

  return {
    detected:    false,
    type:        "NONE",
    confidence:  0,
    canonical:   false,
    positioning: "NONE",
    reason:      "",
  };
}