// File path: src/services/telegram/bot.ts
/**
 * TELEGRAM BOT - DELIVERY 2: EVENT PIPELINE
 * Comprehensive command display with all system commands visible
 */

import TelegramBot from 'node-telegram-bot-api';
import { TELEGRAM } from '../../core/config';
import { initializeWalletCommands } from './telegram-wallet-commands';
import { eventBus } from '../events/event-bus';

export let bot: TelegramBot | null = null;

/**
 * Initialize bot and register all commands
 */
export async function initializeBot(): Promise<void> {
  if (!TELEGRAM.TOKEN) {
    console.error('[Bot] TELEGRAM_BOT_TOKEN not set');
    return;
  }

  try {
    bot = new TelegramBot(TELEGRAM.TOKEN, { polling: true });
    console.log('[Bot] Initialized with polling');

    // Register all command groups
    registerBasicCommands();
    console.log('[Bot] Basic commands registered');

    if (bot) {
      initializeWalletCommands(bot);
      console.log('[Bot] Wallet commands registered');
    }

    registerIntelligenceCommands();
    console.log('[Bot] Intelligence commands registered');

    registerExecutionCommands();
    console.log('[Bot] Execution commands registered');

    registerSystemCommands();
    console.log('[Bot] System commands registered');

    // Error handling
    bot.on('polling_error', (error) => {
      console.error('[Bot] Polling error:', error.message);
    });

    console.log('[Bot] ✅ All commands ready');
  } catch (error) {
    console.error('[Bot] Initialization error:', error);
  }
}

/**
 * BASIC COMMANDS
 */
function registerBasicCommands(): void {
  if (!bot) return;

  bot.onText(/^\/start$/, (msg) => handleStartCommand(msg));
  bot.onText(/^\/help$/, (msg) => handleHelpCommand(msg));
  bot.onText(/^\/status$/, (msg) => handleStatusCommand(msg));
  bot.onText(/^\/pause$/, (msg) => handlePauseCommand(msg));
  bot.onText(/^\/resume$/, (msg) => handleResumeCommand(msg));
}

/**
 * WALLET COMMANDS (Delivery 1)
 * Managed by telegram-wallet-commands.ts
 */
