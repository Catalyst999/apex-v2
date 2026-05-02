// src/services/scoring/bull-run-intelligence.ts 
// Catalyst Apex Trader v2.2 — Regime Detection & Risk Adjustment 
// 
// Hybrid bull-run detection using: 
// - DexScreener volume trends (memecoin ecosystem) 
// - Solana liquidity expansion metrics 
// - New pair creation velocity 
// - Average pair survival rate 
// - Smart wallet profitability index 
// - Market-wide holder growth velocity 
// 
// Optional secondary signals: 
// - SOL trend strength (from DexScreener) 
// - Overall Solana on-chain activity (from Helius) 
// 
BULL       
// Classifies market into 5 regimes: 
//   
→ loose filters, enable Martingale, aggressive sizing 
//   
//   
//   
//   
HEATED     → balanced filters, Martingale available, moderate sizing 
CRAB       → standard filters, no Martingale, conservative sizing 
RISK_OFF   → tighter filters, observation mode, minimal sizing 
BEAR       → maximum filters, hard stops, no new positions 
import axios from "axios"; 
import { supabase } from "../../db/supabase"; 
import { APIS } from "../../core/config"; 
// ─── Types 
────────────────────────────────────────────────────────────
──────── 
export type RegimeState = "BULL" | "HEATED" | "CRAB" | "RISK_OFF" | "BEAR"; 
export interface RegimeIndicators { 
dexscreenerVolume24h:    number;      
pairCreationVelocity:    number;      
// USD volume in Solana DEX ecosystem (24h) 
// new pairs per hour 
averagePairSurvival:     
smartWalletWinRate:      
number;      
number;      
holderGrowthVelocity:    number;      
liquidityExpansion:      
solTrendStrength:        
solanaTxVelocity:        
} 
number;      
number;      
number;      
export interface RegimeResult { 
// % of pairs surviving > 1h 
// overall win rate of tracked wallets 
// holders/min across recent pairs 
// % increase in total liquidity (24h) 
// -1 to +1, SOL price momentum 
// transactions/sec on Solana 
  state:                   RegimeState; 
  confidence:              number;       // 0-100 
  scoreMultiplier:         number;       // score boost/penalty 
  filterTightness:         "LOOSE" | "NORMAL" | "TIGHT" | "MAXIMUM"; 
  martingaleAllowed:       boolean; 
  positionSizeMultiplier:  number;       // 0.5x to 2x 
  observationMode:         boolean; 
  reason:                  string; 
  nextCheckMs:             number; 
  indicators:              RegimeIndicators; 
} 
 
// ─── Cache 
────────────────────────────────────────────────────────────
──────── 
// Update regime check every 10 minutes to avoid excessive API calls 
 
let cachedRegime: RegimeResult | null = null; 
let lastRegimeCheckMs = 0; 
const REGIME_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes 
 
// ─── DexScreener Solana ecosystem metrics 
────────────────────────────────────── 
 
async function getDexScreenerMetrics(): Promise<{ 
  volume24h: number; 
  pairVelocity: number; 
  survival: number; 
}> { 
  try { 
    const res = await axios.get( 
      `${APIS.dexscreener}/solana`, 
      { timeout: 12000 } 
    ); 
 
    const pairs: any[] = res.data?.pairs ?? []; 
    if (pairs.length === 0) return { volume24h: 0, pairVelocity: 0, survival: 0 }; 
 
    // Total volume in last 24h 
    const volume24h = pairs.reduce((sum: number, p: any) => { 
      const vol = p.volume?.h24 ?? 0; 
      return sum + (typeof vol === "number" ? vol : 0); 
    }, 0); 
 
    // Pair creation velocity: estimate from liquidity pool age 
    const now = Date.now(); 
    const oneHourAgo = now - 60 * 60 * 1000; 
    const newPairs = pairs.filter((p: any) => { 
      const created = p.pairCreatedAt ?? 0; 
      return created > oneHourAgo; 
    }); 
    const pairVelocity = newPairs.length; 
 
    // Survival rate: % of pairs trading > $1k volume in last 24h 
    const activePairs = pairs.filter((p: any) => (p.volume?.h24 ?? 0) > 1000); 
    const survival = pairs.length > 0 ? (activePairs.length / pairs.length) * 100 : 0; 
 
    return { volume24h, pairVelocity, survival }; 
  } catch (err: any) { 
    console.warn(`
⚠
  DexScreener metrics failed: ${err.message}`); 
    return { volume24h: 0, pairVelocity: 0, survival: 0 }; 
  } 
} 
 
