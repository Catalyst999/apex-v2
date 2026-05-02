// src/services/scoring/portfolio-correlation.ts 
// Catalyst Apex Trader v2.2 — Portfolio Correlation & Concentration Control 
// 
// Prevents over-exposure to correlated narratives. 
// 
// Rules: 
// - max 1 major active position per narrative category 
// - max 2 minor correlated positions 
// - avoid holding 3+ highly correlated narratives simultaneously 
// - correlation reduces position size automatically 
// - Tier 1 narratives may override partially but never bypass risk controls 
// 
// Narrative categories: 
// - AI 
// - politics 
// - anime 
// - utility 
// - infra 
// - celebrity 
// - religion 
// - culture/lore 
// - meme 
// - defi 
import { supabase } from "../../db/supabase"; 
import { NarrativeMatch } from "./narrative-engine"; 
// ─── Types 
────────────────────────────────────────────────────────────
──────── 
export type NarrativeCategory = 
| "AI" 
| "politics" 
| "anime" 
| "utility" 
| "infra" 
| "celebrity" 
| "religion" 
| "culture" 
| "meme" 
| "defi" 
| "unknown"; 
export interface PortfolioExposure { 
  category:       NarrativeCategory; 
  activeCount:    number; 
  majorPosition:  string | null;           // position ID of major position 
  minorPositions: string[];                // position IDs of minor positions 
  totalSize:      number;                  // total USD exposure 
  correlations:   Map<NarrativeCategory, number>; // 0-1 correlation to other categories 
} 
 
export interface CorrelationCheckResult { 
  allowed:              boolean; 
  categoryExposure:     PortfolioExposure; 
  correlatedCategories: NarrativeCategory[]; 
  sizeMultiplier:       number;            // 0.25 to 1.0 
  reason:               string; 
} 
 
// ─── Narrative classification 
───────────────────────────────────────────────── 
 
function classifyNarrative(narrative: NarrativeMatch | null): NarrativeCategory { 
  if (!narrative || !narrative.matched) return "unknown"; 
 
  const name = narrative.narrativeName.toLowerCase(); 
  const keywords = narrative.keywords.map(k => k.toLowerCase()); 
 
  // AI keywords 
  if (name.includes("ai") || keywords.some(k => k.includes("gpt") || k.includes("claude") || 
k.includes("llm"))) { 
    return "AI"; 
  } 
 
  // Politics 
  if (name.includes("trump") || name.includes("politics") || name.includes("election") || 
      keywords.some(k => k.includes("trump") || k.includes("politics") || k.includes("vote"))) { 
    return "politics"; 
  } 
 
  // Anime 
  if (name.includes("anime") || name.includes("manga") || keywords.some(k => 
k.includes("anime"))) { 
    return "anime"; 
  } 
 
  // Utility & Infrastructure 
  if (name.includes("utility") || name.includes("infra") || name.includes("protocol")) { 
    return "infra"; 
  } 
 
  // Celebrity 
  if (name.includes("celebrity") || name.includes("kol") || name.includes("influencer")) { 
    return "celebrity"; 
  } 
 
  // Religion 
  if (name.includes("religion") || name.includes("faith") || keywords.some(k => k.includes("faith"))) 
{ 
    return "religion"; 
  } 
 
  // Culture/Lore 
  if (name.includes("culture") || name.includes("lore") || name.includes("meme culture")) { 
    return "culture"; 
  } 
 
  // Meme 
  if (name.includes("meme") && !name.includes("meme culture")) { 
    return "meme"; 
  } 
 
  // DeFi 
  if (name.includes("defi") || name.includes("yield") || name.includes("lending")) { 
    return "defi"; 
  } 
 
  return "unknown"; 
} 
 
// ─── Build category correlation matrix 
──────────────────────────────────────── 
// Higher correlation = more restrictive 
 
