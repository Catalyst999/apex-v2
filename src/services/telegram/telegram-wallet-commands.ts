// File path: src/services/telegram/telegram-wallet-commands.ts

import TelegramBot from 'node-telegram-bot-api';
import { walletManager } from '../wallet/wallet-manager';
import { walletDiscoveryEngine } from '../wallet/wallet-discovery-engine';
import { WalletStrategyType as WalletStrategy } from '../wallet/wallet-types';

export class TelegramWalletCommands {
  private bot: TelegramBot;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.registerCommands();
  }

  private registerCommands(): void {
    this.bot.onText(/\/wallet$/i, (msg) => this.handleGetWallet(msg));
    this.bot.onText(/\/wallets$/i, (msg) => this.handleListWallets(msg));
    this.bot.onText(/\/add_wallet\s+(\S+)\s+(CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL)\s*(.*)/i, (msg, match) =>
      this.handleAddWallet(msg, match)
    );
    this.bot.onText(/\/select_wallet\s+(\S+)/i, (msg, match) => this.handleSelectWallet(msg, match));
    this.bot.onText(/\/tag_wallet\s+(\S+)\s+(.*)/i, (msg, match) => this.handleTagWallet(msg, match));
    this.bot.onText(/\/strategy\s+(\S+)\s+(CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL)/i, (msg, match) =>
      this.handleSetStrategy(msg, match)
    );
    this.bot.onText(/\/discoveries$/i, (msg) => this.handlePendingDiscoveries(msg));
  }

  /**
   * /wallet - Show current selected wallet
   */
  private async handleGetWallet(msg: any): Promise<void> {
    const chatId = msg.chat.id;
    const selectedId = walletManager.getSelectedWalletId();

    if (!selectedId) {
      this.bot.sendMessage(chatId, '❌ No wallet selected. Use /add_wallet to create one.');
      return;
    }

    try {
      const context = await walletManager.getWalletContext(selectedId);
      if (!context) {
        this.bot.sendMessage(chatId, '❌ Wallet not found.');
        return;
      }

      const message = `
📊 **Current Wallet**

Address: \`${context.wallet.address}\`
Strategy: ${context.wallet.strategy}
Active: ${context.wallet.is_active ? '✅' : '❌'}

📈 **Performance**
PnL: $${context.pnl_usd.toFixed(2)}
Win Rate: ${(context.win_rate * 100).toFixed(1)}%
Trades: ${context.analytics?.total_trades || 0}

⚙️ **Limits**
Max Positions: ${context.max_positions}
Max Leverage: ${context.max_leverage}x
      `;

      this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * /wallets - List all wallets
   */
  private async handleListWallets(msg: any): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const wallets = await walletManager.getAllWallets();

      if (wallets.length === 0) {
        this.bot.sendMessage(chatId, '❌ No wallets found. Create one with /add_wallet');
        return;
      }

      let message = '💼 **Your Wallets**\n\n';
      for (const wallet of wallets) {
        const analytics = await walletManager.getAnalytics(wallet.id);
        message += `
\`${wallet.address.slice(0, 10)}...\`
Strategy: ${wallet.strategy}
PnL: $${analytics?.total_pnl_usd || 0}
Trades: ${analytics?.total_trades || 0}
━━━━━━━━━━━━━━━━━━
      `;
      }

      this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * /add_wallet <address> <strategy> <tags>
   */
  private async handleAddWallet(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    if (!match || match.length < 3) {
      this.bot.sendMessage(chatId, '❌ Usage: /add_wallet <address> <CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL> [tags]');
      return;
    }

    const address = match[1];
    const strategyStr = match[2].toUpperCase();
    const tags = match[3]?.trim() || 'custom';

    try {
      const strategy = strategyStr as WalletStrategy;
      const wallet = await walletManager.createWallet(address, strategy, tags);
      await walletManager.selectWallet(wallet.id);

      this.bot.sendMessage(
        chatId,
        `✅ Wallet created and selected!\n\nAddress: \`${wallet.address}\`\nStrategy: ${wallet.strategy}`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * /select_wallet <address>
   */
  private async handleSelectWallet(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    if (!match || !match[1]) {
      this.bot.sendMessage(chatId, '❌ Usage: /select_wallet <address>');
      return;
    }

    try {
      const wallet = await walletManager.getWalletByAddress(match[1]);
      if (!wallet) {
        this.bot.sendMessage(chatId, '❌ Wallet not found.');
        return;
      }

      await walletManager.selectWallet(wallet.id);
      this.bot.sendMessage(chatId, `✅ Selected wallet: \`${wallet.address}\`\nStrategy: ${wallet.strategy}`, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * /tag_wallet <address> <tags>
   */
  private async handleTagWallet(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    if (!match || !match[1] || !match[2]) {
      this.bot.sendMessage(chatId, '❌ Usage: /tag_wallet <address> <tag1,tag2,...>');
      return;
    }

    try {
      const wallet = await walletManager.getWalletByAddress(match[1]);
      if (!wallet) {
        this.bot.sendMessage(chatId, '❌ Wallet not found.');
        return;
      }

      const tags = match[2].split(',').map((t) => t.trim());
      await walletManager.updateWalletTags(wallet.id, tags);

      this.bot.sendMessage(chatId, `✅ Tags updated: ${tags.join(', ')}`);
    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * /strategy <address> <strategy>
   */
  private async handleSetStrategy(
    msg: any,
    match: RegExpExecArray | null
  ): Promise<void> {
    const chatId = msg.chat.id;
    if (!match || !match[1] || !match[2]) {
      this.bot.sendMessage(chatId, '❌ Usage: /strategy <address> <CONSERVATIVE|AGGRESSIVE|EXPERIMENTAL>');
      return;
    }

    try {
      const wallet = await walletManager.getWalletByAddress(match[1]);
      if (!wallet) {
        this.bot.sendMessage(chatId, '❌ Wallet not found.');
        return;
      }

      const strategy = match[2].toUpperCase() as WalletStrategy;
      await walletManager.updateWalletStrategy(wallet.id, strategy);

      this.bot.sendMessage(chatId, `✅ Strategy updated to: ${strategy}`);
    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * /discoveries - Show pending wallet discoveries
   */
  private async handlePendingDiscoveries(msg: any): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const discoveries = await walletDiscoveryEngine.getPendingDiscoveries(5);

      if (discoveries.length === 0) {
        this.bot.sendMessage(chatId, '✅ No pending wallet discoveries.');
        return;
      }

      let message = '🔍 **Pending Wallet Discoveries**\n\n';
      for (const discovery of discoveries) {
        message += `
\`${discovery.discovered_address.slice(0, 10)}...\`
Confidence: ${(discovery.confidence * 100).toFixed(1)}%
Reason: ${discovery.reason}
━━━━━━━━━━━━━━━━━━
      `;
      }

      this.bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' });
    } catch (error) {
      this.bot.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export function initializeWalletCommands(bot: TelegramBot): TelegramWalletCommands {
  return new TelegramWalletCommands(bot);
}