// ─── Smart wallet profitability index 
────────────────────────────────────────── 
 
async function getSmartWalletMetrics(): Promise<{ 
  avgWinRate: number; 
  activeCount: number; 
}> { 
  try { 
    const { data: wallets } = await supabase 
      .from("smart_wallets") 
      .select("win_rate, total_trades") 
      .gte("total_trades", 5); 
 
    if (!wallets || wallets.length === 0) { 
      return { avgWinRate: 0.5, activeCount: 0 }; 
    } 
 
    const avgWinRate = wallets.reduce((sum: number, w: any) => sum + (w.win_rate ?? 0.5), 0) / 
wallets.length; 
    return { avgWinRate, activeCount: wallets.length }; 
  } catch { 
    return { avgWinRate: 0.5, activeCount: 0 }; 
  } 
} 
 
// ─── Holder growth velocity 
──────────────────────────────────────────────────── 
// Estimate from recent pairs: new unique holders per minute across ecosystem 
 
async function getHolderGrowthVelocity(): Promise<number> { 
  try { 
    const { data: pairs } = await supabase 
      .from("pairs") 
      .select("id, created_at") 
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()) 
      .limit(20); 
 
    if (!pairs || pairs.length === 0) return 0; 
 
    // Rough estimate: 50 holders per newly discovered pair 
    const minutesWindow = 60; 
    const estimatedNewHolders = pairs.length * 50; 
    return estimatedNewHolders / minutesWindow; 
  } catch { 
    return 0; 
  } 
} 
 
// ─── SOL trend strength (from DexScreener) 
──────────────────────────────────── 
 
async function getSolTrendStrength(): Promise<number> { 
  try { 
    const res = await axios.get( 
      
"https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112", 
      { timeout: 8000 } 
    ); 
 
    const pair = res.data?.[0]; 
    if (!pair) return 0; 
 
    const h24 = pair.priceChange?.h24 ?? 0; 
    const h6 = pair.priceChange?.h6 ?? 0; 
    const h1 = pair.priceChange?.h1 ?? 0; 
 
    // Trend strength: average momentum across timeframes, normalized to -1 to +1 
    const avgChange = (h24 + h6 + h1) / 3; 
    return Math.max(-1, Math.min(1, avgChange / 100)); 
  } catch { 
    return 0; 
  } 
} 
 
// ─── Solana transaction velocity (from Helius) 
──────────────────────────────── 
 
async function getSolanaTxVelocity(): Promise<number> { 
  try { 
    // This would require Helius API for accurate TPS 
    // For now, estimate from recent pair activity 
    const { data: trades } = await supabase 
      .from("trades") 
      .select("id, created_at") 
      .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString()) 
      .limit(100); 
 
    // Rough estimate: 20 TPS baseline, +0.1 per trade in last minute 
    return 20 + ((trades?.length ?? 0) * 0.1); 
  } catch { 
    return 20; 
  } 
} 
 
// ─── Liquidity expansion metric 
──────────────────────────────────────────────── 
 
async function getLiquidityExpansion(): Promise<number> { 
  try { 
    const now = Date.now(); 
    const today = new Date(now); 
    today.setHours(0, 0, 0, 0); 
 
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000); 
 
    const { data: todayPairs } = await supabase 
      .from("pairs") 
      .select("id, liquidity") 
      .gte("created_at", today.toISOString()); 
 
    const { data: yesterdayPairs } = await supabase 
      .from("pairs") 
      .select("id, liquidity") 
      .gte("created_at", yesterday.toISOString()) 
      .lt("created_at", today.toISOString()); 
 
    const todayLiq = (todayPairs ?? []).reduce((sum: number, p: any) => sum + (p.liquidity ?? 0), 
0); 
    const yesterdayLiq = (yesterdayPairs ?? []).reduce((sum: number, p: any) => sum + 
(p.liquidity ?? 0), 0); 
 
    if (yesterdayLiq === 0) return 0; 
    return ((todayLiq - yesterdayLiq) / yesterdayLiq) * 100; 
  } catch { 
    return 0; 
  } 
} 
 
// ─── Collect all indicators 
──────────────────────────────────────────────────── 
 
