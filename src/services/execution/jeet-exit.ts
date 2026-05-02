// src/services/execution/jeet-exit.ts
// Catalyst Apex Trader v2.1 — Jeeting Exit Override + Volume Profile Analysis
//
// From the playbook:
// "This is not your typical jeet. While playing the Martingales principle, you can
//  decide to long the token with a different holding or wallet if you see long-term
//  potential, while scalping with Martingales."
//
// "Never underestimate speed. Prioritize entry and exit. Be a friend to your
//  slippage — don't be stingy. It's a game of speed."
//
// "The Martingales gambling system is about scalping and jeeting for 2x gains."
//
// Jeeting = selling quickly at target without hesitation.
// When momentum peaks, you sell first and ask questions later.
//
// Volume Profile Analysis (also from playbook context):
// Is volume increasing candle by candle or dumping?
// Sustained rising volume = outlier confirmation.
// Falling volume on price rise = distribution, get out.

import axios    from "axios";
import { TELEGRAM } from "../../core/config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JeetTrigger =
  | "TARGET_2X"           // hit the 2x target — primary jeet trigger
  | "MOMENTUM_PEAK"       // volume spiking + price slowing = peak signal
  | "DISTRIBUTION"        // chart shows distribution, exit in profit
  | "FOMO_TOP"            // FOMO candles = sell into the crowd
  | "VOLUME_DYING"        // volume falling while price holds = exit
  | "SOCIAL_DUMP"         // known dumper wallet detected
  | "NONE";

export interface JeetSignal {
  shouldJeet:   boolean;
  trigger:      JeetTrigger;
  urgency:      "IMMEDIATE" | "NEXT_CANDLE" | "WATCH";  // how fast to exit
  slippage:     number;      // suggested slippage % (higher = faster exit)
  reason:       string;
  pnlPct:       number;
}

export interface VolumeProfile {
  trend:        "INCREASING" | "DECREASING" | "FLAT" | "SPIKE";
  isOrganic:    boolean;    // true = volume rising consistently
  isFadingOut:  boolean;    // true = volume dropping = exit signal
  confidence:   number;     // 0-100
  reason:       string;
  vol5m:        number;
  vol1h:        number;
  vol24h:       number;
}

// ─── Volume profile analyzer ──────────────────────────────────────────────────
// Checks if volume is rising consistently (organic) or dying (exit signal).
// Sustained rising volume = outlier confirmation = HOLD.
// Falling volume on price rise = distribution = JEET.

export function analyzeVolumeProfile(pair: any): VolumeProfile {
  const vol5m  = pair.volume?.m5  ?? 0;
  const vol1h  = pair.volume?.h1  ?? 0;
  const vol24h = pair.volume?.h24 ?? 0;
  const vol6h  = pair.volume?.h6  ?? 0;

  // Extrapolate 5m to hourly rate for comparison
  const vol5mHourlyRate = vol5m * 12;

  if (vol1h === 0 || vol24h === 0) {
    return {
      trend:       "FLAT",
      isOrganic:   false,
      isFadingOut: false,
      confidence:  0,
      reason:      "Insufficient volume data",
      vol5m, vol1h, vol24h,
    };
  }

  // Avg hourly vol from 24h
  const avgHourlyVol24 = vol24h / 24;

  // Current 5m pace vs recent 1h vs 24h average
  const currentPaceVsRecent = vol5mHourlyRate / Math.max(vol1h, 1);
  const recentVsAverage     = vol1h / Math.max(avgHourlyVol24, 1);

  // INCREASING: current pace > recent hour AND recent > average
  if (currentPaceVsRecent >= 1.2 && recentVsAverage >= 1.5) {
    return {
      trend:       "INCREASING",
      isOrganic:   true,
      isFadingOut: false,
      confidence:  Math.min(100, Math.floor(currentPaceVsRecent * 40 + recentVsAverage * 20)),
      reason:      `Volume accelerating: 5m pace $${(vol5mHourlyRate/1000).toFixed(0)}k/h vs 1h $${(vol1h/1000).toFixed(0)}k vs avg $${(avgHourlyVol24/1000).toFixed(0)}k/h`,
      vol5m, vol1h, vol24h,
    };
  }

  // SPIKE: massive 5m volume vs 1h — could be buy or sell climax
  if (vol5mHourlyRate >= vol1h * 2) {
    return {
      trend:       "SPIKE",
      isOrganic:   false,
      isFadingOut: false,
      confidence:  80,
      reason:      `Volume spike: 5m pace ${(currentPaceVsRecent * 100).toFixed(0)}% of recent 1h — possible climax`,
      vol5m, vol1h, vol24h,
    };
  }

  // DECREASING: current pace well below recent
  if (currentPaceVsRecent < 0.5 && recentVsAverage < 0.7) {
    return {
      trend:       "DECREASING",
      isOrganic:   false,
      isFadingOut: true,
      confidence:  Math.min(100, Math.floor((1 - currentPaceVsRecent) * 60 + (1 - recentVsAverage) * 40)),
      reason:      `Volume fading: 5m pace only $${(vol5mHourlyRate/1000).toFixed(0)}k/h, down from $${(vol1h/1000).toFixed(0)}k recent 1h`,
      vol5m, vol1h, vol24h,
    };
  }

  return {
    trend:       "FLAT",
    isOrganic:   recentVsAverage >= 1.0,
    isFadingOut: false,
    confidence:  40,
    reason:      `Volume stable: $${(vol1h/1000).toFixed(0)}k/h vs $${(avgHourlyVol24/1000).toFixed(0)}k avg`,
    vol5m, vol1h, vol24h,
  };
}

