// src/services/intelligence/narrative-rotation-tracker.ts
// Catalyst Apex Trader v3.0 — Narrative Rotation Tracker
//
// Capital flow & attention rotation intelligence.
// System tracks where liquidity and CT attention migrate next.
// Detects narrative saturation before it crashes.
// Identifies emerging narratives before they explode.
//
// Core question: "Which narrative is absorbing capital RIGHT NOW?"
// Secondary: "Where is capital flowing FROM?"

import { supabase } from "../../db/supabase";

// ─── Narrative Types ──────────────────────────────────────────────────────

export type NarrativeCategory =
  | "AI"                  // AI agents, oracles, ML tokens
  | "GAMING"              // game tokens, in-game assets
  | "MEME"                // pure meme/culture (DOGE, SHIB style)
  | "DEFI"                // yield, lending, liquidity
  | "RWA"                 // real world assets
  | "L2"                  // layer 2 solutions
  | "INFRA"               // blockchain infrastructure
  | "SOLANA_SPECIFIC"     // Solana ecosystem (Magic Eden, etc)
  | "CELEBRITY"           // celebrity/influencer coins
  | "STORY"               // narrative-driven (low-cap storytelling)
  | "CULT"                // cult coins (extreme community)
  | "SHITCOIN"            // unironic shitcoins
  | "UNKNOWN";

export interface NarrativeFlow {
  category:              NarrativeCategory;
  volumeNow:             number;        // $ volume last hour
  volumePrevious:        number;        // $ volume previous hour
  flowRate:              number;        // % change hour/hour
  activeCoins:           number;        // how many coins in this narrative
  dominantCoin:          string;        // top coin by volume
  dominantCoinPct:       number;        // % of category volume
  averageReturn:         number;        // avg return of coins in category
  topPerformer:          string;        // best performer
  topPerformerReturn:    number;        // % return
  saturation:            number;        // 0-100 (how saturated is this narrative)
  emergenceStage:        "EMERGING" | "GROWING" | "PEAK" | "DECLINING" | "DEAD";
  capitalInflow:         number;        // $ coming in/out
  ctEngagement:          number;        // 0-100 (Twitter engagement level)
  newCoinReleases:       number;        // how many new coins this hour
  predictions:           {
    nextHot:             NarrativeCategory;
    probability:         number;        // 0-100
    reason:              string;
  };
}

export interface NarrativeRotationEvent {
  timestamp:             number;
  from:                  NarrativeCategory;
  to:                    NarrativeCategory;
  volumeShift:           number;        // $ moved
  confidence:            number;        // 0-100
  speed:                 "SLOW" | "MEDIUM" | "FAST" | "LIGHTNING";
  catalysts:             string[];      // what triggered the rotation
  affectedCoins:         string[];      // which coins benefited/suffered
}

// ─── Narrative Saturation Detection ───────────────────────────────────────

export function calculateNarrativeSaturation(flow: NarrativeFlow): number {
  let saturation = 50; // baseline

  // Factor 1: Dominance concentration
  // If one coin dominates >30%, narrative is saturated
  if (flow.dominantCoinPct > 40) {
    saturation += 30;
  } else if (flow.dominantCoinPct > 25) {
    saturation += 15;
  }

  // Factor 2: Number of active coins
  // Too many coins dilutes the narrative
  if (flow.activeCoins < 5) {
    saturation -= 10; // emerging, not saturated
  } else if (flow.activeCoins > 50) {
    saturation += 20; // oversaturated
  }

  // Factor 3: Average return
  // If avg return is very high, narrative peaked
  if (flow.averageReturn > 300) {
    saturation += 25; // very saturated
  } else if (flow.averageReturn < -30) {
    saturation -= 20; // declining
  }

  // Factor 4: Flow rate
  // Slowing inflow = saturation
  if (flow.flowRate < 0.1 && flow.flowRate >= 0) {
    saturation += 15;
  } else if (flow.flowRate > 1) {
    saturation -= 15; // accelerating
  }

  // Factor 5: CT engagement
  // Declining engagement = saturation
  if (flow.ctEngagement < 20) {
    saturation += 20;
  } else if (flow.ctEngagement > 80) {
    saturation -= 15;
  }

  return Math.max(0, Math.min(100, saturation));
}

// ─── Emergence Stage Detection ────────────────────────────────────────────

