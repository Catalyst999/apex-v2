/**
 * TELEGRAM BOT - UPDATED WITH WALLET COMMANDS
 * Core Telegram interface for Catalyst Apex Trader
 * Includes wallet management, status, alerts, and trading control
 */

import TelegramBot from 'node-telegram-bot-api';
import { supabase } from '../core/supabase';
import { walletManager } from '../wallet/wallet-manager';
import { registerWalletCommands } from './wallet-commands';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

if (!TELEGRAM_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN not set in environment');
}

export const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/**
 * Bot initialization
 */
export async function initializeBot(): Promise<void> {
  console.log('[Bot] Initializing Telegram bot...');

  try {
    // Initialize wallet manager
    await walletManager.initialize();
    console.log('[Bot] Wallet manager initialized');

    // Register all wallet commands
    registerWalletCommands();
    console.log('[Bot] Wallet commands registered');

    // Register core commands
    registerCoreCommands();
    console.log('[Bot] Core commands registered');

    // Setup error handlers
    setupErrorHandlers();

    // Send startup notification
    const adminChatId = process.env.TELEGRAM_ADMIN_ID;
    if (adminChatId) {
      bot.sendMessage(
        adminChatId,
        '✅ **Catalyst Apex Trader Online**\n\n🧠 Behavioral Intelligence System\n📊 Multi-Wallet Isolation\n🎯 Ready to Trade',
        { parse_mode: 'Markdown' }
      ).catch(err => console.error('[Bot] Failed to send startup message:', err));
    }

    console.log('[Bot] Initialization complete');
  } catch (error) {
    console.error('[Bot] Initialization failed:', error);
    throw error;
  }
}

/**
 * Register core bot commands
 */
function registerCoreCommands(): void {
  // /start - Welcome message
  bot.onText(/^\/start$/, (msg: any) => {
    const chatId = msg.chat.id;
    const message = `
🤖 **CATALYST APEX TRADER**
━━━━━━━━━━━━━━━━━━━━━━━
Behavioral Market Intelligence & Execution System

📋 **WALLET COMMANDS**
/wallet          - Show active wallet
/wallets         - List all wallets
/add_wallet      - Add new wallet
/select_wallet   - Switch active wallet
/tag_wallet      - Retag wallet
/strategy        - Change strategy

📊 **STATUS COMMANDS**
/status          - System status
/conviction      - Current conviction score
/emotion         - Market emotion state
/memory          - Top learned patterns

⚙️ **CONTROL COMMANDS**
/pause           - Pause trading
/resume          - Resume trading
/risk            - Show risk profile
/positions       - Open positions

ℹ️ Use /help for detailed command info
    `.trim();

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  });

  // /help - Help menu
  bot.onText(/^\/help$/, (msg: any) => {
    const chatId = msg.chat.id;
    const message = `
📚 **COMMAND HELP**
━━━━━━━━━━━━━━━━━━━

**Wallet Management:**
/wallet              Show active wallet info + PnL
/wallets             List all wallets with stats
/add_wallet <addr> <strategy> <tag>
  Add new wallet. Strategies: conservative, aggressive, experimental
  Tags: smart_money, influencer, experimental, blacklist, custom
/select_wallet <addr>
  Switch to different wallet
/tag_wallet <addr> <tag>
  Change wallet tag
/strategy <addr> <new_strategy>
  Override wallet strategy

**System Status:**
/status              System health + active wallet
/conviction <token>  Signal strength for token
/emotion             Market psychological state
/memory              Top performing patterns

**Position Control:**
/positions           Show open positions
/close <token>       Close position in token
/risk                Display risk profile limits

**Trading Control:**
/pause               Pause all trading
/resume              Resume trading
/market              Market regime status

💡 All commands require active wallet (see /wallet)
💡 Use /select_wallet to change context
    `.trim();

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  });

  // /status - System status
  bot.onText(/^\/status$/, (msg: any) => {
    handleStatusCommand(msg);
  });

  // /conviction - Current conviction
  bot.onText(/^\/conviction(?:\s+(.+))?$/, (msg: any, match: any) => {
    const token = match?.[1] || 'SYSTEM';
    handleConvictionCommand(msg, token);
  });

  // /emotion - Market emotion
  bot.onText(/^\/emotion$/, (msg: any) => {
    handleEmotionCommand(msg);
  });

  // /memory - Market memory patterns
  bot.onText(/^\/memory$/, (msg: any) => {
    handleMemoryCommand(msg);
  });

  // /positions - Show positions
  bot.onText(/^\/positions$/, (msg: any) => {
    handlePositionsCommand(msg);
  });

  // /pause - Pause trading
  bot.onText(/^\/pause$/, (msg: any) => {
    handlePauseCommand(msg);
  });

  // /resume - Resume trading
  bot.onText(/^\/resume$/, (msg: any) => {
    handleResumeCommand(msg);
  });

  // /risk - Risk profile
  bot.onText(/^\/risk$/, (msg: any) => {
    handleRiskCommand(msg);
  });

  // /market - Market regime
  bot.onText(/^\/market$/, (msg: any) => {
    handleMarketCommand(msg);
  });
}

