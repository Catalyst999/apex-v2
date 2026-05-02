// src/services/telegram/bot-updated.ts
// Catalyst Apex Trader v3.0 — Telegram Bot
//
// Updated with:
// - Behavioral intelligence module calls
// - Conviction-based alert formatting
// - Market regime awareness
// - Emotion phase tracking
// - Pattern anticipation alerts
//
// This replaces the existing bot.ts
// Keep all existing logic, ADD these enhancements

import { Context, Telegraf } from "telegraf";
import { FEATURE_FLAGS, CONVICTION_THRESHOLDS } from "../../core/config";
import { getMemorySummary, findSimilarPatterns } from "../intelligence/market-memory-engine";
import { getEmotionHistory, recordEmotionSnapshot } from "../intelligence/emotion-modeler";
import { getNarrativeTrend } from "../intelligence/narrative-rotation-tracker";
import { calculateConvictionMode } from "../intelligence/conviction-scaler";
import { identifyPatternShape } from "../intelligence/pattern-anticipation-engine";

// ─── Initialize Bot ────────────────────────────────────────────────────────

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// ─── Command: /status (System Status) ──────────────────────────────────────

bot.command("status", async (ctx: Context) => {
  try {
    const memoryStatus = await getMemorySummary();
    const tradingActive = process.env.TRADING_ACTIVE === "true";
    const dryRun = process.env.DRY_RUN === "true";

    const msg = [
      `⚙️ CATALYST APEX STATUS\n`,
      `🚀 Trading: ${tradingActive ? "ACTIVE" : "PAUSED"} ${dryRun ? "(DRY RUN)" : ""}`,
      `📚 Pattern Memory: ${memoryStatus.totalPatterns} patterns`,
      `  Win Rate: ${(memoryStatus.averageWinRate * 100).toFixed(0)}%`,
      `  Confidence: ${memoryStatus.averageConfidence.toFixed(0)}/100\n`,
      `💡 Feature Flags Enabled:`,
      `  Market Memory: ${FEATURE_FLAGS.useMarketMemory ? "✅" : "❌"}`,
      `  Emotion Model: ${FEATURE_FLAGS.useEmotionModeler ? "✅" : "❌"}`,
      `  Narrative Track: ${FEATURE_FLAGS.useNarrativeRotation ? "✅" : "❌"}`,
      `  PvP Detector: ${FEATURE_FLAGS.usePvpSurvivalDetector ? "✅" : "❌"}`,
      `  Dynamic Conviction: ${FEATURE_FLAGS.useDynamicConviction ? "✅" : "❌"}`,
      `  Pattern Anticipation: ${FEATURE_FLAGS.usePatternAnticipation ? "✅" : "❌"}`,
    ].join("\n");

    await ctx.reply(msg, { parse_mode: "HTML" });
  } catch (err: any) {
    await ctx.reply(`❌ Status check failed: ${err.message}`);
  }
});

// ─── Command: /memory (Pattern Memory Status) ──────────────────────────────

bot.command("memory", async (ctx: Context) => {
  try {
    const summary = await getMemorySummary();

    const msg = [
      `📚 MARKET MEMORY ENGINE\n`,
      `Total patterns learned: ${summary.totalPatterns}`,
      `Average win rate: ${(summary.averageWinRate * 100).toFixed(0)}%`,
      `Average confidence: ${summary.averageConfidence.toFixed(0)}/100\n`,
      `Top patterns (by confidence):`,
      ...summary.topPatterns.slice(0, 5).map(
        (p) =>
          `  ${p.category}: ${p.confidence.toFixed(0)}% conf | ${(p.win_rate * 100).toFixed(0)}% WR | Seen ${p.historical_matches}x`,
      ),
      `\n💡 Older pattern = more reliable (more samples)`,
      `✅ Pattern memory improves as system trades`,
    ].join("\n");

    await ctx.reply(msg);
  } catch (err: any) {
    await ctx.reply(`❌ Memory check failed: ${err.message}`);
  }
});

// ─── Alert: Signal Evaluation with Behavioral Intelligence ────────────────