// ─── Main jeet signal evaluator ───────────────────────────────────────────────

export function evaluateJeetSignal(
  pair:        any,
  entryPrice:  number,
  strategy:    string,
  volProfile?: VolumeProfile,
): JeetSignal {
  const currentPrice = parseFloat(pair.priceUsd ?? "0");
  const pnlPct       = entryPrice > 0
    ? ((currentPrice - entryPrice) / entryPrice) * 100
    : 0;

  const chartShape = pair._chartShape ?? "UNKNOWN"; // set by chart reader if available
  const priceM5    = pair.priceChange?.m5 ?? 0;
  const priceH1    = pair.priceChange?.h1 ?? 0;

  // ── Trigger 1: 2x target hit — always jeet ───────────────────────────────
  if (pnlPct >= 100) {
    return {
      shouldJeet: true,
      trigger:    "TARGET_2X",
      urgency:    "IMMEDIATE",
      slippage:   35,    // playbook: "Your slippage should be above 30% to snipe that sell"
      reason:     `2x target hit: +${pnlPct.toFixed(0)}% — JEET NOW, slippage 35%`,
      pnlPct,
    };
  }

  // ── Trigger 2: Volume dying on price rise — distribution ─────────────────
  if (volProfile?.isFadingOut && pnlPct > 20 && priceH1 > 10) {
    return {
      shouldJeet: true,
      trigger:    "VOLUME_DYING",
      urgency:    "NEXT_CANDLE",
      slippage:   20,
      reason:     `Volume dying (+${pnlPct.toFixed(0)}% PnL): ${volProfile.reason}`,
      pnlPct,
    };
  }

  // ── Trigger 3: Volume spike (climax candle) while in profit ──────────────
  if (volProfile?.trend === "SPIKE" && pnlPct > 30) {
    return {
      shouldJeet: true,
      trigger:    "MOMENTUM_PEAK",
      urgency:    "IMMEDIATE",
      slippage:   25,
      reason:     `Volume climax spike at +${pnlPct.toFixed(0)}% — sell into the crowd`,
      pnlPct,
    };
  }

  // ── Trigger 4: FOMO candle — extreme 5m price move while in profit ───────
  if (priceM5 >= 30 && pnlPct > 50) {
    return {
      shouldJeet: true,
      trigger:    "FOMO_TOP",
      urgency:    "IMMEDIATE",
      slippage:   30,
      reason:     `FOMO candle +${priceM5.toFixed(0)}% in 5m at +${pnlPct.toFixed(0)}% PnL — sell into FOMO`,
      pnlPct,
    };
  }

  // ── Trigger 5: Chart distribution while in profit ─────────────────────────
  if ((chartShape === "DISTRIBUTION" || chartShape === "FOMO") && pnlPct > 15) {
    return {
      shouldJeet: true,
      trigger:    "DISTRIBUTION",
      urgency:    "NEXT_CANDLE",
      slippage:   20,
      reason:     `Chart ${chartShape} at +${pnlPct.toFixed(0)}% — exit before reversal`,
      pnlPct,
    };
  }

  // ── No jeet signal — volume profile context ───────────────────────────────
  const holdReason = volProfile?.isOrganic
    ? `Volume ${volProfile.trend} — organic momentum, HOLD`
    : `No jeet trigger — monitoring`;

  return {
    shouldJeet: false,
    trigger:    "NONE",
    urgency:    "WATCH",
    slippage:   15,
    reason:     `${holdReason} | PnL: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`,
    pnlPct,
  };
}

// ─── Telegram jeet alert ──────────────────────────────────────────────────────

export async function sendJeetAlert(
  tokenAddress: string,
  tokenSymbol:  string,
  signal:       JeetSignal,
): Promise<void> {
  try {
    const urgencyEmoji = signal.urgency === "IMMEDIATE" ? "🚨" : signal.urgency === "NEXT_CANDLE" ? "⚡" : "👁️";
    const message = `
${urgencyEmoji} *JEET SIGNAL* — ${signal.trigger}
🪙 ${tokenSymbol}
💰 PnL: ${signal.pnlPct >= 0 ? "+" : ""}${signal.pnlPct.toFixed(1)}%
⚡ Urgency: ${signal.urgency}
🎯 Slippage: ${signal.slippage}%
📝 ${signal.reason}
📍 \`${tokenAddress}\`
`.trim();

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,
      { chat_id: TELEGRAM.chatId, text: message, parse_mode: "Markdown" }
    );
  } catch {}
}

// ─── Volume profile summary ────────────────────────────────────────────────────

export function volumeProfileSummary(vp: VolumeProfile): string {
  const emoji = vp.trend === "INCREASING" ? "📈" :
                vp.trend === "SPIKE"      ? "💥" :
                vp.trend === "DECREASING" ? "📉" : "➡️";
  return `${emoji} Vol ${vp.trend} | ${vp.reason}`;
}