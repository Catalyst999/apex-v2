// src/services/scoring/haiku.ts
// Catalyst Apex Trader v2.1 — Real AI Brain
//
// Uses Claude claude-haiku-4-5-20251001 with extended thinking for complex trade decisions.
// Extended thinking lets Claude pause and reason through edge cases
// before committing to BUY/WAIT/AVOID — critical for high-stakes decisions.
//
// Falls back to rule-based engine if API credits not funded.

import axios            from "axios";
import { RawPair }      from "../scanner/dexscreener";
import { ScoreBreakdown } from "./confidence";
import { XSignal }      from "../social/x-scanner";
import { APIS }         from "../../core/config";

export interface HaikuResult {
  signal:     "BUY" | "WAIT" | "AVOID";
  brandScore: number;
  entry:      string;
  target:     string;
  stopLoss:   string;
  rugRisk:    number;
  reason:     string;
  narrative:  string;
  aiReasoning?: string;  // Claude's actual thinking (when available)
}

// ─── Brand score (rule-based, always runs) ────────────────────────────────────

function calcBrandScore(name: string, symbol: string): number {
  let score = 40;
  const n = name.toLowerCase();
  const s = symbol.toLowerCase();

  if      (s.length <= 3) score += 20;
  else if (s.length <= 4) score += 12;
  else if (s.length <= 6) score += 5;

  const strongWords = [
    "trump", "elon", "maga", "doge", "pepe", "ai", "dog", "cat",
    "based", "chad", "giga", "moon", "ape", "wojak", "pnut", "peanut",
    "rave", "crime", "asteroid",
  ];
  for (const word of strongWords) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(n) || regex.test(s)) { score += 20; break; }
  }

  const genericWords = ["token", "coin", "finance", "protocol", "swap"];
  for (const word of genericWords) {
    if (n.includes(word)) { score -= 15; break; }
  }

  const genericNames = ["fat", "him", "her", "big", "old", "new", "hot", "cool", "good", "bad", "baba", "hopu"];
  if (genericNames.includes(n.trim())) score -= 20;

  return Math.min(100, Math.max(0, score));
}

function detectNarrative(name: string, symbol: string): string {
  const text = `${name} ${symbol}`.toLowerCase();
  if (/\b(trump|maga|biden|harris|potus|president|america)\b/.test(text)) return "political";
  if (/\b(elon|musk|tesla|spacex|grok)\b/.test(text))                     return "elon";
  if (/\b(doge|shib|inu|dog|woof|puppy|doggo)\b/.test(text))              return "dog";
  if (/\b(cat|kitty|meow|neko|kitten)\b/.test(text))                      return "cat";
  if (/\b(pepe|frog|rare|wojak|apu)\b/.test(text))                        return "pepe";
  if (/\b(ai|gpt|llm|neural|robot|agent)\b/.test(text))                   return "AI";
  if (/\b(moon|mars|space|galaxy|rocket)\b/.test(text))                   return "space";
  if (/\b(rave|crime|asteroid|disaster|news|viral)\b/.test(text))         return "event";
  if (/\b(based|chad|giga|sigma|ape|degen)\b/.test(text))                 return "community";
  return "meme";
}

// ─── Claude AI analysis ───────────────────────────────────────────────────────