export async function sendSignalAlert(
  chatId: string,
  signal: any,
  convictionMode: string,
  alignmentScore: {
    narrativeScore: number;
    technicalScore: number;
    behavioralScore: number;
    liquidityScore: number;
    safetyScore: number;
    timerScore: number;
  },
  emotion?: any,
  pattern?: any,
): Promise<void> {
  try {
    const tokenSymbol = signal.symbol || signal.address?.slice(0, 8) || "???";
    const emotionPhase = emotion?.phase || "UNKNOWN";
    const emotionIntensity = emotion?.intensity || 0;
    const patternShape = pattern?.shape || "UNKNOWN";

    // Color coding for conviction modes
    const modeEmoji = {
      AGGRESSIVE: "🚀",
      CAUTIOUS: "⚡",
      DEFENSIVE: "🛡️",
      OBSERVATION: "👀",
      INACTIVE: "🛑",
    };

    const emoji = modeEmoji[convictionMode as keyof typeof modeEmoji] || "❓";

    const msg = [
      `${emoji} NEW SIGNAL: ${tokenSymbol}`,
      ``,
      `📊 CONVICTION: ${convictionMode}`,
      `  Narrative: ${alignmentScore.narrativeScore.toFixed(0)}`,
      `  Technical: ${alignmentScore.technicalScore.toFixed(0)}`,
      `  Behavioral: ${alignmentScore.behavioralScore.toFixed(0)}`,
      `  Liquidity: ${alignmentScore.liquidityScore.toFixed(0)}`,
      `  Safety: ${alignmentScore.safetyScore.toFixed(0)}`,
      `  Timer: ${alignmentScore.timerScore.toFixed(0)}`,
      ``,
      `💭 EMOTION: ${emotionPhase} (${emotionIntensity}%)`,
      `📈 PATTERN: ${patternShape}`,
      ``,
      `Price: $${signal.price?.toFixed(8) || "?"}`,
      `Liquidity: $${signal.liquidity?.usd?.toFixed(0) || "?"}`,
      `Market Cap: $${signal.marketCap?.usd?.toFixed(0) || "?"}`,
      ``,
      convictionMode === "AGGRESSIVE"
        ? `✅ Ready to trade: Full position recommended`
        : convictionMode === "CAUTIOUS"
          ? `🟡 Good signal: Moderate position recommended`
          : convictionMode === "DEFENSIVE"
            ? `⚠️ Weak signal: Minimal position, tight stops`
            : `👀 Observing: Not trade-ready yet`,
    ].join("\n");

    await bot.telegram.sendMessage(chatId, msg, { parse_mode: "HTML" });
  } catch (err: any) {
    console.error("❌ Signal alert error:", err.message);
  }
}

// ─── Alert: Emotion Phase Update ───────────────────────────────────────────

export async function sendEmotionAlert(
  chatId: string,
  token: string,
  previousPhase: string,
  newPhase: string,
  intensity: number,
  nextPhase: string,
  nextPhaseProbability: number,
): Promise<void> {
  try {
    const emoji = {
      EUPHORIA: "🚀",
      PANIC: "😱",
      EXHAUSTION: "😴",
      DISBELIEF: "🤔",
      REVENGE_BUYING: "📈",
      SILENT_ACCUMULATION: "🤫",
      FEAR: "😨",
      DISTRIBUTION: "📤",
      REVIVAL: "♻️",
      GREED: "💰",
      CAPITULATION: "☠️",
      DEAD: "⚰️",
    };

    const phaseEmoji = emoji[newPhase as keyof typeof emoji] || "❓";

    const msg = [
      `${phaseEmoji} EMOTION PHASE UPDATE: ${token}`,
      ``,
      `${previousPhase} → ${newPhase}`,
      `Intensity: ${intensity}%`,
      ``,
      `📊 Next phase: ${nextPhase} (${nextPhaseProbability}% probability)`,
      ``,
      newPhase === "EUPHORIA"
        ? `🎯 Prepare to exit on strength`
        : newPhase === "PANIC" || newPhase === "CAPITULATION"
          ? `⛔ Consider exiting on rallies`
          : newPhase === "SILENT_ACCUMULATION"
            ? `✅ Good accumulation phase, consider entering`
            : newPhase === "EXHAUSTION_TOP"
              ? `⚠️ Volume dying, dump likely soon`
              : `Monitor for next move`,
    ].join("\n");

    await bot.telegram.sendMessage(chatId, msg, { parse_mode: "HTML" });
  } catch (err: any) {
    console.error("❌ Emotion alert error:", err.message);
  }
}

