// File path: src/services/telegram/alert-subscriber.ts
/**
 * ALERT SUBSCRIBER
 * Listens to signal/trade events and sends Telegram alerts
 * THIS FIXES THE BROKEN TELEGRAM ALERTS PROBLEM
 */

import TelegramBot from 'node-telegram-bot-api';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';
import { runtimeState } from '../../core/state/runtime-state';
import { TELEGRAM } from '../../core/config';

class AlertSubscriber {
  private bot: TelegramBot | null = null;
  private alertCache: Map<string, number> = new Map(); // Prevent duplicate alerts
  private dedupeWindow = 5000; // 5 second window

  constructor() {}

  /**
   * INITIALIZE
   * Set bot and subscribe to events
   */
  initialize(botInstance: TelegramBot): void {
    this.bot = botInstance;
    this.subscribeToEvents();
    console.log('[AlertSubscriber] ✅ Initialized and listening to events');
  }

  /**
   * SUBSCRIBE TO EVENTS
   * Listen for all signals and trades
   */
  private subscribeToEvents(): void {
    // Listen for new signals (THIS IS THE KEY FIX)
    eventOrchestrator.subscribe('SIGNAL_DETECTED', async (event) => {
      await this.handleSignalDetected(event);
    });

    // Listen for signal skipped
    eventOrchestrator.subscribe('SIGNAL_SKIPPED', async (event) => {
      // Optional: log skipped signals
    });

    // Listen for trade entry
    eventOrchestrator.subscribe('TRADE_ENTERED', async (event) => {
      await this.handleTradeEntered(event);
    });

    // Listen for trade exit
    eventOrchestrator.subscribe('TRADE_CLOSED', async (event) => {
      await this.handleTradeClosed(event);
    });

    // Listen for regime changes
    eventOrchestrator.subscribe('REGIME_CHANGE', async (event) => {
      await this.handleRegimeChange(event);
    });

    // Listen for narrative rotations
    eventOrchestrator.subscribe('NARRATIVE_ROTATION', async (event) => {
      await this.handleNarrativeRotation(event);
    });

    // Listen for system alerts
    eventOrchestrator.subscribe('ALERT_HEALTH', async (event) => {
      await this.handleHealthAlert(event);
    });

    // Listen for conviction changes
    eventOrchestrator.subscribe('CONVICTION_UPDATE', async (event) => {
      // Optional: alert on high conviction changes
    });

    console.log('[AlertSubscriber] Event subscriptions registered');
  }

  /**
   * HANDLE SIGNAL DETECTED
   * Send alert when new signal detected
   */
  private async handleSignalDetected(event: any): Promise<void> {
    const { token, conviction } = event.payload;

    // Deduplicate
    const cacheKey = `signal-${token}`;
    const lastAlert = this.alertCache.get(cacheKey);
    if (lastAlert && Date.now() - lastAlert < this.dedupeWindow) {
      return; // Skip duplicate
    }
    this.alertCache.set(cacheKey, Date.now());

    // Only alert on high conviction
    if (conviction < 50) {
      return;
    }

    const message = this.formatSignalAlert(token, conviction);
    await this.sendAlert(message);

    console.log(`[AlertSubscriber] Signal alert sent: ${token} (${conviction}%)`);
  }

  /**
   * FORMAT SIGNAL ALERT
   */
  private formatSignalAlert(token: string, conviction: number): string {
    const convictionBar = this.getConvictionBar(conviction);
    const convictionLevel =
      conviction >= 80 ? '🔥 STRONG' : conviction >= 60 ? '⚡ SOLID' : conviction >= 40 ? '⚠️ WATCH' : '👀 LOW';

    return `
🎯 **NEW SIGNAL**
━━━━━━━━━━━━━━━━━━━━━━━━
Token: \`${token}\`
Conviction: ${conviction}% ${convictionBar}
Status: ${convictionLevel}

Use /analyze ${token} for details
    `.trim();
  }

  /**
   * HANDLE TRADE ENTERED
   * Send alert when trade executed
   */
  private async handleTradeEntered(event: any): Promise<void> {
    const { token, entryPrice, conviction, walletId } = event.payload;

    const message = `
✅ **TRADE ENTERED**
━━━━━━━━━━━━━━━━━━━━━━━━
Token: \`${token}\`
Entry: $${entryPrice.toFixed(8)}
Conviction: ${conviction}%
Wallet: ${walletId}

Position opened. Monitoring...
    `.trim();

    await this.sendAlert(message);

    console.log(`[AlertSubscriber] Trade entry alert sent: ${token}`);
  }