async function gatherIndicators(): Promise<RegimeIndicators> { 
  const [dex, smartWallet, holderVel, solTrend, txVel, liqExp] = await Promise.all([ 
    getDexScreenerMetrics(), 
    getSmartWalletMetrics(), 
    getHolderGrowthVelocity(), 
    getSolTrendStrength(), 
    getSolanaTxVelocity(), 
    getLiquidityExpansion(), 
  ]); 
 
  return { 
    dexscreenerVolume24h:    dex.volume24h, 
    pairCreationVelocity:    dex.pairVelocity, 
    averagePairSurvival:     dex.survival, 
    smartWalletWinRate:      smartWallet.avgWinRate, 
    holderGrowthVelocity:    holderVel, 
    liquidityExpansion:      liqExp, 
    solTrendStrength:        solTrend, 
    solanaTxVelocity:        txVel, 
  }; 
} 
 
// ─── Regime classification logic 
─────────────────────────────────────────────── 
 
function classifyRegime(indicators: RegimeIndicators): RegimeResult { 
  const { 
    dexscreenerVolume24h, 
    pairCreationVelocity, 
    averagePairSurvival, 
    smartWalletWinRate, 
    holderGrowthVelocity, 
    liquidityExpansion, 
    solTrendStrength, 
    solanaTxVelocity, 
  } = indicators; 
 
  // Scoring buckets (0-100) 
  let bullScore = 0; 
 
  // Volume: > $10M = bullish, < $2M = bearish 
  if (dexscreenerVolume24h > 10_000_000)      bullScore += 25; 
  else if (dexscreenerVolume24h > 5_000_000)  bullScore += 15; 
  else if (dexscreenerVolume24h < 2_000_000)  bullScore -= 15; 
 
  // Pair velocity: > 8/hr = bullish, < 2/hr = bearish 
  if (pairCreationVelocity > 8)      bullScore += 20; 
  else if (pairCreationVelocity > 4) bullScore += 10; 
  else if (pairCreationVelocity < 2) bullScore -= 15; 
 
  // Survival rate: > 60% = bullish, < 30% = bearish 
  if (averagePairSurvival > 60)      bullScore += 15; 
  else if (averagePairSurvival < 30) bullScore -= 20; 
 
  // Smart wallet profitability: > 65% = bullish, < 50% = bearish 
  if (smartWalletWinRate > 0.65)     bullScore += 15; 
  else if (smartWalletWinRate < 0.5) bullScore -= 15; 
 
  // Holder growth: > 10/min = bullish, < 2/min = bearish 
  if (holderGrowthVelocity > 10)     bullScore += 10; 
  else if (holderGrowthVelocity < 2) bullScore -= 10; 
 
  // Liquidity expansion: > 20% = bullish, < -10% = bearish 
  if (liquidityExpansion > 20)       bullScore += 15; 
  else if (liquidityExpansion < -10) bullScore -= 15; 
 
  // SOL trend: positive = bullish, negative = bearish 
  bullScore += Math.floor(solTrendStrength * 15); 
 
  // TX velocity: > 40 TPS = bullish, < 25 TPS = bearish 
  if (solanaTxVelocity > 40)         bullScore += 10; 
  else if (solanaTxVelocity < 25)    bullScore -= 10; 
 
  // Clamp to 0-100 
  bullScore = Math.max(0, Math.min(100, bullScore)); 
 
  // ── Classify state 
────────────────────────────────────────────────────── 
 
  let state: RegimeState; 
  let filterTightness: "LOOSE" | "NORMAL" | "TIGHT" | "MAXIMUM"; 
  let martingaleAllowed: boolean; 
  let positionSizeMultiplier: number; 
  let observationMode: boolean; 
  let scoreMultiplier: number; 
 
  if (bullScore >= 80) { 
    state = "BULL"; 
    filterTightness = "LOOSE"; 
    martingaleAllowed = true; 
    positionSizeMultiplier = 1.5; 
    observationMode = false; 
    scoreMultiplier = 1.2; 
  } else if (bullScore >= 60) { 
    state = "HEATED"; 
    filterTightness = "NORMAL"; 
    martingaleAllowed = true; 
    positionSizeMultiplier = 1.1; 
    observationMode = false; 
    scoreMultiplier = 1.0; 
  } else if (bullScore >= 40) { 
    state = "CRAB"; 
    filterTightness = "NORMAL"; 
    martingaleAllowed = false; 
    positionSizeMultiplier = 0.9; 
    observationMode = false; 
    scoreMultiplier = 0.95; 
  } else if (bullScore >= 20) { 
    state = "RISK_OFF"; 
    filterTightness = "TIGHT"; 
    martingaleAllowed = false; 
    positionSizeMultiplier = 0.5; 
    observationMode = true; 
    scoreMultiplier = 0.8; 
  } else { 
    state = "BEAR"; 
    filterTightness = "MAXIMUM"; 
    martingaleAllowed = false; 
    positionSizeMultiplier = 0.25; 
    observationMode = true; 
    scoreMultiplier = 0.6; 
  } 
 
  const reason = buildRegimeReason(state, indicators, bullScore); 
 
  return { 
    state, 
    confidence: bullScore, 
    scoreMultiplier, 
    filterTightness, 
    martingaleAllowed, 
    positionSizeMultiplier, 
    observationMode, 
    reason, 
    nextCheckMs: REGIME_CHECK_INTERVAL_MS, 
    indicators, 
  }; 
} 
 
