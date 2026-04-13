import axios from "axios";
import { TELEGRAM } from "../../core/config";
import { RawPair } from "../scanner/dexscreener";
import { HaikuResult } from "../scoring/haiku";
import { ScoreBreakdown } from "../scoring/confidence";

function formatMcap(mcap: number): string {
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`;
  return `$${mcap.toFixed(0)}`;
}

export async function sendSignalAlert(
  pair: RawPair,
  score: ScoreBreakdown,
  ai: HaikuResult,
  strategy: string
): Promise<void> {
  try {
    const signalEmoji = ai.signal === "BUY" ? "🟢" : ai.signal === "WAIT" ? "🟡" : "🔴";
    const strategyEmoji = strategy === "outlier" ? "💎" : "📊";

    const mcap = pair.marketCap ?? pair.fdv ?? 0;
    const mcapNow = formatMcap(mcap);
    const mcapTarget = formatMcap(mcap * 2);
    const mcapStop = formatMcap(mcap * 0.7);

    const message = `
${signalEmoji} *APEX SIGNAL* ${strategyEmoji} ${strategy.toUpperCase()}

🪙 *${pair.baseToken.name}* (${pair.baseToken.symbol})
🌊 Narrative: ${ai.narrative}

📊 Score: ${score.total}/100
🎯 Signal: *${ai.signal}*
💎 MCap: ${mcapNow}
🏷️ Brand: ${ai.brandScore}/100
☠️ Rug Risk: ${ai.rugRisk}%

📈 Entry MCap:  ${mcapNow}
🎯 Target MCap: ${mcapTarget}
🛑 Stop MCap:   ${mcapStop}

📝 ${ai.reason}

📍 \`${pair.baseToken.address}\`
🔗 [DexScreener](https://dexscreener.com/solana/${pair.baseToken.address})
    `.trim();

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`,
      {
        chat_id: TELEGRAM.chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }
    );

    console.log(`📨 Alert sent: ${pair.baseToken.symbol} — ${ai.signal}`);
  } catch (err: any) {
    console.error("❌ Telegram alert error:", err.message);
  }
}