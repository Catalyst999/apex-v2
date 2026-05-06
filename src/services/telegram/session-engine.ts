// File path: src/services/telegram/session-engine.ts
/**
 * TELEGRAM SESSION ENGINE
 * Handles stateful conversational flows
 * Fixes broken command sequences by maintaining conversation state
 */

import TelegramBot from 'node-telegram-bot-api';
import { runtimeState } from '../../core/state/runtime-state';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export type SessionFlow = 'WALLET_SETUP' | 'STRATEGY_CHANGE' | 'TRADE_ENTRY' | 'AUTO_TRADE_TOGGLE' | 'NONE';

interface SessionData {
  step: number;
  flow: SessionFlow;
  data: Record<string, any>;
}

class TelegramSessionEngine {
  private bot: TelegramBot | null = null;
  private activeFlows: Map<number, SessionData> = new Map();

  constructor() {}

  /**
   * INITIALIZE
   * Set bot reference
   */
  initialize(botInstance: TelegramBot): void {
    this.bot = botInstance;
    console.log('[TelegramSession] Engine initialized');
  }

  /**
   * START FLOW
   * Initiate a stateful conversation
   */
  async startFlow(userId: number, flow: SessionFlow): Promise<void> {
    // Create session in runtime state
    runtimeState.createSession(userId.toString());

    // Initialize flow
    this.activeFlows.set(userId, {
      step: 0,
      flow,
      data: {},
    });

    console.log(`[TelegramSession] Started ${flow} for user ${userId}`);

    // Execute first step
    await this.executeFlowStep(userId, 0);
  }

  /**
   * EXECUTE FLOW STEP
   * Execute next step in conversation
   */
  private async executeFlowStep(userId: number, step: number): Promise<void> {
    const flowData = this.activeFlows.get(userId);
    if (!flowData) return;

    const { flow } = flowData;

    try {
      if (flow === 'WALLET_SETUP') {
        await this.walletSetupFlow(userId, step, flowData);
      } else if (flow === 'STRATEGY_CHANGE') {
        await this.strategyChangeFlow(userId, step, flowData);
      } else if (flow === 'TRADE_ENTRY') {
        await this.tradeEntryFlow(userId, step, flowData);
      } else if (flow === 'AUTO_TRADE_TOGGLE') {
        await this.autoTradeToggleFlow(userId, step, flowData);
      }
    } catch (error) {
      console.error(`[TelegramSession] Flow error:`, error);
      await this.endFlow(userId);
    }
  }