/**
 * /status - System status
 */
async function handleStatusCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    const context = await walletManager.getActiveWalletContext();

    if (!context) {
      return bot.sendMessage(
        chatId,
        '⚠️ No active wallet. Use /add_wallet to create one.'
      );
    }

    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);

    const message = `
🟢 **SYSTEM STATUS**
━━━━━━━━━━━━━━━━━━━
Uptime: ${uptimeHours}h ${uptimeMinutes}m
Mode: ${context.wallet.strategy.toUpperCase()}

📊 **ACTIVE WALLET**
Address: \`${context.wallet.address}\`
Tag: ${context.wallet.tag.toUpperCase()}

📈 **PERFORMANCE**
Trades: ${context.total_trades}
Win Rate: ${(context.win_rate * 100).toFixed(1)}%
PnL: $${context.pnl_usd.toFixed(2)}

🔧 **POSITIONS**
Open: ${context.current_positions}/${context.max_positions}
Max Leverage: ${context.max_leverage}x

✅ System operational
    `.trim();

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Error in /status:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch status');
  }
}

/**
 * /conviction - Current conviction score
 */
async function handleConvictionCommand(msg: any, token: string): Promise<void> {
  const chatId = msg.chat.id;

  try {
    const activeWalletId = walletManager.getActiveWalletId();
    if (!activeWalletId) {
      return bot.sendMessage(chatId, '⚠️ No active wallet');
    }

    const { data, error } = await supabase
      .from('conviction_logs')
      .select('*')
      .eq('wallet_id', activeWalletId)
      .eq('token', token)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return bot.sendMessage(chatId, `ℹ️ No conviction data for ${token}`);
    }

    const message = `
📊 **CONVICTION SCORE: ${token}**
━━━━━━━━━━━━━━━━━━━━━━━
Overall: **${data.conviction_score}** / 100

Signal Breakdown:
├─ Smart Money: ${data.smart_money_signal}
├─ Narrative Vitality: ${data.narrative_vitality}
├─ Holder Behavior: ${data.holder_behavior}
├─ Regime: ${data.regime_condition}
└─ Market Memory: ${data.market_memory_match}

Decision: **${data.final_decision}**
Confidence: ${getConfidenceLabel(data.conviction_score)}
    `.trim();

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Error in /conviction:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch conviction');
  }
}

/**
 * /emotion - Market emotion state
 */
async function handleEmotionCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    const activeWalletId = walletManager.getActiveWalletId();
    if (!activeWalletId) {
      return bot.sendMessage(chatId, '⚠️ No active wallet');
    }

    const { data, error } = await supabase
      .from('emotion_snapshots')
      .select('*')
      .eq('wallet_id', activeWalletId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return bot.sendMessage(chatId, 'ℹ️ No emotion data yet');
    }

    const emotionPhase = data.emotion_phase || 'UNKNOWN';
    const emotionEmoji = getEmotionEmoji(emotionPhase);

    const message = `
${emotionEmoji} **MARKET EMOTION STATE**
━━━━━━━━━━━━━━━━━━━━━━━
Phase: **${emotionPhase}**

Sentiment: ${data.sentiment_score}%
Volatility: ${data.volatility_level}
Greed Index: ${data.greed_index}

Updated: ${new Date(data.created_at).toLocaleTimeString()}
    `.trim();

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Error in /emotion:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch emotion state');
  }
}

/**
 * /memory - Market memory patterns
 */
async function handleMemoryCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    const activeWalletId = walletManager.getActiveWalletId();
    if (!activeWalletId) {
      return bot.sendMessage(chatId, '⚠️ No active wallet');
    }

    const { data, error } = await supabase
      .from('market_memory')
      .select('*')
      .eq('wallet_id', activeWalletId)
      .order('confidence_score', { ascending: false })
      .limit(5);

    if (error || !data || data.length === 0) {
      return bot.sendMessage(chatId, 'ℹ️ No patterns learned yet');
    }

    let message = '🧠 **TOP LEARNED PATTERNS**\n━━━━━━━━━━━━━━━━━━━\n';

    for (const pattern of data) {
      message += `
**${pattern.pattern_name}**
Win Rate: ${(pattern.win_rate * 100).toFixed(1)}% | Confidence: ${(pattern.confidence_score * 100).toFixed(0)}%
Occurrences: ${pattern.occurrences} | Avg Return: ${pattern.avg_return_percent.toFixed(2)}%

`;
    }

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Error in /memory:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch patterns');
  }
}

/**
 * /positions - Show open positions
 */
