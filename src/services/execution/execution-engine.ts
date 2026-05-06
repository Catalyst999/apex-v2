// File path: src/services/execution/execution-engine.ts
/**
 * EXECUTION ENGINE
 * Takes routing decisions and executes trades
 * Manages position lifecycle: entry → monitoring → exit
 */

import { supabase } from '../../core/db/supabase';
import { walletManager } from '../wallet/wallet-manager';
import { outcomeLogger, TradeOutcome } from '../learning/outcome-logger';
import { emit } from '../events/event-bus';
import { v4 as uuidv4 } from 'uuid';

export interface ActivePosition {
  id: string;
  walletId: string;
  token: string;
  entryPrice: number;
  entryTime: number;
  positionSize: number; // in USD or tokens
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  conviction: number;
  status: 'OPEN' | 'MONITORING' | 'AT_STOP' | 'AT_TP' | 'CLOSING';
  currentPrice?: number;
  currentPnL?: number;
  currentPnLPercent?: number;
  signals?: string[];
}

export interface ExecutionConfig {
  maxOpenPositions: number;
  maxPositionSize: number;
  minStopDistance: number;
  maxLeverage: number;
  enableAutoTP: boolean;
  enableAutoSL: boolean;
  enableTrailing: boolean;
  trailingPercent: number;
}

const DEFAULT_CONFIG: ExecutionConfig = {
  maxOpenPositions: 5,
  maxPositionSize: 2000, // USD
  minStopDistance: 0.02, // 2%
  maxLeverage: 3,
  enableAutoTP: true,
  enableAutoSL: true,
  enableTrailing: true,
  trailingPercent: 0.03,
};

class ExecutionEngine {
  private openPositions: Map<string, ActivePosition> = new Map();
  private config: ExecutionConfig;