// ─── Alert: Pattern Recognition ───────────────────────────────────────────

export async function sendPatternAlert(
  chatId: string,
  token: string,
  patternShape: string,
  confidence: number,
  nextShape: string,
  nextPhaseProbability: number,
  actionableSignal: string,
): Promise<void> {
  try {
    const msg = [
      `📈 PATTERN DETECTED: ${token}`,
      ``,
      `Current shape: ${patternShape}`,
      `Confidence: ${confidence.toFixed(0)}%`,
      ``,
      `Next predicted: ${nextShape}`,
      `Probability: ${nextPhaseProbability}%`,
      ``,
      `${actionableSignal}`,
    ].join("\n");

    await bot.telegram.sendMessage(chatId, msg, { parse_mode: "HTML" });
  } catch (err: any) {
    console.error("❌ Pattern alert error:", err.message);
  }
}

// ─── Alert: PvP Warfare Detected ───────────────────────────────────────────

export async function sendPvPAlert(
  chatId: string,
  token: string,
  pattern: string,
  severity: number,
  recommendation: string,
): Promise<void> {
  try {
    const severityEmoji = severity > 80 ? "🚨" : severity > 60 ? "⚠️" : "👀";

    const msg = [
      `${severityEmoji} PvP WARFARE DETECTED: ${token}`,
      ``,
      `Pattern: ${pattern}`,
      `Severity: ${severity}/100`,
      ``,
      `⚠️ ${recommendation}`,
    ].join("\n");

    await bot.telegram.sendMessage(chatId, msg, { parse_mode: "HTML" });
  } catch (err: any) {
    console.error("❌ PvP alert error:", err.message);
  }
}

// ─── Alert: Narrative Rotation ────────────────────────────────────────────

export async function sendNarrativeRotationAlert(
  chatId: string,
  fromCategory: string,
  toCategory: string,
  volumeShift: number,
  affectedCoins: string[],
): Promise<void> {
  try {
    const msg = [
      `🔄 CAPITAL ROTATION DETECTED`,
      ``,
      `${fromCategory} → ${toCategory}`,
      `Volume: $${(volumeShift / 1000).toFixed(0)}k`,
      ``,
      `🎯 Affected coins:`,
      ...affectedCoins.map((coin) => `  • ${coin}`),
      ``,
      `💡 Capital is rotating away from ${fromCategory}`,
      `Be cautious with new ${fromCategory} entries`,
    ].join("\n");

    await bot.telegram.sendMessage(chatId, msg, { parse_mode: "HTML" });
  } catch (err: any) {
    console.error("❌ Rotation alert error:", err.message);
  }
}

// ─── Alert: Trade Execution ────────────────────────────────────────────────

export async function sendTradeAlert(
  chatId: string,
  token: string,
  direction: "BUY" | "SELL",
  position: number,
  price: number,
  leverage: number,
  stopLoss: number,
  takeProfit: number[],
): Promise<void> {
  try {
    const directionEmoji = direction === "BUY" ? "📈" : "📉";
    const profitTargetStr = takeProfit
      .map((tp, i) => `  L${i + 1}: ${tp.toFixed(8)}`)
      .join("\n");

    const msg = [
      `${directionEmoji} TRADE EXECUTED: ${token}`,
      ``,
      `Direction: ${direction}`,
      `Position: ${position}`,
      `Entry: ${price.toFixed(8)}`,
      `Leverage: ${leverage}x`,
      ``,
      `🛑 Stop Loss: ${stopLoss.toFixed(8)}`,
      `✅ Profit Targets:`,
      profitTargetStr,
    ].join("\n");

    await bot.telegram.sendMessage(chatId, msg, { parse_mode: "HTML" });
  } catch (err: any) {
    console.error("❌ Trade alert error:", err.message);
  }
}

// ─── Command: /conviction (Explain Current Signal) ─────────────────────────

