import { RawPair } from "../scanner/dexscreener";
import { ScoreBreakdown } from "./confidence";

export interface HaikuResult {
  signal: "BUY" | "WAIT" | "AVOID";
  brandScore: number;
  entry: string;
  target: string;
  stopLoss: string;
  rugRisk: number;
  reason: string;
  narrative: string;
}

function calcBrandScore(name: string, symbol: string): number {
  let score = 50;
  const n = name.toLowerCase();
  const s = symbol.toLowerCase();

  // Short ticker is good
  if (s.length <= 4) score += 15;
  else if (s.length <= 6) score += 5;

  // Narrative keywords boost
  const bullishWords = ["dog", "cat", "pepe", "ai", "trump", "elon", "moon",
    "ape", "based", "chad", "giga", "mega", "super", "baby", "safe"];
  for (const word of bullishWords) {
    if (n.includes(word) || s.includes(word)) { score += 15; break; }
  }

  // Penalty for generic names
  const genericWords = ["token", "coin", "finance", "protocol", "swap"];
  for (const word of genericWords) {
    if (n.includes(word)) { score -= 10; break; }
  }

  return Math.min(100, Math.max(0, score));
}

function detectNarrative(name: string, symbol: string): string {
  const n = (name + " " + symbol).toLowerCase();
  if (n.match(/trump|maga|biden|political|president|america/)) return "political";
  if (n.match(/dog|shib|inu|woof|puppy|doge/)) return "dog";
  if (n.match(/cat|kitty|meow|neko/)) return "cat";
  if (n.match(/ai|gpt|robot|neural|brain/)) return "AI";
  if (n.match(/pepe|frog|rare/)) return "pepe";
  if (n.match(/elon|musk|tesla|spacex/)) return "elon";
  if (n.match(/moon|mars|space|galaxy/)) return "space";
  if (n.match(/game|play|quest|hero/)) return "gaming";
  return "meme";
}

export async function analyzeWithHaiku(
  pair: RawPair,
  score: ScoreBreakdown,
  strategy: string
): Promise<HaikuResult> {
  const price = parseFloat(pair.priceUsd ?? "0");
  const brandScore = calcBrandScore(pair.baseToken.name, pair.baseToken.symbol);
  const narrative = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);

  // Signal logic
  let signal: "BUY" | "WAIT" | "AVOID" = "WAIT";
  let rugRisk = 50;

  if (strategy === "outlier") {
    signal = brandScore >= 65 ? "BUY" : "WAIT";
    rugRisk = 40;
  } else if (strategy === "standard") {
    if (score.total >= 75) signal = "BUY";
    else if (score.total >= 55) signal = "WAIT";
    else signal = "AVOID";
    rugRisk = Math.max(10, 100 - score.total);
  }

  // Price targets
  const entry = price;
  const target = price * 2;
  const stopLoss = price * 0.7;

  const reason = signal === "BUY"
    ? `Strong ${narrative} narrative with score ${score.total}/100. Vol/Liq ratio of ${score.details.volLiqRatio.toFixed(2)} confirms momentum.`
    : signal === "WAIT"
    ? `Decent setup but momentum needs confirmation. Score ${score.total}/100 — watch for volume spike.`
    : `Low confidence score ${score.total}/100. Risk too high relative to reward.`;

  return {
    signal,
    brandScore,
    entry: `$${entry.toFixed(10)}`,
    target: `$${target.toFixed(10)}`,
    stopLoss: `$${stopLoss.toFixed(10)}`,
    rugRisk,
    reason,
    narrative,
  };
}