function getCorrelationMatrix(): Record<NarrativeCategory, Record<NarrativeCategory, 
number>> { 
  return { 
    AI:        { AI: 1.0, politics: 0.2, anime: 0.1, utility: 0.4, infra: 0.3, celebrity: 0.1, religion: 0.0, 
culture: 0.1, meme: 0.2, defi: 0.2, unknown: 0 }, 
    politics:  { AI: 0.2, politics: 1.0, anime: 0.1, utility: 0.1, infra: 0.1, celebrity: 0.5, religion: 0.3, 
culture: 0.2, meme: 0.3, defi: 0.0, unknown: 0 }, 
    anime:     { AI: 0.1, politics: 0.1, anime: 1.0, utility: 0.1, infra: 0.0, celebrity: 0.2, religion: 0.0, 
culture: 0.3, meme: 0.2, defi: 0.0, unknown: 0 }, 
    utility:   { AI: 0.4, politics: 0.1, anime: 0.1, utility: 1.0, infra: 0.7, celebrity: 0.0, religion: 0.0, 
culture: 0.0, meme: 0.1, defi: 0.4, unknown: 0 }, 
    infra:     { AI: 0.3, politics: 0.1, anime: 0.0, utility: 0.7, infra: 1.0, celebrity: 0.0, religion: 0.0, 
culture: 0.0, meme: 0.0, defi: 0.5, unknown: 0 }, 
    celebrity: { AI: 0.1, politics: 0.5, anime: 0.2, utility: 0.0, infra: 0.0, celebrity: 1.0, religion: 0.2, 
culture: 0.3, meme: 0.4, defi: 0.0, unknown: 0 }, 
    religion:  { AI: 0.0, politics: 0.3, anime: 0.0, utility: 0.0, infra: 0.0, celebrity: 0.2, religion: 1.0, 
culture: 0.2, meme: 0.1, defi: 0.0, unknown: 0 }, 
    culture:   { AI: 0.1, politics: 0.2, anime: 0.3, utility: 0.0, infra: 0.0, celebrity: 0.3, religion: 0.2, 
culture: 1.0, meme: 0.6, defi: 0.0, unknown: 0 }, 
    meme:      { AI: 0.2, politics: 0.3, anime: 0.2, utility: 0.1, infra: 0.0, celebrity: 0.4, religion: 0.1, 
culture: 0.6, meme: 1.0, defi: 0.0, unknown: 0 }, 
    defi:      { AI: 0.2, politics: 0.0, anime: 0.0, utility: 0.4, infra: 0.5, celebrity: 0.0, religion: 0.0, 
culture: 0.0, meme: 0.0, defi: 1.0, unknown: 0 }, 
    unknown:   { AI: 0, politics: 0, anime: 0, utility: 0, infra: 0, celebrity: 0, religion: 0, culture: 0, 
meme: 0, defi: 0, unknown: 0 }, 
  }; 
} 
 
// ─── Get current portfolio exposures 
─────────────────────────────────────────── 
 
async function getPortfolioExposures(): Promise<Map<NarrativeCategory, PortfolioExposure>> 
{ 
  const { data: openTrades } = await supabase 
    .from("trades") 
    .select("id, amount_usd, pairs(address, narrative)") 
    .eq("status", "open"); 
 
  const exposures = new Map<NarrativeCategory, PortfolioExposure>(); 
  const correlationMatrix = getCorrelationMatrix(); 
 
  if (!openTrades) return exposures; 
 
  // Group by narrative category 
  for (const trade of openTrades) { 
    const pair = (trade as any).pairs; 
    const narrative = pair?.narrative ?? null; 
    const category = classifyNarrative(narrative as any); 
 
    if (!exposures.has(category)) { 
      exposures.set(category, { 
        category, 
        activeCount: 0, 
        majorPosition: null, 
        minorPositions: [], 
        totalSize: 0, 
        correlations: new Map(Object.entries(correlationMatrix[category])), 
      }); 
    } 
 
    const exposure = exposures.get(category)!; 
    exposure.activeCount++; 
    exposure.totalSize += (trade as any).amount_usd ?? 0; 
 
    // Track major vs minor positions 
    if ((trade as any).amount_usd > exposure.totalSize * 0.6 || exposure.majorPosition === null) { 
      if (exposure.majorPosition && exposure.majorPosition !== trade.id) { 
        exposure.minorPositions.push(exposure.majorPosition); 
      } 
      exposure.majorPosition = trade.id; 
    } else { 
      exposure.minorPositions.push(trade.id); 
    } 
  } 
 
  return exposures; 
} 
 
// ─── Check correlation constraints 
──────────────────────────────────────────── 
 
