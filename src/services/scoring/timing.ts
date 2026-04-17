// Guide: trade during high volume windows, avoid low volume danger zones
// All times in WAT (West Africa Time = UTC+1)

import { MODE } from "../../core/config";

export interface TimingResult {
  allowed: boolean;
  window: string;
  reason: string;
}

export function checkTradingWindow(): TimingResult {
  // In testing mode, allow trading at any time
  if (MODE === "testing") {
    const now = new Date();
    const watHour = (now.getUTCHours() + 1) % 24;
    const watMinute = now.getUTCMinutes();
    return {
      allowed: true,
      window: "TESTING",
      reason: `Testing mode — all times allowed (${formatWAT(watHour, watMinute)} WAT)`,
    };
  }

  // Get current WAT time
  const now = new Date();
  const watHour = (now.getUTCHours() + 1) % 24;
  const watMinute = now.getUTCMinutes();
  const watTime = watHour + watMinute / 60;

  // ── Prime Window 1: 6 PM - 10 PM WAT ─────────────────
  // Peak US/EU overlap — best for new pairs and narratives
  if (watTime >= 18 && watTime < 22) {
    return {
      allowed: true,
      window: "PRIME",
      reason: `Peak window — US/EU overlap (${formatWAT(watHour, watMinute)} WAT)`,
    };
  }

  // ── Pre-pump Window: 2 AM - 3 AM WAT ─────────────────
  // Guide: early accumulation begins, smart money probes
  if (watTime >= 2 && watTime < 3) {
    return {
      allowed: true,
      window: "PRE-PUMP",
      reason: `Pre-pump window — smart money active (${formatWAT(watHour, watMinute)} WAT)`,
    };
  }

  // ── Prime Window 2: 3 AM - 7 AM WAT ──────────────────
  // Asia session — clean pumps, less noise
  if (watTime >= 3 && watTime < 7) {
    return {
      allowed: true,
      window: "ASIA",
      reason: `Asia session — consistent liquidity (${formatWAT(watHour, watMinute)} WAT)`,
    };
  }

  // ── Danger Zone 1: 11 AM - 2 PM WAT ──────────────────
  // Guide: slow charts, fake pumps, manipulation
  if (watTime >= 11 && watTime < 14) {
    return {
      allowed: false,
      window: "DANGER",
      reason: `Danger zone — fake pumps/low volume (${formatWAT(watHour, watMinute)} WAT)`,
    };
  }

  // ── Dead Zone: 10 PM - 2 AM WAT ──────────────────────
  // Guide: post midnight dead zone unless strong narrative
  if (watTime >= 22 || watTime < 2) {
    return {
      allowed: false,
      window: "DEAD",
      reason: `Dead zone — low liquidity (${formatWAT(watHour, watMinute)} WAT)`,
    };
  }

  // ── Neutral Zone: 7 AM - 11 AM WAT ───────────────────
  // Not great, not terrible — allow but with caution
  return {
    allowed: true,
    window: "NEUTRAL",
    reason: `Neutral window — trade with caution (${formatWAT(watHour, watMinute)} WAT)`,
  };
}

function formatWAT(hour: number, minute: number): string {
  const h = hour.toString().padStart(2, "0");
  const m = minute.toString().padStart(2, "0");
  return `${h}:${m}`;
}

// For outlier gems — allow in more windows since velocity matters more than timing
export function checkOutlierWindow(): TimingResult {
  const base = checkTradingWindow();

  // Outliers can trade in neutral zones too
  if (base.window === "NEUTRAL") {
    return { ...base, allowed: true };
  }

  // Even in dead zone, an outlier with extreme velocity gets through
  // This is handled by the router — timing is advisory for outliers
  return base;
}