async function handlePositionsCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    const activeWalletId = walletManager.getActiveWalletId();
    if (!activeWalletId) {
      return bot.sendMessage(chatId, '⚠️ No active wallet');
    }

    const { data, error } = await supabase
      .from('trade_intelligence')
      .select('*')
      .eq('wallet_id', activeWalletId)
      .eq('status', 'open');

    if (error || !data || data.length === 0) {
      return bot.sendMessage(chatId, 'ℹ️ No open positions');
    }

    let message = `📈 **OPEN POSITIONS** (${data.length})\n━━━━━━━━━━━━━━━━━━━\n`;

    let totalExposure = 0;
    for (const trade of data) {
      const exposure = trade.position_size * trade.entry_price;
      totalExposure += exposure;

      message += `
**${trade.token}**
Entry: $${trade.entry_price.toFixed(4)}
Size: ${trade.position_size.toFixed(4)}
Leverage: ${trade.leverage}x
Exposure: $${exposure.toFixed(2)}

`;
    }

    message += `**Total Exposure: $${totalExposure.toFixed(2)}**`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Error in /positions:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch positions');
  }
}

/**
 * /pause - Pause trading
 */
async function handlePauseCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    await supabase
      .from('bot_config')
      .update({ trading_paused: true })
      .eq('id', 1);

    bot.sendMessage(chatId, '⏸️ Trading paused');
  } catch (error) {
    console.error('[Bot] Error in /pause:', error);
    bot.sendMessage(chatId, '❌ Failed to pause trading');
  }
}

/**
 * /resume - Resume trading
 */
async function handleResumeCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    await supabase
      .from('bot_config')
      .update({ trading_paused: false })
      .eq('id', 1);

    bot.sendMessage(chatId, '▶️ Trading resumed');
  } catch (error) {
    console.error('[Bot] Error in /resume:', error);
    bot.sendMessage(chatId, '❌ Failed to resume trading');
  }
}

/**
 * /risk - Risk profile
 */
async function handleRiskCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    const activeWalletId = walletManager.getActiveWalletId();
    if (!activeWalletId) {
      return bot.sendMessage(chatId, '⚠️ No active wallet');
    }

    const riskProfile = await walletManager.getWalletRiskProfile(activeWalletId);

    if (!riskProfile) {
      return bot.sendMessage(chatId, 'ℹ️ No risk profile found');
    }

    const message = `
⚠️ **RISK PROFILE**
━━━━━━━━━━━━━━━━━━━
Max Position: $${riskProfile.max_position_usd.toFixed(2)}
Max Exposure: $${riskProfile.max_total_exposure_usd.toFixed(2)}
Max Leverage: ${riskProfile.max_leverage}x
Max Positions: ${riskProfile.max_positions}

Stop Loss: ${riskProfile.stop_loss_percent}%
Take Profit: ${riskProfile.take_profit_percent}%
Daily Loss Limit: $${riskProfile.max_daily_loss_usd.toFixed(2)}

Current Daily Loss: $${riskProfile.current_daily_loss_usd.toFixed(2)}
    `.trim();

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Error in /risk:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch risk profile');
  }
}

/**
 * /market - Market regime
 */
async function handleMarketCommand(msg: any): Promise<void> {
  const chatId = msg.chat.id;

  try {
    const { data, error } = await supabase
      .from('market_regimes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return bot.sendMessage(chatId, 'ℹ️ No market data yet');
    }

    const regimeLabel = getRegimeLabel(data.regime_score);
    const regimeEmoji = getRegimeEmoji(data.regime_score);

    const message = `
${regimeEmoji} **MARKET REGIME**
━━━━━━━━━━━━━━━━━━━
Status: **${regimeLabel}**
Score: ${data.regime_score}/100

Volatility: ${data.volatility_level}
Trend: ${data.trend_direction}
Liquidity: ${data.avg_liquidity > 50000 ? '✅ Good' : '⚠️ Low'}

Updated: ${new Date(data.created_at).toLocaleTimeString()}
    `.trim();

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('[Bot] Error in /market:', error);
    bot.sendMessage(chatId, '❌ Failed to fetch market regime');
  }
}

/**
 * Setup error handlers
 */
function setupErrorHandlers(): void {
  bot.on('polling_error', (error: any) => {
    console.error('[Bot] Polling error:', error);
  });

  bot.on('error', (error: any) => {
    console.error('[Bot] Bot error:', error);
  });
}

/**
 * Helper functions
 */

function getConfidenceLabel(score: number): string {
  if (score >= 90) return '🟢 Very High';
  if (score >= 75) return '🟢 High';
  if (score >= 60) return '🟡 Moderate';
  if (score >= 45) return '🟠 Low';
  return '🔴 Very Low';
}

function getEmotionEmoji(phase: string): string {
  const emojis: { [key: string]: string } = {
    'greed_expansion': '🚀',
    'panic_flush': '😱',
    'euphoric_climax': '🎉',
    'fatigue_phase': '😴',
    'narrative_saturation': '📊',
    'disbelief_accumulation': '🤔',
  };
  return emojis[phase] || '📈';
}

function getRegimeLabel(score: number): string {
  if (score >= 70) return 'Bull Market';
  if (score >= 50) return 'Neutral';
  return 'Bear Market';
}

function getRegimeEmoji(score: number): string {
  if (score >= 70) return '🚀';
  if (score >= 50) return '➡️';
  return '📉';
}

export default bot;