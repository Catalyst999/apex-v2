// src/services/telegram/modules/revival-commands.ts
/**
 * TELEGRAM REVIVAL COMMANDS MODULE
 * Event-driven command layer
 * Emits events, doesn't query systems directly
 */

import TelegramBot from 'node-telegram-bot-api';
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';
import { runtimeState } from '../../../core/state/runtime-state';

export class TelegramRevivalCommands {
  private bot: TelegramBot;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.registerCommands();
  }

  private registerCommands(): void {
    this.bot.onText(/^\/revivals(?:\s+(\d+))?$/i, (msg, match) =>
      this.handleRevivals(msg, match)
    );
    this.bot.onText(/^\/deadcharts(?:\s+(\d+))?$/i, (msg, match) =>
      this.handleDeadCharts(msg, match)
    );
    this.bot.onText(/^\/reactivation\s+(\S+)$/i, (msg, match) =>
      this.handleReactivation(msg, match)
    );
    this.bot.onText(/^\/ignition(?:\s+(\d+))?$/i, (msg, match) =>
      this.handleIgnition(msg, match)
    );
    this.bot.onText(/^\/revival_watchlist$/i, (msg) =>
      this.handleWatchlist(msg)
    );
    this.bot.onText(/^\/revival_lifecycle\s+(\S+)$/i, (msg, match) =>
      this.handleLifecycle(msg, match)
    );
  }

  /**
   * /revivals [limit] - Show active revival candidates
   */
  private async handleRevivals(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const limit = match?.[1] ? parseInt(match[1]) : 10;

    // Emit query event (don't query directly)
    await eventOrchestrator.dispatch(
      'TELEGRAM_QUERY',
      {
        command: 'revivals',
        limit,
        userId: chatId,
      },
      'telegram',
      'NORMAL'
    );

    // Get data from runtime state
    const candidates = runtimeState.getActiveRevivalCandidates().slice(0, limit);

    if (candidates.length === 0) {
      this.bot.sendMessage(chatId, '📊 No active revival candidates');
      return;
    }

    let message = '🔄 **ACTIVE REVIVAL CANDIDATES**\n━━━━━━━━━━━━━━━━━━━━━━\n\n';

    for (const c of candidates) {
      message += `\`${c.token.slice(0, 16)}...\`\n`;
      message += `State: ${c.lifecycleState}\n`;
      message += `Level: ${c.escalationLevel}/100\n`;
      message += `Dormancy: ${c.dormancyScore}%\n`;
      message += `────────────────\n`;
    }

    this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
  }

  /**
   * /deadcharts [days] - Show tokens dormant >X days
   */
  private async handleDeadCharts(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const days = match?.[1] ? parseInt(match[1]) : 30;

    await eventOrchestrator.dispatch(
      'TELEGRAM_QUERY',
      {
        command: 'deadcharts',
        days,
        userId: chatId,
      },
      'telegram',
      'NORMAL'
    );

    const candidates = runtimeState
      .getRevivalCandidatesByState('DEAD')
      .slice(0, 15);

    if (candidates.length === 0) {
      this.bot.sendMessage(chatId, `💀 No charts dead >${days} days in watchlist`);
      return;
    }

    let message = `💀 **DEAD CHARTS (>${days} days)**\n`;
    message += `Found: ${candidates.length}\n━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const c of candidates) {
      message += `• \`${c.token.slice(0, 16)}...\`\n`;
    }

    this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
  }

  /**
   * /reactivation <token> - Deep revival analysis
   */
  private async handleReactivation(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const token = match?.[1];

    if (!token) {
      this.bot.sendMessage(chatId, '❌ Usage: /reactivation <token>');
      return;
    }

    const candidate = runtimeState.getRevivalCandidate(token);

    if (!candidate) {
      this.bot.sendMessage(chatId, `❌ No revival data for \`${token}\``);
      return;
    }

    const message = `
🔬 **REACTIVATION ANALYSIS: ${token}**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
State: ${candidate.lifecycleState}
Level: ${candidate.escalationLevel}/100

📊 Scores:
  Dormancy: ${candidate.dormancyScore}%
  Velocity: ${candidate.reactivationVelocity}%
  Coordination: ${candidate.walletCoordinationScore}%
  Ignition: ${candidate.attentionIgnitionScore}%
  Liquidity: ${candidate.liquidityTrustScore}%

Detected: ${new Date(candidate.detectedAt).toLocaleString()}
    `;

    this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
  }

  /**
   * /ignition [limit] - Strongest ignition events now
   */
  private async handleIgnition(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const limit = match?.[1] ? parseInt(match[1]) : 5;

    const igniting = runtimeState
      .getRevivalCandidatesByState('IGNITING')
      .slice(0, limit);

    if (igniting.length === 0) {
      this.bot.sendMessage(chatId, '🔥 No active ignition events');
      return;
    }

    let message = '🔥 **STRONGEST IGNITION EVENTS**\n━━━━━━━━━━━━━━━━━━\n\n';

    for (const c of igniting) {
      message += `🚀 \`${c.token.slice(0, 16)}...\`\n`;
      message += `Ignition: ${c.attentionIgnitionScore}%\n`;
      message += `Level: ${c.escalationLevel}/100\n`;
      message += `────────────────\n`;
    }

    this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
  }

  /**
   * /revival_watchlist - Current watchlist
   */
  private async handleWatchlist(msg: any): Promise<void> {
    const chatId = msg.chat.id;

    const stats = runtimeState.getRevivalStats();

    const message = `
📋 **REVIVAL WATCHLIST**
━━━━━━━━━━━━━━━━━━━━━━
Total: ${stats.total}
Active: ${stats.active}

By State:
  💀 Dead: ${stats.byState.DEAD}
  😴 Dormant: ${stats.byState.DORMANT}
  👁️ Reactivating: ${stats.byState.REACTIVATING}
  🔥 Igniting: ${stats.byState.IGNITING}
  🚀 Exploding: ${stats.byState.EXPLODING}
  😵 Exhaustion: ${stats.byState.EXHAUSTION}
    `;

    this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
  }

  /**
   * /revival_lifecycle <token> - Lifecycle stage
   */
  private async handleLifecycle(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    const token = match?.[1];

    if (!token) {
      this.bot.sendMessage(chatId, '❌ Usage: /revival_lifecycle <token>');
      return;
    }

    const candidate = runtimeState.getRevivalCandidate(token);

    if (!candidate) {
      this.bot.sendMessage(chatId, `❌ Not tracked: \`${token}\``);
      return;
    }

    const stateEmoji: Record<string, string> = {
      DEAD: '💀',
      DORMANT: '😴',
      REACTIVATING: '👁️',
      IGNITING: '🔥',
      EXPLODING: '🚀',
      EXHAUSTION: '😵',
    };

    const message = `
${stateEmoji[candidate.lifecycleState]} **${candidate.lifecycleState}**

Token: \`${token}\`
Escalation: ${candidate.escalationLevel}/100
Confidence: ${Math.round(candidate.escalationLevel * 0.8)}%

Last Update: ${new Date(candidate.lastUpdated).toLocaleString()}
    `;

    this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
  }
}

export function initializeRevivalCommands(
  bot: TelegramBot
): TelegramRevivalCommands {
  return new TelegramRevivalCommands(bot);
}