async function analyzeWithClaude(
  pair:      RawPair,
  score:     ScoreBreakdown,
  strategy:  string,
  xSignal?:  XSignal,
): Promise<{ signal: "BUY" | "WAIT" | "AVOID"; rugRisk: number; reason: string; aiReasoning: string } | null> {
  try {
    const chart   = score.chartAnalysis;
    const mcap    = pair.marketCap ?? pair.fdv ?? 0;
    const ageMin  = score.details.ageMinutes;
    const ageStr  = ageMin < 60
      ? `${ageMin.toFixed(0)} minutes`
      : `${(ageMin / 60).toFixed(1)} hours`;

    const xContext = xSignal?.found
      ? `X/Twitter: ${xSignal.tweetCount} tweets in last hour, ${xSignal.engagementScore} avg engagement, velocity score ${xSignal.velocityScore}/100. Organic: ${xSignal.isOrganic}. Top tweet: "${xSignal.topTweet.slice(0, 100)}"`
      : "X/Twitter: No social data found for this token";

    const prompt = `You are an expert memecoin trader on Solana with years of experience. Analyze this token and decide: BUY, WAIT, or AVOID.

TOKEN DATA:
- Name: ${pair.baseToken.name} (${pair.baseToken.symbol})
- Strategy: ${strategy.toUpperCase()}
- Confidence Score: ${score.total}/100
- Market Cap: $${mcap > 0 ? (mcap / 1000).toFixed(1) + "k" : "unknown"}
- Age: ${ageStr}

CHART ANALYSIS:
- Shape: ${chart.shape}
- Entry Quality: ${chart.entryQuality}
- Momentum: ${chart.momentum}
- Volume Acceleration: ${chart.volumeAcceleration.toFixed(2)}x
- Buy Pressure: ${chart.buyPressure}/100
- Chart Reason: ${chart.reason}

ON-CHAIN METRICS:
- Liquidity: $${score.details.liquidityUsd.toFixed(0)}
- Vol/Liq Ratio: ${score.details.volLiqRatio.toFixed(2)}
- Buy/Sell Ratio: ${score.details.buySellRatio.toFixed(2)}
- Buy Count (5m): ${score.details.buyCount}
- Price Change (5m): ${score.details.priceChangeM5.toFixed(1)}%
- Vol/MCap Ratio: ${(score.details.volMcapRatio * 100).toFixed(0)}%

SOCIAL SIGNALS:
${xContext}

SCORING BREAKDOWN:
- Safety: ${score.safety}/30
- Liquidity: ${score.liquidity}/20
- Momentum: ${score.momentum}/20
- Age: ${score.age}/10
- Narrative: ${score.narrative}/15
- Chart: ${score.chart}/20 (${chart.shape})

Based on ALL of this data, respond in this exact JSON format:
{
  "signal": "BUY" or "WAIT" or "AVOID",
  "rugRisk": number between 0-100,
  "reason": "one clear sentence explaining your decision",
  "confidence": number between 0-100
}

Key rules:
- AVOID if chart is DUMP or DISTRIBUTION
- AVOID if rug risk feels high (bundled, no social, generic name)
- BUY only if chart + on-chain + social all align
- WAIT if promising but needs confirmation
- Be honest — most tokens should be AVOID or WAIT`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        thinking: {
          type:          "enabled",
          budget_tokens: 800,
        },
        messages: [
          { role: "user", content: prompt }
        ],
      },
      {
        headers: {
          "x-api-key":         APIS.anthropic,
          "anthropic-version": "2023-06-01",
          "content-type":      "application/json",
          "anthropic-beta":    "interleaved-thinking-2025-05-14",
        },
        timeout: 30000,
      }
    );

    // Extract thinking and text blocks
    const content: any[] = response.data?.content ?? [];
    let aiReasoning = "";
    let textContent = "";

    for (const block of content) {
      if (block.type === "thinking") aiReasoning = block.thinking ?? "";
      if (block.type === "text")     textContent  = block.text ?? "";
    }

    // Parse JSON response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      signal:      parsed.signal as "BUY" | "WAIT" | "AVOID",
      rugRisk:     parsed.rugRisk ?? 50,
      reason:      parsed.reason  ?? "",
      aiReasoning: aiReasoning.slice(0, 500), // trim thinking for logs
    };

  } catch (err: any) {
    // API not funded or error — return null to trigger fallback
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.warn("⚠️  Anthropic API not funded — using rule-based fallback");
    } else {
      console.warn("⚠️  Claude API error:", err.message, "— using fallback");
    }
    return null;
  }
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────

