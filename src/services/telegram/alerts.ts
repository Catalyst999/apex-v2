// src/services/telegram/alerts.ts
// Catalyst Apex Trader v2.1 — Alert Formatter
// Redesigned to match the target alert layout.

import axios              from "axios";
import { TELEGRAM }       from "../../core/config";
import { RawPair }        from "../scanner/dexscreener";
import { HaikuResult }    from "../scoring/haiku";
import { ScoreBreakdown } from "../scoring/confidence";
import { OutlierV2Result } from "../scoring/outlier-v2";
import { NarrativeMatch } from "../scoring/narrative-engine";
import { WalletBuySignal } from "../social/smart-wallet-tracker";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatMcap(mcap: number): string {
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000)     return `$${(mcap / 1_000).toFixed(1)}K`;
  return `$${mcap.toFixed(0)}`;
}

function formatAge(pairCreatedAt?: number): string {
  if (!pairCreatedAt) return "Unknown";
  const ageMs      = Date.now() - pairCreatedAt;
  const ageMinutes = Math.floor(ageMs / 60_000);
  const hours      = Math.floor(ageMinutes / 60);
  const mins       = ageMinutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// ─── Main Alert Sender ────────────────────────────────────────────────────────

export async function sendApexAlert(
  pair:     RawPair,
  score:    ScoreBreakdown,
  ai:       HaikuResult,
  outlier:  OutlierV2Result,
  narrative: NarrativeMatch,
  wallets?:  WalletBuySignal[]
): Promise<void> {
  try {
    const address = pair.baseToken.address;
    const mcap    = pair.marketCap ?? pair.fdv ?? 0;
    const mcapStr = formatMcap(mcap);
    const age     = formatAge(pair.pairCreatedAt);

    const message = `
🚀 *APEX SIGNAL DETECTED*
🪙 *${pair.baseToken.name}* (${pair.baseToken.symbol})
💎 MCap: ${mcapStr} | Age: ${age}
📈 Score: *${score.total}/100* | Signal: *${ai.signal}*

🧠 *AI Analysis:*
"${ai.haiku}"

🔥 *Alpha Factors:*
• Narrative: ${narrative.matched ? narrative.narrativeName : "None"} (Tier ${narrative.tier})
• Momentum: ${outlier.isOutlier ? "✅ Extreme" : "Neutral"}
• Smart Money: ${wallets && wallets.length > 0 ? `✅ ${wallets.length} buys` : "None detected"}
• Confidence: ${score.confidenceLevel}

📍 \`${address}\`
🔗 [DexScreener](https://dexscreener.com/solana/${address}) | [Birdeye](https://birdeye.so/token/${address})
`.trim();

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,
      {
        chat_id:                  TELEGRAM.chatId,
        text:                     message,
        parse_mode:               "Markdown",
        disable_web_page_preview: true,
      }
    );

    console.log(`📨 Alert sent: ${pair.baseToken.symbol} — ${ai.signal} | Score: ${score.total}/100`);
  } catch (err: any) {
    console.error("❌ Telegram alert error:", err.message);
  }
}

// ─── Crime pump alert ─────────────────────────────────────────────────────────

export async function sendCrimePumpAlert(pair: any, crime: any): Promise<void> {
  try {
    const mcap    = pair.marketCap ?? pair.fdv ?? 0;
    const mcapStr = formatMcap(mcap);
    const address = pair.baseToken?.address;

    const message = `
🚨 *POTENTIAL CRIME PUMP*
🪙 *${pair.baseToken?.name}* (${pair.baseToken?.symbol})
📊 Type: ${crime.type} | Confidence: ${crime.confidence}%
💎 MCap: ${mcapStr} | Position: ${crime.positioning}
${crime.canonical ? "✅ Canonical coin" : "⚠️ Not the volume leader"}
📝 ${crime.reason}

📍 \`${address}\`
🔗 [DexScreener](https://dexscreener.com/solana/${address})
`.trim();

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,
      {
        chat_id:                  TELEGRAM.chatId,
        text:                     message,
        parse_mode:               "Markdown",
        disable_web_page_preview: true,
      }
    );
  } catch (err: any) {
    console.error("❌ Crime pump alert error:", err.message);
  }
}