// ─── Reason builder 
─────────────────────────────────────────────────────────── 
 
function buildRegimeReason(state: RegimeState, ind: RegimeIndicators, score: number): string 
{ 
  const parts: string[] = []; 
 
  if (ind.dexscreenerVolume24h > 5_000_000) { 
    parts.push(`Vol: $${(ind.dexscreenerVolume24h / 1_000_000).toFixed(1)}M`); 
  } 
 
  if (ind.pairCreationVelocity > 4) { 
    parts.push(`${ind.pairCreationVelocity.toFixed(0)} pairs/hr`); 
  } 
 
  if (ind.averagePairSurvival > 50) { 
    parts.push(`${ind.averagePairSurvival.toFixed(0)}% survival`); 
  } 
 
  if (ind.smartWalletWinRate > 0.6) { 
    parts.push(`${(ind.smartWalletWinRate * 100).toFixed(0)}% smart WR`); 
  } 
 
  if (Math.abs(ind.solTrendStrength) > 0.2) { 
    const dir = ind.solTrendStrength > 0 ? "↗" : "↘"; 
    parts.push(`SOL ${dir} ${(ind.solTrendStrength * 100).toFixed(0)}%`); 
  } 
 
  return `${state} (${score}/100) • ${parts.join(" • ")}`; 
} 
 
// ─── Public API 
────────────────────────────────────────────────────────────
──── 
 
export async function getRegimeState(): Promise<RegimeResult> { 
  const now = Date.now(); 
 
  // Return cached result if fresh 
  if (cachedRegime && (now - lastRegimeCheckMs < REGIME_CHECK_INTERVAL_MS)) { 
    return cachedRegime; 
  } 
 
  // Refresh indicators 
  const indicators = await gatherIndicators(); 
  const result = classifyRegime(indicators); 
 
  cachedRegime = result; 
  lastRegimeCheckMs = now; 
 
  console.log(`
📊
 Regime: ${result.reason}`); 
  console.log(`   Filters: ${result.filterTightness} | Martingale: ${result.martingaleAllowed ? "
✅
" : 
"
❌
"} | Position: ${(result.positionSizeMultiplier * 100).toFixed(0)}%`); 
 
  return result; 
} 
 
// ─── Filter adjustment based on regime 
──────────────────────────────────────── 
 
export function adjustFiltersByRegime(regime: RegimeResult, baseThresholds: any): any { 
  const adjusted = { ...baseThresholds }; 
 
  switch (regime.filterTightness) { 
    case "LOOSE": 
      adjusted.minConfidenceScore = Math.max(40, baseThresholds.minConfidenceScore - 10); 
      adjusted.minVolLiqRatio = Math.max(0.8, baseThresholds.minVolLiqRatio - 0.4); 
      break; 
    case "NORMAL": 
      // Use base thresholds 
      break; 
    case "TIGHT": 
      adjusted.minConfidenceScore = Math.min(80, baseThresholds.minConfidenceScore + 10); 
      adjusted.minVolLiqRatio = Math.min(3.0, baseThresholds.minVolLiqRatio + 0.5); 
      break; 
    case "MAXIMUM": 
      adjusted.minConfidenceScore = 85; 
      adjusted.minVolLiqRatio = 4.0; 
      break; 
  } 
 
  return adjusted; 
} 
 
// ─── Martingale availability check 
──────────────────────────────────────────── 
 
export function canUseMartingale(regime: RegimeResult): boolean { 
  return regime.martingaleAllowed; 
} 
 
// ─── Position sizing with regime multiplier 
──────────────────────────────────── 
 
export function adjustPositionSize(baseSize: number, regime: RegimeResult): number { 
  return baseSize * regime.positionSizeMultiplier; 
} 
 
// ─── Score multiplier for confidence routing 
────────────────────────────────── 
 
export function getScoreMultiplier(regime: RegimeResult): number { 
  return regime.scoreMultiplier; 
} 
 
// ─── Observation mode flag 
──────────────────────────────────────────────────── 
export function shouldObservationMode(regime: RegimeResult): boolean { 
return regime.observationMode; 
} 