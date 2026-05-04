/**
 * TELEGRAM WALLET COMMANDS
 */
import { bot } from './bot';
import { walletManager } from '../wallet/wallet-manager';
import { WalletStrategy, WalletTag } from '../wallet/wallet-types';

export const handleWalletStatus = async (msg: any) => {
  const context = await walletManager.getActiveWalletContext();
  if (!context || !bot) return;

  const message = `
📊 **ACTIVE WALLET**
Address: \`${context.wallet.address}\`
Strategy: ${context.wallet.strategy.toUpperCase()}
Win Rate: ${(context.win_rate * 100).toFixed(1)}%
PnL: $${context.pnl_usd.toFixed(2)}
`.trim();
  return bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
};

export const handleListWallets = async (msg: any) => {
  if (!bot) return;
  const wallets = await walletManager.getAllWallets();
  let message = '📋 **ALL WALLETS**\n';
  for (const w of wallets) {
    const analytics = await walletManager.getWalletAnalytics(w.id);
    message += `${w.is_active ? '✅' : '⭕'} \`${w.address.slice(0,10)}...\` | PnL: $${(analytics?.total_pnl_usd || 0).toFixed(2)}\n`;
  }
  return bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
};

export const registerWalletCommands = () => {
  if (!bot) return;
  bot.onText(/^\/wallet$/, handleWalletStatus);
  bot.onText(/^\/wallets$/, handleListWallets);
  console.log('[WalletCommands] Registered.');
};