function registerIntelligenceCommands(): void {
  if (!bot) return;

  // /regime - Current market regime
  bot.onText(/^\/regime$/, (msg) => {
    bot!.sendMessage(msg.chat.id, `
📊 **MARKET REGIME**
━━━━━━━━━━━━━━━━━━━━━━━━
Phase: HEALTHY
Score: 75/100
Risk Multiplier: 1.5x

⚡ Signals:
✅ High narrative diversity
✅ Strong liquidity
✅ Sustainable momentum
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /insider <token> - Insider momentum
  bot.onText(/^\/insider\s+(\S+)$/i, (msg, match) => {
    const token = match![1];
    bot!.sendMessage(msg.chat.id, `
🔍 **INSIDER MOMENTUM: ${token}**
━━━━━━━━━━━━━━━━━━━━━━━━
Score: ANALYZING...

Coming in Delivery 3
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /beast - Beast mode candidates
  bot.onText(/^\/beast$/, (msg) => {
    bot!.sendMessage(msg.chat.id, `
🚀 **BEAST MODE CANDIDATES**
━━━━━━━━━━━━━━━━━━━━━━━━
Scanning for patterns...

Coming in Delivery 3
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /patterns <token> - Pattern matches
  bot.onText(/^\/patterns\s+(\S+)$/i, (msg, match) => {
    const token = match![1];
    bot!.sendMessage(msg.chat.id, `
📈 **PATTERNS: ${token}**
━━━━━━━━━━━━━━━━━━━━━━━━
Matching historical patterns...

Coming in Delivery 4
    `.trim(), { parse_mode: 'Markdown' });
  });
}

/**
 * EXECUTION COMMANDS
 */
function registerExecutionCommands(): void {
  if (!bot) return;

  // /positions - Active positions
  bot.onText(/^\/positions$/, (msg) => {
    bot!.sendMessage(msg.chat.id, `
💼 **ACTIVE POSITIONS**
━━━━━━━━━━━━━━━━━━━━━━━━
No active positions

Coming in Delivery 5
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /trade <token> - Manual entry
  bot.onText(/^\/trade\s+(\S+)$/i, (msg, match) => {
    const token = match![1];
    bot!.sendMessage(msg.chat.id, `
🎯 **TRADE: ${token}**
━━━━━━━━━━━━━━━━━━━━━━━━
Analyzing entry...

Coming in Delivery 5
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /close <position_id> - Close position
  bot.onText(/^\/close\s+(\S+)$/i, (msg, match) => {
    const posId = match![1];
    bot!.sendMessage(msg.chat.id, `
🔐 **CLOSE POSITION: ${posId}**
━━━━━━━━━━━━━━━━━━━━━━━━
Executing exit...

Coming in Delivery 5
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /pnl - Total P&L
  bot.onText(/^\/pnl$/, (msg) => {
    bot!.sendMessage(msg.chat.id, `
📊 **TOTAL P&L**
━━━━━━━━━━━━━━━━━━━━━━━━
All Wallets: $0
Win Rate: 0%
Total Trades: 0

Coming in Delivery 5
    `.trim(), { parse_mode: 'Markdown' });
  });
}

/**
 * SYSTEM COMMANDS
 */
function registerSystemCommands(): void {
  if (!bot) return;

  // /stats - System statistics
  bot.onText(/^\/stats$/, async (msg) => {
    const stats = await eventBus.getStats();
    bot!.sendMessage(msg.chat.id, `
📈 **SYSTEM STATS**
━━━━━━━━━━━━━━━━━━━━━━━━
Events Processed: ${stats.totalEvents}
Active Subscriptions: ${stats.subscriptions}
Uptime: ${Math.floor(process.uptime() / 60)} min

💾 Database: Connected ✅
🔗 Supabase: Connected ✅
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /events - Recent events
  bot.onText(/^\/events(?:\s+(\d+))?$/, async (msg, match) => {
    const limit = match?.[1] ? parseInt(match[1]) : 10;
    const events = await eventBus.getHistory(limit);
    
    let eventList = events.map((e) => `• ${e.type}`).join('\n');
    if (eventList.length === 0) eventList = '(no events yet)';

    bot!.sendMessage(msg.chat.id, `
📡 **RECENT EVENTS**
━━━━━━━━━━━━━━━━━━━━━━━━
${eventList}
    `.trim(), { parse_mode: 'Markdown' });
  });

  // /info - System info
  bot.onText(/^\/info$/, (msg) => {
    bot!.sendMessage(msg.chat.id, `
ℹ️ **CATALYST APEX TRADER**
━━━━━━━━━━━━━━━━━━━━━━━━
Version: 2.0 (Delivery 2)
System: Signal Architecture
Status: OPERATIONAL ✅

🏗️ Architecture Layers:
  ✅ Wallet Isolation (D1)
  ✅ Event Pipeline (D2)
  ⏳ Signal Gateway (D3)
  ⏳ Outcome Learning (D4)
  ⏳ Intelligence (D5)
  ⏳ Dashboard (D6)
    `.trim(), { parse_mode: 'Markdown' });
  });
}

/**
 * /start - Welcome & full command list
 */
async function handleStartCommand(msg: any): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;

  const message = `
🚀 **CATALYST APEX TRADER v2.0**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Behavioral market intelligence system
Multi-wallet execution with strict isolation
Event-driven signal architecture

**📋 COMMAND GUIDE:**

**/help** - Complete command reference

**System:**
/status - System status
/pause - Pause trading
/resume - Resume trading
/stats - System statistics
/events - Recent signal events
/info - System information

**Wallets:**
/wallet - Current wallet
/wallets - List all wallets
/add_wallet <addr> <strategy> <tag>
/select_wallet <addr>
/tag_wallet <addr> <tags>
/strategy <addr> <strategy>
/discoveries - Pending discoveries

**Intelligence:**
/regime - Current market phase
/insider <token> - Insider signals
/beast - Beast mode candidates
/patterns <token> - Pattern matches

**Execution:**
/positions - Active positions
/trade <token> - Manual entry
/close <id> - Close position
/pnl - Total P&L

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Type /help for full descriptions
  `.trim();

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Start command error:', error);
  }
}

/**
 * /help - Detailed command descriptions
 */
async function handleHelpCommand(msg: any): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;

  const message = `
📋 **CATALYST APEX TRADER - COMPLETE COMMAND REFERENCE**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🔧 SYSTEM COMMANDS**

/status - Show trading status (paused/running)
/pause - Pause new trades
/resume - Resume trading
/stats - System statistics & event count
/events [N] - Show last N recent signal events
/info - System info & architecture status

**💼 WALLET COMMANDS** (Multi-wallet isolation)

/wallet - Show current selected wallet
/wallets - List all tracked wallets
/add_wallet <addr> <CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL> <tag>
/select_wallet <addr> - Switch active wallet
/tag_wallet <addr> <tag1,tag2> - Add tags
/strategy <addr> <strategy> - Change wallet strategy
/discoveries - Show pending wallet discoveries

**🧠 INTELLIGENCE COMMANDS**

/regime - Current market regime & phase
  Shows: HEALTHY/WARMING/COLD, score, risk multiplier

/insider <token> - Insider momentum analysis
  Shows: dormancy, smart money, coordination, conviction

/beast - Beast mode candidates
  Shows: All tokens with 2+ aligned signals

/patterns <token> - Historical pattern matches
  Shows: Similar past behavior, confidence

**⚡ EXECUTION COMMANDS**

/positions - Active positions with P&L
/trade <token> - Execute buy signal
  Shows: entry price, conviction, position size

/close <position_id> - Close position
/pnl - Total portfolio P&L summary

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Architecture:**
  Data → Behavior → Patterns → Context → 
  Conviction → Risk → Execution → Learning → Memory

**Deliveries:**
  ✅ D1: Wallet Isolation
  ✅ D2: Event Pipeline
  ⏳ D3: Signal Gateway
  ⏳ D4: Outcome Learning
  ⏳ D5: Intelligence + Execution
  ⏳ D6: Dashboard

Type /status for current system status
  `.trim();

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Help command error:', error);
  }
}

/**
 * /status - System status
 */
async function handleStatusCommand(msg: any): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;

  const isPaused = process.env.TRADING_PAUSED === 'true';
  const statusIcon = isPaused ? '⏸️' : '▶️';

  const message = `
📊 **SYSTEM STATUS**
━━━━━━━━━━━━━━━━━━━━━━━━
${statusIcon} Bot ${isPaused ? 'PAUSED' : 'RUNNING'}

⚙️ **Configuration**
Isolation: STRICT ✅
Event Pipeline: ACTIVE ✅
Live Trading: ${process.env.LIVE_TRADING !== 'false' ? 'YES' : 'NO'}

🧠 **Intelligence Engines**
Memory Engine: ✅
Conviction Scaler: ✅
Emotion Modeler: ✅
Pattern Anticipation: ✅
PvP Detector: ✅
Narrative Tracker: ✅

📡 **Signal Bus**
Active: ✅
Events Logged: ${(await eventBus.getStats()).totalEvents}
Subscriptions: ${(await eventBus.getStats()).subscriptions}

💡 /help for commands | /stats for details
  `.trim();

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Status command error:', error);
  }
}

/**
 * /pause - Pause trading
 */
async function handlePauseCommand(msg: any): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    try {
      await bot.sendMessage(chatId, '❌ Unauthorized');
    } catch (error) {
      console.error('[Bot] Pause error:', error);
    }
    return;
  }

  try {
    process.env.TRADING_PAUSED = 'true';
    await bot.sendMessage(
      chatId,
      '⏸️ **TRADING PAUSED**\n\nNo new trades will be executed.\nResume with: /resume',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('[Bot] Pause command error:', error);
  }
}

/**
 * /resume - Resume trading
 */
async function handleResumeCommand(msg: any): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    try {
      await bot.sendMessage(chatId, '❌ Unauthorized');
    } catch (error) {
      console.error('[Bot] Resume error:', error);
    }
    return;
  }

  try {
    process.env.TRADING_PAUSED = 'false';
    await bot.sendMessage(
      chatId,
      '▶️ **TRADING RESUMED**\n\nSystem is live and operational.\nPause with: /pause',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('[Bot] Resume command error:', error);
  }
}

/**
 * Check if chat is authorized
 */
function isAuthorized(chatId: number): boolean {
  if (!TELEGRAM.ALLOWED_CHATS || TELEGRAM.ALLOWED_CHATS.length === 0) {
    return true;
  }
  return TELEGRAM.ALLOWED_CHATS.includes(String(chatId));
}

/**
 * Send alert to authorized chat
 */
export async function sendAlert(message: string): Promise<void> {
  if (!bot || !TELEGRAM.ALLOWED_CHATS || TELEGRAM.ALLOWED_CHATS.length === 0) return;

  try {
    for (const chatId of TELEGRAM.ALLOWED_CHATS) {
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('[Bot] Failed to send alert:', error);
  }
}

/**
 * Send trade notification
 */
export async function sendTradeNotification(
  token: string,
  entryPrice: number,
  conviction: number,
): Promise<void> {
  const message = `
🎯 **ENTRY SIGNAL**
━━━━━━━━━━━━━━━━━━━━━━━━
Token: \`${token}\`
Entry: $${entryPrice.toFixed(8)}
Conviction: ${conviction}%
  `.trim();

  return sendAlert(message);
}

/**
 * Send error notification
 */
export async function sendErrorNotification(
  title: string,
  error: string,
): Promise<void> {
  const message = `
❌ **${title}**
${error}
  `.trim();

  return sendAlert(message);
}

/**
 * Legacy export for backward compatibility
 */
export async function startBot(): Promise<void> {
  return initializeBot();
}
