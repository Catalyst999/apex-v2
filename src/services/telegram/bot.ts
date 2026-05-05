// File path: src/services/telegram/bot.ts
/**
 * TELEGRAM BOT - DELIVERY 1: WALLET ISOLATION
 * Main bot initialization with basic commands + wallet commands
 */

import TelegramBot from 'node-telegram-bot-api';
import { TELEGRAM } from '../../core/config';
import { initializeWalletCommands } from './telegram-wallet-commands';

export let bot: TelegramBot | null = null;

/**
 * Initialize bot and register commands
 */
export async function initializeBot(): Promise<void> {
  if (!TELEGRAM.TOKEN) {
    console.error('[Bot] TELEGRAM_BOT_TOKEN not set');
    return;
  }

  try {
    bot = new TelegramBot(TELEGRAM.TOKEN, { polling: true });
    console.log('[Bot] Initialized with polling');

    // Register basic commands
    registerBasicCommands();
    console.log('[Bot] Basic commands registered');

    // Register wallet commands (Delivery 1)
    if (bot) {
      initializeWalletCommands(bot);
      console.log('[Bot] Wallet commands registered');
    }

    // Error handling
    bot.on('polling_error', (error) => {
      console.error('[Bot] Polling error:', error.message);
    });

    console.log('[Bot] ✅ Ready for Telegram commands');
  } catch (error) {
    console.error('[Bot] Initialization error:', error);
  }
}

/**
 * Register basic commands
 */
function registerBasicCommands(): void {
  if (!bot) return;

  // /start - Welcome
  bot.onText(/^\/start$/, (msg) => {
    handleStartCommand(msg);
  });

  // /help - Help
  bot.onText(/^\/help$/, (msg) => {
    handleHelpCommand(msg);
  });

  // /status - System status
  bot.onText(/^\/status$/, (msg) => {
    handleStatusCommand(msg);
  });

  // /pause - Pause trading
  bot.onText(/^\/pause$/, (msg) => {
    handlePauseCommand(msg);
  });

  // /resume - Resume trading
  bot.onText(/^\/resume$/, (msg) => {
    handleResumeCommand(msg);
  });
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
 * /start - Welcome message
 */
async function handleStartCommand(msg: any): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;

  const message = `
🚀 **CATALYST APEX TRADER**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Behavioral quant intelligence system
Multi-wallet execution with strict isolation
Per-wallet learning & risk management

**📋 Commands:**
/status - System status
/pause - Pause trading
/resume - Resume trading
/help - Full command list

**Delivery 1 Features:**
✅ Market Memory Engine
✅ Conviction Scaler
✅ Emotion Modeler
✅ Pattern Anticipation
✅ PvP Survival Detector
✅ Narrative Rotation Tracker
✅ Wallet Isolation (LIVE)

System ready. 🎯
  `.trim();

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Start command error:', error);
  }
}

/**
 * /help - Command list
 */
async function handleHelpCommand(msg: any): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;

  const message = `
📋 **CATALYST APEX TRADER - COMMANDS**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Trading Control**
/status - System status
/pause - Pause trading
/resume - Resume trading

**Wallet Management (Delivery 1)**
/wallet - Show current wallet
/wallets - List all wallets
/add_wallet <addr> <CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL> <tag> - Add wallet
/select_wallet <addr> - Switch wallet
/tag_wallet <addr> <tag1,tag2> - Tag wallet
/strategy <addr> <CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL> - Change strategy
/discoveries - Show pending wallet discoveries

**Coming in Delivery 2:**
/regime - Current market phase
/insider <token> - Insider momentum
/beast - Beast mode candidates
/patterns <token> - Pattern matches
/positions - Active positions
/trade <token> - Manual entry
/close <position_id> - Close position

---
System: Operational ✅
Wallet Isolation: Enabled ✅
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

  if (!isAuthorized(chatId)) {
    try {
      await bot.sendMessage(chatId, '❌ Unauthorized');
    } catch (error) {
      console.error('[Bot] Status error:', error);
    }
    return;
  }

  const isPaused = process.env.TRADING_PAUSED === 'true';
  const statusIcon = isPaused ? '⏸️' : '▶️';

  const message = `
📊 **SYSTEM STATUS**
━━━━━━━━━━━━━━━━━━━━━━━━
${statusIcon} Bot ${isPaused ? 'PAUSED' : 'RUNNING'}

⚙️ **Configuration**
Isolation: STRICT
Learning: ENABLED
Live Trading: ${process.env.LIVE_TRADING !== 'false' ? 'YES' : 'NO'}

🧠 **Behavioral Intelligence**
Memory Engine: ✅
Conviction Scaler: ✅
Emotion Modeler: ✅
Pattern Anticipation: ✅
PvP Detector: ✅
Narrative Tracker: ✅

💡 Commands: /help, /status, /pause, /resume
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

    const message = `
⏸️ **TRADING PAUSED**
━━━━━━━━━━━━━━━━━━━━━━━━

No new trades will be executed.
Existing positions remain open.
Market monitoring continues.

Resume with: /resume
    `.trim();

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
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

    const message = `
▶️ **TRADING RESUMED**
━━━━━━━━━━━━━━━━━━━━━━━━

System is live and operational.
New trade signals will be executed.
Market monitoring active.

Pause with: /pause
    `.trim();

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Resume command error:', error);
  }
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