  constructor(config: Partial<ExecutionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * EXECUTE TRADE
   * Converts routing decision into actual position
   */
  async executeTrade(
    token: string,
    entryPrice: number,
    conviction: number,
    positionSize: number,
    leverage: number,
    stopLoss: number,
    takeProfit: number,
    walletId: string,
    signals: string[]
  ): Promise<ActivePosition | null> {
    try {
      // ─── VALIDATION ────────────────────────────────────────────────────

      const validation = await this.validateExecution(walletId, positionSize, leverage);
      if (!validation.valid) {
        console.log(`[Execution] Trade blocked: ${validation.reason}`);
        return null;
      }

      // ─── CREATE POSITION ───────────────────────────────────────────────

      const positionId = uuidv4();
      const position: ActivePosition = {
        id: positionId,
        walletId,
        token,
        entryPrice,
        entryTime: Date.now(),
        positionSize,
        leverage,
        stopLoss,
        takeProfit,
        conviction,
        status: 'OPEN',
        signals,
      };

      // Store locally
      this.openPositions.set(positionId, position);

      // Store in database
      await supabase.from('active_positions').insert({
        id: positionId,
        wallet_id: walletId,
        token,
        entry_price: entryPrice,
        entry_time: new Date(position.entryTime).toISOString(),
        position_size: positionSize,
        leverage,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        conviction,
        status: 'OPEN',
        signals,
        created_at: new Date().toISOString(),
      });

      // Update wallet analytics
      await walletManager.updatePositionCount(walletId, 1);

      // Emit event
      await emit({
        type: 'TRADE_EXECUTED',
        token,
        walletId,
        entryPrice,
        positionSize,
        leverage,
        timestamp: Date.now(),
      });

      console.log(`[Execution] ✅ Trade executed: ${token} @ $${entryPrice.toFixed(8)} | Size: ${positionSize} | Leverage: ${leverage}x`);

      return position;
    } catch (error) {
      console.error('[Execution] Failed to execute trade:', error);
      return null;
    }
  }

  /**
   * CLOSE POSITION
   * Exits trade with reason
   */
  async closePosition(positionId: string, exitPrice: number, reason: string): Promise<void> {
    try {
      const position = this.openPositions.get(positionId);
      if (!position) return;

      // Calculate P&L
      const pnl = (exitPrice - position.entryPrice) * position.positionSize;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
      const holdTime = Math.floor((Date.now() - position.entryTime) / 1000);

      // Update position status
      await supabase.from('active_positions').update({
        status: 'CLOSED',
        exit_price: exitPrice,
        exit_reason: reason,
        pnl,
        pnl_percent: pnlPercent,
        hold_time: holdTime,
        closed_at: new Date().toISOString(),
      }).eq('id', positionId);

      // Log outcome for learning
      const outcome: TradeOutcome = {
        id: uuidv4(),
        walletId: position.walletId,
        token: position.token,
        entryPrice: position.entryPrice,
        entryConviction: position.conviction,
        entryMode: this.getConvictionMode(position.conviction),
        entrySignals: position.signals || [],
        emotionState: 'unknown',
        marketRegime: 'unknown',
        narrativeContext: 'unknown',
        abnormalityScore: position.conviction,
        exitPrice,
        exitReason: reason,
        pnl,
        pnlPercent,
        holdTime,
        confidence: position.conviction,
        expectedValue: (position.takeProfit - position.entryPrice) * 0.5, // rough EV
        falseLiquiditySignal: reason.includes('liquidity'),
        fakeSocialSignal: reason.includes('social'),
        whaleExitDetected: reason.includes('whale'),
        manipulationDetected: reason.includes('pump'),
        timestamp: position.entryTime,
        completedAt: Date.now(),
        outcome: 'WIN' as const, // will be set in logger
      };

      await outcomeLogger.logOutcome(outcome);

      // Emit event
      await emit({
        type: 'TRADE_CLOSED',
        tradeId: positionId,
        token: position.token,
        walletId: position.walletId,
        entryPrice: position.entryPrice,
        exitPrice,
        pnl,
        pnlPercent,
        reason,
        timestamp: Date.now(),
      });

      // Update wallet
      await walletManager.updatePositionCount(position.walletId, -1);
      await walletManager.updatePnL(position.walletId, pnl);

      // Remove from tracking
      this.openPositions.delete(positionId);

      console.log(`[Execution] ✅ Position closed: ${position.token} | P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    } catch (error) {
      console.error('[Execution] Failed to close position:', error);
    }
  }

  /**
   * MONITOR POSITIONS
   * Check for stop loss / take profit hits
   */
  async monitorPositions(priceUpdate: Record<string, number>): Promise<void> {
    for (const [positionId, position] of this.openPositions) {
      const currentPrice = priceUpdate[position.token];
      if (!currentPrice) continue;

      position.currentPrice = currentPrice;
      position.currentPnL = (currentPrice - position.entryPrice) * position.positionSize;
      position.currentPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      // Check take profit
      if (currentPrice >= position.takeProfit && this.config.enableAutoTP) {
        await this.closePosition(positionId, currentPrice, 'take_profit_hit');
        continue;
      }

      // Check stop loss
      if (currentPrice <= position.stopLoss && this.config.enableAutoSL) {
        await this.closePosition(positionId, currentPrice, 'stop_loss_hit');
        continue;
      }

      // Trailing stop
      if (this.config.enableTrailing && position.currentPnLPercent > 10) {
        const newStop = currentPrice * (1 - this.config.trailingPercent);
        if (newStop > position.stopLoss) {
          position.stopLoss = newStop;
        }
      }
    }
  }

  /**
   * VALIDATE EXECUTION
   * Check risk limits before trading
   */
  private async validateExecution(
    walletId: string,
    positionSize: number,
    leverage: number
  ): Promise<{ valid: boolean; reason: string }> {
    // Check max open positions
    const openCount = Array.from(this.openPositions.values()).filter((p) => p.walletId === walletId).length;
    if (openCount >= this.config.maxOpenPositions) {
      return {
        valid: false,
        reason: `Max open positions (${this.config.maxOpenPositions}) reached`,
      };
    }

    // Check position size
    if (positionSize > this.config.maxPositionSize) {
      return {
        valid: false,
        reason: `Position size $${positionSize} exceeds max $${this.config.maxPositionSize}`,
      };
    }

    // Check leverage
    if (leverage > this.config.maxLeverage) {
      return {
        valid: false,
        reason: `Leverage ${leverage}x exceeds max ${this.config.maxLeverage}x`,
      };
    }

    // Check wallet balance
    const wallet = await walletManager.getWallet(walletId);
    if (!wallet) {
      return { valid: false, reason: 'Wallet not found' };
    }

    return { valid: true, reason: 'OK' };
  }

  /**
   * Get conviction mode from score
   */
  private getConvictionMode(conviction: number): 'AGGRESSIVE' | 'CAUTIOUS' | 'DEFENSIVE' | 'OBSERVATION' | 'INACTIVE' {
    if (conviction >= 80) return 'AGGRESSIVE';
    if (conviction >= 60) return 'CAUTIOUS';
    if (conviction >= 40) return 'DEFENSIVE';
    if (conviction >= 30) return 'OBSERVATION';
    return 'INACTIVE';
  }

  /**
   * Get open positions for wallet
   */
  getOpenPositions(walletId: string): ActivePosition[] {
    return Array.from(this.openPositions.values()).filter((p) => p.walletId === walletId);
  }

  /**
   * Get position by ID
   */
  getPosition(positionId: string): ActivePosition | undefined {
    return this.openPositions.get(positionId);
  }

  /**
   * Get all open positions
   */
  getAllOpenPositions(): ActivePosition[] {
    return Array.from(this.openPositions.values());
  }

  /**
   * Calculate portfolio P&L
   */
  getPortfolioPnL(): { totalPnL: number; totalPnLPercent: number } {
    let totalPnL = 0;
    let totalCapital = 0;

    for (const position of this.openPositions.values()) {
      if (position.currentPnL) totalPnL += position.currentPnL;
      totalCapital += position.positionSize;
    }

    return {
      totalPnL,
      totalPnLPercent: totalCapital > 0 ? (totalPnL / totalCapital) * 100 : 0,
    };
  }

  /**
   * Get execution stats
   */
  getStats(): {
    openPositions: number;
    totalPnL: number;
    avgHoldTime: number;
    winRate: number;
  } {
    const positions = this.getAllOpenPositions();
    const avgHoldTime =
      positions.length > 0
        ? positions.reduce((sum, p) => sum + (Date.now() - p.entryTime), 0) / positions.length / 1000
        : 0;

    return {
      openPositions: positions.length,
      totalPnL: positions.reduce((sum, p) => sum + (p.currentPnL || 0), 0),
      avgHoldTime,
      winRate: 0, // would calculate from historical outcomes
    };
  }
}

export const executionEngine = new ExecutionEngine();