export function detectEmergenceStage(
  saturation: number,
  flowRate: number,
  ctEngagement: number,
  activeCoins: number,
): "EMERGING" | "GROWING" | "PEAK" | "DECLINING" | "DEAD" {
  // EMERGING: low saturation, accelerating flow, low active coins
  if (saturation < 30 && flowRate > 0.5 && activeCoins < 10) {
    return "EMERGING";
  }

  // GROWING: moderate saturation, positive flow, increasing coins
  if (saturation < 60 && flowRate > 0.1 && activeCoins >= 10 && ctEngagement > 40) {
    return "GROWING";
  }

  // PEAK: high saturation, accelerating coins, extreme engagement
  if (saturation > 70 && activeCoins > 30 && ctEngagement > 75) {
    return "PEAK";
  }

  // DECLINING: high saturation, slowing flow, declining engagement
  if (saturation > 60 && flowRate < 0 && ctEngagement < 40) {
    return "DECLINING";
  }

  // DEAD: very high saturation, negative flow, no engagement
  if (saturation > 80 && flowRate < -0.5 && ctEngagement < 15) {
    return "DEAD";
  }

  // Default to GROWING
  return "GROWING";
}

// ─── Capital Rotation Prediction ──────────────────────────────────────────

export function predictNarrativeRotation(
  narrativeFlows: Map<NarrativeCategory, NarrativeFlow>,
): { nextHot: NarrativeCategory; probability: number; reason: string } {
  if (narrativeFlows.size === 0) {
    return {
      nextHot: "UNKNOWN",
      probability: 0,
      reason: "No narrative data available",
    };
  }

  const flows = Array.from(narrativeFlows.values());

  // Find emerging narratives (high growth potential)
  const emergingCandidates = flows.filter((f) => {
    return (
      (f.emergenceStage === "EMERGING" || f.emergenceStage === "GROWING") &&
      f.saturation < 50 &&
      f.flowRate > 0.2 &&
      f.ctEngagement > 30
    );
  });

  // Find declining narratives (avoid these)
  const decliningNarratives = flows.filter((f) => f.emergenceStage === "DECLINING");

  if (emergingCandidates.length === 0) {
    // No emerging narratives, rotate away from most saturated
    const leastSaturated = flows.reduce((min, f) =>
      f.saturation < min.saturation ? f : min
    );

    return {
      nextHot: leastSaturated.category,
      probability: 40,
      reason: `All narratives saturated. Rotating to least saturated: ${leastSaturated.category}`,
    };
  }

  // Pick highest engagement emerging narrative
  const topCandidate = emergingCandidates.reduce((best, f) =>
    f.ctEngagement > best.ctEngagement ? f : best
  );

  const probability = Math.min(100, topCandidate.ctEngagement + topCandidate.flowRate * 20);

  return {
    nextHot: topCandidate.category,
    probability: Math.round(probability),
    reason: `${topCandidate.category} emerging with ${topCandidate.ctEngagement}% CT engagement and ${(topCandidate.flowRate * 100).toFixed(0)}% inflow acceleration`,
  };
}

// ─── Store Narrative Flow Data ────────────────────────────────────────────

export async function recordNarrativeFlow(
  flow: NarrativeFlow,
): Promise<void> {
  try {
    // Calculate saturation
    const saturation = calculateNarrativeSaturation(flow);
    const emergenceStage = detectEmergenceStage(
      saturation,
      flow.flowRate,
      flow.ctEngagement,
      flow.activeCoins,
    );

    await supabase.from("narrative_flows").insert({
      category: flow.category,
      timestamp: Math.floor(Date.now() / 1000),
      volume_now: flow.volumeNow,
      volume_previous: flow.volumePrevious,
      flow_rate: flow.flowRate,
      active_coins: flow.activeCoins,
      dominant_coin: flow.dominantCoin,
      dominant_coin_pct: flow.dominantCoinPct,
      average_return: flow.averageReturn,
      top_performer: flow.topPerformer,
      top_performer_return: flow.topPerformerReturn,
      saturation,
      emergence_stage: emergenceStage,
      capital_inflow: flow.capitalInflow,
      ct_engagement: flow.ctEngagement,
      new_coin_releases: flow.newCoinReleases,
    });

    console.log(
      `📊 Narrative flow: ${flow.category} | ${emergenceStage} | Sat: ${saturation}% | Flow: ${(flow.flowRate * 100).toFixed(0)}%`
    );
  } catch (err: any) {
    console.error("❌ Narrative flow recording error:", err.message);
  }
}