export async function checkPortfolioCorrelation( 
  newNarrative: NarrativeMatch | null, 
  newSize: number, 
  tier1OverrideAllowed: boolean = false, 
): Promise<CorrelationCheckResult> { 
  const newCategory = classifyNarrative(newNarrative); 
  const exposures = await getPortfolioExposures(); 
 
  // Count existing positions in new category 
  const existingInCategory = exposures.get(newCategory); 
  const existingCount = existingInCategory?.activeCount ?? 0; 
 
  // Find correlated categories (correlation > 0.3) 
  const correlatedCategories: NarrativeCategory[] = []; 
  let maxCorrelation = 0; 
 
  for (const [otherCategory, exposure] of exposures) { 
    if (otherCategory === newCategory) continue; 
 
    const correlation = existingInCategory?.correlations.get(otherCategory as NarrativeCategory) 
?? 0; 
    if (correlation > 0.3 && exposure.activeCount > 0) { 
      correlatedCategories.push(otherCategory as NarrativeCategory); 
      maxCorrelation = Math.max(maxCorrelation, correlation); 
    } 
  } 
 
  // ── Rule enforcement 
────────────────────────────────────────────────────── 
 
  const rules: { 
    passed: boolean; 
    reason: string; 
  }[] = []; 
 
  // Rule 1: max 1 major per category 
  if (existingCount >= 1) { 
    if (tier1OverrideAllowed && newNarrative?.tier === 1) { 
      rules.push({ 
        passed: true, 
        reason: `Tier 1 override: 2nd position in ${newCategory} allowed (${existingCount + 1} 
total)`, 
      }); 
    } else { 
      rules.push({ 
        passed: existingCount < 1, 
        reason: existingCount >= 1 
          ? `Category ${newCategory} already has ${existingCount} position(s)` 
          : `OK: first position in ${newCategory}`, 
      }); 
    } 
  } 
 
  // Rule 2: max 2 minor correlated positions 
  const totalCorrelated = correlatedCategories.reduce( 
    (sum, cat) => sum + ((exposures.get(cat)?.activeCount) ?? 0), 
    0 
  ); 
 
  if (totalCorrelated >= 2 && !tier1OverrideAllowed) { 
    rules.push({ 
      passed: false, 
      reason: `Already holding ${totalCorrelated} correlated position(s) from 
${correlatedCategories.length} categories`, 
    }); 
  } else { 
    rules.push({ 
      passed: true, 
      reason: `Correlated positions: ${totalCorrelated} (under limit)`, 
    }); 
  } 
 
  // Rule 3: avoid 3+ highly correlated 
  const highCorrelation = correlatedCategories.filter( 
    (cat) => (existingInCategory?.correlations.get(cat) ?? 0) > 0.5 
  ); 
 
  if (highCorrelation.length >= 2) { 
    rules.push({ 
      passed: !tier1OverrideAllowed, 
      reason: `High correlation to ${highCorrelation.length} categories (${highCorrelation.join(", 
")})`, 
    }); 
  } 
 
  // ── Calculate size multiplier 
────────────────────────────────────────── 
 
  let sizeMultiplier = 1.0; 
 
  // Reduce size based on category saturation 
  if (existingCount >= 1) { 
    sizeMultiplier *= 0.75; 
  } 
 
  // Reduce size based on correlation 
  if (maxCorrelation > 0.7) { 
    sizeMultiplier *= 0.5; 
  } else if (maxCorrelation > 0.5) { 
    sizeMultiplier *= 0.7; 
  } else if (maxCorrelation > 0.3) { 
    sizeMultiplier *= 0.85; 
  } 
 
  // Clamp to 0.25 minimum 
  sizeMultiplier = Math.max(0.25, sizeMultiplier); 
 
  // ── Final decision 
───────────────────────────────────────────────────── 
 
  const allPassed = rules.every((r) => r.passed); 
  const reasons = rules.map((r) => r.reason).join(" | "); 
 
  const result: CorrelationCheckResult = { 
    allowed: allPassed || (tier1OverrideAllowed && newNarrative?.tier === 1), 
    categoryExposure: existingInCategory || { 
      category: newCategory, 
      activeCount: 0, 
      majorPosition: null, 
      minorPositions: [], 
      totalSize: 0, 
      correlations: new Map(), 
    }, 
    correlatedCategories, 
    sizeMultiplier, 
    reason: reasons, 
  }; 
 
  console.log(`
📊
 Correlation check [${newCategory}]: ${result.allowed ? "
✅
 ALLOWED" : "
❌
 
BLOCKED"}`); 
  console.log(`   ${reasons}`); 
  if (sizeMultiplier < 1.0) { 
    console.log(`   Size multiplier: ${(sizeMultiplier * 100).toFixed(0)}%`); 
  } 
 
  return result; 
} 
 
// ─── Get portfolio summary 
──────────────────────────────────────────────────── 
 
export async function getPortfolioSummary(): Promise<{ 
  totalExposure: number; 
  categoryBreakdown: Array<{ 
    category: NarrativeCategory; 
    count: number; 
    exposure: number; 
    percentage: number; 
  }>; 
  diversificationScore: number; // 0-100, higher = better diversified 
}> { 
  const exposures = await getPortfolioExposures(); 
 
  let totalExposure = 0; 
  const breakdown: Array<{ 
    category: NarrativeCategory; 
    count: number; 
    exposure: number; 
    percentage: number; 
  }> = []; 
 
  for (const [category, exp] of exposures) { 
    totalExposure += exp.totalSize; 
    breakdown.push({ 
      category, 
      count: exp.activeCount, 
      exposure: exp.totalSize, 
      percentage: 0, 
    }); 
  } 
 
  // Calculate percentages 
  for (const item of breakdown) { 
    item.percentage = totalExposure > 0 ? (item.exposure / totalExposure) * 100 : 0; 
  } 
 
  // Diversification score: penalize concentration 
  // If one category > 50% = low score, if spread across 5+ = high score 
  let diversificationScore = 50; // baseline 
  const maxCategory = Math.max(...breakdown.map((b) => b.percentage), 0); 
 
  if (maxCategory > 70) diversificationScore = 20; 
  else if (maxCategory > 50) diversificationScore = 35; 
  else if (maxCategory > 40) diversificationScore = 50; 
  else if (maxCategory > 30) diversificationScore = 70; 
  else diversificationScore = 85; 
 
  // Bonus for many categories 
const categoryCount = breakdown.length; 
if (categoryCount >= 5) diversificationScore += 10; 
if (categoryCount >= 7) diversificationScore += 10; 
diversificationScore = Math.min(100, diversificationScore); 
return { 
totalExposure, 
categoryBreakdown: breakdown.sort((a, b) => b.exposure - a.exposure), 
diversificationScore, 
}; 
} 