  /**
   * WALLET SETUP FLOW
   * Multi-step wallet addition
   */
  private async walletSetupFlow(userId: number, step: number, flowData: SessionData): Promise<void> {
    if (step === 0) {
      // Ask for wallet address
      await this.bot?.sendMessage(userId, `🔐 **WALLET SETUP**\n\nPlease send your wallet address:`, {
        parse_mode: 'Markdown',
      });

      flowData.step = 1;
      const session = runtimeState.getSession(userId.toString());
      if (session) {
        session.awaiting = 'wallet_address';
        session.step = 'wallet_setup_address';
      }
    } else if (step === 1) {
      // Ask for strategy
      const message = `✅ Address: \`${flowData.data.address}\`\n\n📊 **Select Strategy:**`;

      await this.bot?.sendMessage(userId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛡️ Conservative',
                callback_data: 'strategy_conservative',
              },
              {
                text: '⚡ Aggressive',
                callback_data: 'strategy_aggressive',
              },
            ],
            [
              {
                text: '🔬 Experimental',
                callback_data: 'strategy_experimental',
              },
            ],
          ],
        },
      });

      flowData.step = 2;
      const session = runtimeState.getSession(userId.toString());
      if (session) {
        session.awaiting = 'strategy_selection';
        session.step = 'wallet_setup_strategy';
      }
    } else if (step === 2) {
      // Ask for tag
      await this.bot?.sendMessage(
        userId,
        `📌 **Tag this wallet** (e.g., "Main", "Risky", "Test"):\n\nSend the tag name:`,
        {
          parse_mode: 'Markdown',
        },
      );

      flowData.step = 3;
      const session = runtimeState.getSession(userId.toString());
      if (session) {
        session.awaiting = 'wallet_tag';
        session.step = 'wallet_setup_tag';
      }
    } else if (step === 3) {
      // Complete setup
      const { address, strategy, tag } = flowData.data;

      await eventOrchestrator.walletAdded(`wallet-${userId}-${Date.now()}`, address);

      await this.bot?.sendMessage(
        userId,
        `✅ **WALLET ADDED**\n\nAddress: \`${address.slice(0, 8)}...\`\nStrategy: ${strategy}\nTag: ${tag}`,
        {
          parse_mode: 'Markdown',
        },
      );

      await this.endFlow(userId);
    }
  }

  /**
   * STRATEGY CHANGE FLOW
   */
  private async strategyChangeFlow(userId: number, step: number, flowData: SessionData): Promise<void> {
    if (step === 0) {
      await this.bot?.sendMessage(userId, `📊 **SELECT NEW STRATEGY:**`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛡️ Conservative', callback_data: 'strategy_conservative' }],
            [{ text: '⚡ Aggressive', callback_data: 'strategy_aggressive' }],
            [{ text: '🔬 Experimental', callback_data: 'strategy_experimental' }],
          ],
        },
      });

      flowData.step = 1;
    } else if (step === 1) {
      const { strategy } = flowData.data;
      await this.bot?.sendMessage(userId, `✅ Strategy changed to: **${strategy}**`, {
        parse_mode: 'Markdown',
      });
      await this.endFlow(userId);
    }
  }

  /**
   * TRADE ENTRY FLOW
   */
  private async tradeEntryFlow(userId: number, step: number, flowData: SessionData): Promise<void> {
    if (step === 0) {
      await this.bot?.sendMessage(userId, `🎯 **MANUAL TRADE ENTRY**\n\nToken address or symbol:`, {
        parse_mode: 'Markdown',
      });

      flowData.step = 1;
      const session = runtimeState.getSession(userId.toString());
      if (session) {
        session.awaiting = 'token_input';
      }
    } else if (step === 1) {
      await this.bot?.sendMessage(userId, `💰 **Entry price:**`, {
        parse_mode: 'Markdown',
      });

      flowData.step = 2;
      const session = runtimeState.getSession(userId.toString());
      if (session) {
        session.awaiting = 'price_input';
      }
    } else if (step === 2) {
      const { token, price } = flowData.data;
      const message = `✅ Entry confirmed\n\nToken: ${token}\nPrice: $${price}\n\n✨ Position created!`;

      await this.bot?.sendMessage(userId, message, {
        parse_mode: 'Markdown',
      });

      await this.endFlow(userId);
    }
  }

  /**
   * AUTO TRADE TOGGLE FLOW
   */
  private async autoTradeToggleFlow(userId: number, step: number, flowData: SessionData): Promise<void> {
    if (step === 0) {
      await this.bot?.sendMessage(userId, `🤖 **AUTO TRADING**\n\nEnable automatic trading?`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Enable', callback_data: 'autotrade_enable' }],
            [{ text: '❌ Disable', callback_data: 'autotrade_disable' }],
          ],
        },
      });

      flowData.step = 1;
    } else if (step === 1) {
      const { enabled } = flowData.data;
      await this.bot?.sendMessage(userId, `✅ Auto trading ${enabled ? 'enabled' : 'disabled'}`, {
        parse_mode: 'Markdown',
      });

      await this.endFlow(userId);
    }
  }

  /**
   * HANDLE MESSAGE
   * Route incoming message to active flow
   */
  async handleMessage(userId: number, text: string): Promise<void> {
    const flowData = this.activeFlows.get(userId);
    if (!flowData) {
      // No active flow - ignore
      return;
    }

    const session = runtimeState.getSession(userId.toString());
    if (!session || !session.awaiting) return;

    // Store message in flow data
    if (session.awaiting === 'wallet_address') {
      flowData.data.address = text;
    } else if (session.awaiting === 'wallet_tag') {
      flowData.data.tag = text;
    } else if (session.awaiting === 'token_input') {
      flowData.data.token = text;
    } else if (session.awaiting === 'price_input') {
      flowData.data.price = parseFloat(text);
    }

    // Emit event
    await eventOrchestrator.telegramMessage(userId.toString(), text);

    // Move to next step
    await this.executeFlowStep(userId, flowData.step);
  }

  /**
   * HANDLE BUTTON PRESS
   * Route button press to active flow
   */
  async handleButtonPress(userId: number, buttonId: string): Promise<void> {
    const flowData = this.activeFlows.get(userId);
    if (!flowData) return;

    // Extract data from button ID
    if (buttonId.startsWith('strategy_')) {
      const strategy = buttonId.split('_')[1].toUpperCase();
      flowData.data.strategy = strategy;
    } else if (buttonId.startsWith('autotrade_')) {
      const enabled = buttonId === 'autotrade_enable';
      flowData.data.enabled = enabled;
    }

    // Emit event
    await eventOrchestrator.telegramButtonPress(userId.toString(), buttonId);

    // Move to next step
    await this.executeFlowStep(userId, flowData.step);
  }

  /**
   * END FLOW
   * Clean up conversation
   */
  async endFlow(userId: number): Promise<void> {
    this.activeFlows.delete(userId);
    runtimeState.endSession(userId.toString());
    console.log(`[TelegramSession] Ended flow for user ${userId}`);
  }

  /**
   * GET ACTIVE FLOW
   */
  getActiveFlow(userId: number): SessionFlow | null {
    const flowData = this.activeFlows.get(userId);
    return flowData?.flow || null;
  }

  /**
   * IS IN FLOW
   */
  isInFlow(userId: number): boolean {
    return this.activeFlows.has(userId);
  }
}

// Export singleton
export const telegramSessionEngine = new TelegramSessionEngine();