// ─── Detect Rotation Events ───────────────────────────────────────────────

export async function detectRotationEvent(
  previousFlows: Map<NarrativeCategory, NarrativeFlow>,
  currentFlows: Map<NarrativeCategory, NarrativeFlow>,
): Promise<NarrativeRotationEvent | null> {
  try {
    // Find which narrative lost capital
    let maxCapitalLoss = 0;
    let losingNarrative: NarrativeCategory | null = null;

    previousFlows.forEach((prev, category) => {
      const current = currentFlows.get(category);
      if (current) {
        const volumeLoss = prev.volumeNow - current.volumeNow;
        if (volumeLoss > maxCapitalLoss) {
          maxCapitalLoss = volumeLoss;
          losingNarrative = category;
        }
      }
    });

    // Find which narrative gained capital
    let maxCapitalGain = 0;
    let gainingNarrative: NarrativeCategory | null = null;

    currentFlows.forEach((current, category) => {
      const prev = previousFlows.get(category);
      const volumeGain = prev ? current.volumeNow - prev.volumeNow : current.volumeNow;
      if (volumeGain > maxCapitalGain) {
        maxCapitalGain = volumeGain;
        gainingNarrative = category;
      }
    });

    // Only count as rotation if significant volume moved
    if (
      !losingNarrative ||
      !gainingNarrative ||
      maxCapitalGain < 50000 ||
      losingNarrative === gainingNarrative
    ) {
      return null;
    }

    // Determine rotation speed
    let speed: "SLOW" | "MEDIUM" | "FAST" | "LIGHTNING";
    if (maxCapitalGain > 1000000) {
      speed = "LIGHTNING";
    } else if (maxCapitalGain > 500000) {
      speed = "FAST";
    } else if (maxCapitalGain > 200000) {
      speed = "MEDIUM";
    } else {
      speed = "SLOW";
    }

    const gainingFlow = currentFlows.get(gainingNarrative)!;
    const affectedCoins = [gainingFlow.dominantCoin, gainingFlow.topPerformer];

    const event: NarrativeRotationEvent = {
      timestamp: Math.floor(Date.now() / 1000),
      from: losingNarrative,
      to: gainingNarrative,
      volumeShift: maxCapitalGain,
      confidence: Math.min(100, (maxCapitalGain / 100000) * 10),
      speed,
      catalysts: [], // Would be populated from social/news sources
      affectedCoins,
    };

    // Record the rotation event
    await supabase.from("narrative_rotations").insert({
      timestamp: event.timestamp,
      from_category: event.from,
      to_category: event.to,
      volume_shift: event.volumeShift,
      confidence: event.confidence,
      speed,
      affected_coins: event.affectedCoins,
    });

    console.log(
      `🔄 ROTATION DETECTED: ${event.from} → ${event.to} | ${speed} | $${(event.volumeShift / 1000).toFixed(0)}k | ${affectedCoins.join(", ")}`
    );

    return event;
  } catch (err: any) {
    console.error("❌ Rotation detection error:", err.message);
    return null;
  }
}

// ─── Narrative Trend History ──────────────────────────────────────────────

export async function getNarrativeTrend(
  category: NarrativeCategory,
  hours: number = 24,
): Promise<NarrativeFlow[]> {
  try {
    const sinceTimestamp = Math.floor(Date.now() / 1000) - hours * 3600;

    const { data } = await supabase
      .from("narrative_flows")
      .select("*")
      .eq("category", category)
      .gt("timestamp", sinceTimestamp)
      .order("timestamp", { ascending: false });

    return (data || []).map((row: any) => ({
      category: row.category,
      volumeNow: row.volume_now,
      volumePrevious: row.volume_previous,
      flowRate: row.flow_rate,
      activeCoins: row.active_coins,
      dominantCoin: row.dominant_coin,
      dominantCoinPct: row.dominant_coin_pct,
      averageReturn: row.average_return,
      topPerformer: row.top_performer,
      topPerformerReturn: row.top_performer_return,
      saturation: row.saturation,
      emergenceStage: row.emergence_stage,
      capitalInflow: row.capital_inflow,
      ctEngagement: row.ct_engagement,
      newCoinReleases: row.new_coin_releases,
      predictions: {
        nextHot: "UNKNOWN" as NarrativeCategory,
        probability: 0,
        reason: "",
      },
    }));
  } catch (err: any) {
    console.error("❌ Narrative trend error:", err.message);
    return [];
  }
}