  /**
   * HANDLE TRADE CLOSED
   * Send alert when trade exits
   */
  private async handleTradeClosed(event: any): Promise<void> {
    const { token, exitPrice, pnl, pnlPercent, reason } = event.payload;

    const pnlEmoji = pnl >= 0 ? '📈' : '📉';
    const pnlColor = pnl >= 0 ? '+ ' : '';

    const message = `
${pnlEmoji} **TRADE CLOSED**
━━━━━━━━━━━━━━━━━━━━━━━━
Token: \`${token}\`
Exit: $${exitPrice.toFixed(8)}
P&L: ${pnlColor}$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)
Reason: ${reason}

Trade completed.
    `.trim();

    await this.sendAlert(message);

    console.log(`[AlertSubscriber] Trade exit alert sent: ${token}`);
  }

  /**
   * HANDLE REGIME CHANGE
   * Alert on market regime shifts
   */
  private async handleRegimeChange(event: any): Promise<void> {
    const { newRegime, score } = event.payload;

    const regimeEmoji = newRegime === 'HEALTHY' ? '✅' : newRegime === 'WARMING' ? '⚠️' : '❌';
    const regimeMessage =
      newRegime === 'HEALTHY'
        ? 'Optimal trading conditions'
        : newRegime === 'WARMING'
          ? 'Increasing volatility - reduce exposure'
          : 'High risk - pause trading';

    const message = `
${regimeEmoji} **REGIME CHANGE**
━━━━━━━━━━━━━━━━━━━━━━━━
Regime: ${newRegime}
Score: ${score}/100
Message: ${regimeMessage}

Adjusting conviction multiplier...
    `.trim();

    await this.sendAlert(message);

    console.log(`[AlertSubscriber] Regime alert sent: ${newRegime}`);
  }

  /**
   * HANDLE NARRATIVE ROTATION
   * Alert when narratives shift
   */
  private async handleNarrativeRotation(event: any): Promise<void> {
    const { from, to } = event.payload;

    const message = `
🔄 **NARRATIVE ROTATION**
━━━━━━━━━━━━━━━━━━━━━━━━
From: ${from}
To: ${to}

Liquidity rotating. Updating exposure...
    `.trim();

    await this.sendAlert(message);

    console.log(`[AlertSubscriber] Narrative rotation alert sent: ${from} → ${to}`);
  }

  /**
   * HANDLE HEALTH ALERT
   * System health warnings
   */
  private async handleHealthAlert(event: any): Promise<void> {
    const { severity, message: alertMessage } = event.payload;

    const severityEmoji = severity === 'CRITICAL' ? '🚨' : '⚠️';

    const message = `
${severityEmoji} **SYSTEM ALERT** (${severity})
━━━━━━━━━━━━━━━━━━━━━━━━
${alertMessage}

Check system health immediately.
    `.trim();

    await this.sendAlert(message);

    console.log(`[AlertSubscriber] Health alert sent: ${severity}`);
  }

  /**
   * SEND ALERT
   * Send message to all authorized chats
   */
  private async sendAlert(message: string): Promise<void> {
    if (!this.bot || !TELEGRAM.ALLOWED_CHATS || TELEGRAM.ALLOWED_CHATS.length === 0) {
      console.warn('[AlertSubscriber] No authorized chats configured');
      return;
    }

    for (const chatId of TELEGRAM.ALLOWED_CHATS) {
      try {
        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
      } catch (error) {
        console.error(`[AlertSubscriber] Failed to send alert to ${chatId}:`, error);
      }
    }
  }

  /**
   * HELPER: Get conviction bar
   */
  private getConvictionBar(conviction: number): string {
    const filled = Math.floor(conviction / 10);
    const empty = 10 - filled;
    return `[${Array(filled).fill('█').join('')}${Array(empty).fill('░').join('')}]`;
  }

  /**
   * SEND DIRECT ALERT
   * For manual alert triggering
   */
  async sendDirectAlert(message: string): Promise<void> {
    await this.sendAlert(message);
  }

  /**
   * GET ALERT STATS
   */
  getAlertStats() {
    return {
      recentAlerts: this.alertCache.size,
      dedupeWindow: this.dedupeWindow,
      isInitialized: !!this.bot,
    };
  }

  /**
   * CLEAR CACHE
   * Clear deduplication cache
   */
  clearCache(): void {
    this.alertCache.clear();
    console.log('[AlertSubscriber] Cache cleared');
  }
}

// Export singleton
export const alertSubscriber = new AlertSubscriber();