bot.command("conviction", async (ctx: Context) => {
  try {
    const msg = [
      `💪 CONVICTION SCORING SYSTEM\n`,
      `How we decide to trade:\n`,
      `🚀 AGGRESSIVE (80%+): All signals aligned, full position`,
      `⚡ CAUTIOUS (60-79%): Good signal, moderate position`,
      `🛡️ DEFENSIVE (40-59%): Weak signal, minimal position`,
      `👀 OBSERVATION (30-39%): Interesting but not ready`,
      `🛑 INACTIVE (<30%): Dead coin or bad phase\n`,
      `Conviction combines:`,
      `  • Narrative strength (20%)`,
      `  • Technical setup (15%)`,
      `  • Behavioral phase (25%) ← Most important`,
      `  • Liquidity quality (15%)`,
      `  • Safety (15%)`,
      `  • Market timing (5%)`,
      `  + Other factors`,
    ].join("\n");

    await ctx.reply(msg);
  } catch (err: any) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ─── Command: /emotion (Explain Emotion Phases) ─────────────────────────────

bot.command("emotion", async (ctx: Context) => {
  try {
    const msg = [
      `💭 EMOTION PHASE SYSTEM\n`,
      `Every token cycles through emotions:\n`,
      `🤫 SILENT_ACCUMULATION: Whales buying quietly, good entry`,
      `🚀 EUPHORIA: Peak FOMO, start reducing`,
      `😱 PANIC: Sellers overwhelming, exit on bounces`,
      `😴 EXHAUSTION: Volume dead, capitulation complete`,
      `🤔 DISBELIEF: Price stable, "is this real?"`,
      `📈 REVENGE_BUYING: FOMO return, buyers return`,
      `😨 FEAR: Distribution phase, whales exiting`,
      `☠️ DEAD: No hope, avoid\n`,
      `System predicts which phase you're in`,
      `and what comes next.`,
    ].join("\n");

    await ctx.reply(msg);
  } catch (err: any) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ─── Start Handler ────────────────────────────────────────────────────────

bot.start(async (ctx: Context) => {
  try {
    const msg = [
      `🚀 CATALYST APEX TRADER v3.0\n`,
      `Behavioral Market Intelligence & Execution System\n`,
      `Commands:`,
      `/status - System status & enabled features`,
      `/memory - Pattern memory statistics`,
      `/conviction - Conviction scoring explained`,
      `/emotion - Emotion phases explained`,
      `/help - All commands\n`,
      `🟢 System online and monitoring markets`,
      `📚 ${FEATURE_FLAGS.useMarketMemory ? "Learning from patterns" : "Pattern learning disabled"}`,
      `💭 ${FEATURE_FLAGS.useEmotionModeler ? "Tracking emotion phases" : "Emotion tracking disabled"}`,
    ].join("\n");

    await ctx.reply(msg);
  } catch (err: any) {
    console.error("❌ Start handler error:", err.message);
  }
});

// ─── Help Handler ─────────────────────────────────────────────────────────

bot.help(async (ctx: Context) => {
  try {
    const msg = [
      `🆘 CATALYST APEX HELP\n`,
      `Available commands:\n`,
      `/start - Start the bot`,
      `/status - Check system status`,
      `/memory - View pattern memory`,
      `/conviction - Learn conviction scoring`,
      `/emotion - Learn emotion phases`,
      `/help - This message\n`,
      `Alert types:`,
      `🔔 Signal alerts - New tokens passing security`,
      `💭 Emotion alerts - Phase changes`,
      `📈 Pattern alerts - Pattern recognition`,
      `🚨 PvP alerts - Potential scams/traps`,
      `🔄 Rotation alerts - Capital flow between narratives`,
      `✅ Trade alerts - Position opened/closed\n`,
      `Questions? Check BEHAVIORAL_INTELLIGENCE.md guide`,
    ].join("\n");

    await ctx.reply(msg);
  } catch (err: any) {
    console.error("❌ Help handler error:", err.message);
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────

bot.on("error", (err) => {
  console.error("❌ Telegram bot error:", err);
});

// ─── Launch Bot ────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  try {
    console.log("🤖 Starting Telegram bot...");
    await bot.launch();
    console.log("✅ Telegram bot online");

    // Graceful shutdown
    process.once("SIGINT", () => {
      console.log("Shutting down bot...");
      bot.stop("SIGINT");
    });
    process.once("SIGTERM", () => {
      console.log("Shutting down bot...");
      bot.stop("SIGTERM");
    });
  } catch (err: any) {
    console.error("❌ Bot startup failed:", err.message);
    throw err;
  }
}

export default bot;