function ruleBased(
  pair:     RawPair,
  score:    ScoreBreakdown,
  strategy: string,
): { signal: "BUY" | "WAIT" | "AVOID"; rugRisk: number; reason: string } {
  const brandScore = calcBrandScore(pair.baseToken.name, pair.baseToken.symbol);
  const chart      = score.chartAnalysis;

  let signal:  "BUY" | "WAIT" | "AVOID" = "AVOID";
  let rugRisk  = 50;

  // Chart gates
  if (chart.shape === "DUMP" || chart.shape === "DISTRIBUTION") {
    return { signal: "AVOID", rugRisk: 80, reason: `Chart pattern ${chart.shape} — avoid entry` };
  }

  if (strategy === "outlier") {
    if      (score.total >= 75 && brandScore >= 65 && chart.entryQuality !== "AVOID") { signal = "BUY";   rugRisk = 35; }
    else if (score.total >= 70)                                                        { signal = "WAIT";  rugRisk = 45; }
    else                                                                               { signal = "AVOID"; rugRisk = 65; }
  } else {
    if      (score.total >= 80 && chart.entryQuality !== "AVOID" && chart.entryQuality !== "POOR") { signal = "BUY";   rugRisk = Math.max(10, 100 - score.total); }
    else if (score.total >= 72)                                                                     { signal = "WAIT";  rugRisk = Math.max(20, 110 - score.total); }
    else                                                                                            { signal = "AVOID"; rugRisk = Math.max(30, 120 - score.total); }
  }

  if (brandScore < 40 && signal === "BUY") {
    signal  = "WAIT";
    rugRisk = Math.min(rugRisk + 15, 90);
  }

  const reason = signal === "BUY"
    ? `Score ${score.total}/100, chart ${chart.shape}, brand ${brandScore}/100 — conviction entry`
    : signal === "WAIT"
    ? `Score ${score.total}/100, chart ${chart.shape} — wait for confirmation`
    : `Score ${score.total}/100 or chart ${chart.shape} — insufficient conviction`;

  return { signal, rugRisk, reason };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function analyzeWithHaiku(
  pair:      RawPair,
  score:     ScoreBreakdown,
  strategy:  string,
  xSignal?:  XSignal,
): Promise<HaikuResult> {
  const price      = parseFloat(pair.priceUsd ?? "0");
  const brandScore = calcBrandScore(pair.baseToken.name, pair.baseToken.symbol);
  const narrative  = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);
  const target     = price * 2;
  const stopLoss   = price * 0.7;

  // Try Claude AI first
  const aiResult = await analyzeWithClaude(pair, score, strategy, xSignal);

  if (aiResult) {
    console.log(`🤖 Claude decision: ${aiResult.signal} (rug risk: ${aiResult.rugRisk}%)`);
    if (aiResult.aiReasoning) {
      console.log(`   💭 Thinking: ${aiResult.aiReasoning.slice(0, 150)}...`);
    }
    return {
      signal:      aiResult.signal,
      brandScore,
      entry:       `$${price.toFixed(10)}`,
      target:      `$${target.toFixed(10)}`,
      stopLoss:    `$${stopLoss.toFixed(10)}`,
      rugRisk:     aiResult.rugRisk,
      reason:      aiResult.reason,
      narrative,
      aiReasoning: aiResult.aiReasoning,
    };
  }

  // Fallback to rule-based
  console.log(`📏 Using rule-based fallback`);
  const fallback = ruleBased(pair, score, strategy);

  return {
    signal:    fallback.signal,
    brandScore,
    entry:     `$${price.toFixed(10)}`,
    target:    `$${target.toFixed(10)}`,
    stopLoss:  `$${stopLoss.toFixed(10)}`,
    rugRisk:   fallback.rugRisk,
    reason:    fallback.reason,
    narrative,
  };
}