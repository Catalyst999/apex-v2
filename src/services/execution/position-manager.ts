// File path: src/services/execution/position-manager.ts
/**
 * POSITION MANAGER
 * Unified position tracking and management
 * Central intelligence for all open positions
 */

import { supabase } from '../../core/db/supabase';
import { runtimeState } from '../../core/state/runtime-state';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export interface ManagedPosition {
  id: string;
  walletId: string;
  token: string;
  entryPrice: number;
  entryTime: number;
  positionSize: number;
  leverage: number;
  conviction: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  holdTime: number;
  status: 'OPEN' | 'SCALING_UP' | 'SCALING_DOWN' | 'AT_PROFIT_TARGET' | 'AT_STOP_LOSS' | 'CLOSING';
  
  // Stop/Target management
  stopLoss: number;
  trailingStop: number;
  takeProfit: number;
  
  // Scaling state
  scaledIn: number; // times added to position
  scaledOut: number; // times reduced from position
  entryPrices: number[]; // all entry prices for averages
  
  // Risk metrics
  riskPercent: number; // risk as % of wallet
  rewardPercent: number; // potential reward
  riskRewardRatio: number;
  
  // Signals that got us here
  initialSignals: string[];
  
  // Metadata
  narrative?: string;
  regime?: string;
  lastUpdated: number;
}

class PositionManager {
  private positions: Map<string, ManagedPosition> = new Map();
  private positionHistory: Map<string, ManagedPosition[]> = new Map(); // historical tracking

  /**
   * LOAD POSITIONS
   * Load from database on startup
   */
  async loadPositions(): Promise<void> {
    try {
      const { data } = await supabase
        .from('active_positions')
        .select('*')
        .eq('status', 'OPEN');

      if (data) {
        for (const pos of data) {
          this.positions.set(pos.id, {
            id: pos.id,
            walletId: pos.wallet_id,
            token: pos.token,
            entryPrice: pos.entry_price,
            entryTime: pos.entry_time,
            positionSize: pos.position_size,
            leverage: pos.leverage,
            conviction: pos.conviction,
            currentPrice: pos.entry_price,
            currentValue: pos.position_size,
            pnl: 0,
            pnlPercent: 0,
            holdTime: 0,
            status: 'OPEN',
            stopLoss: pos.stop_loss,
            trailingStop: pos.stop_loss,
            takeProfit: pos.take_profit,
            scaledIn: 0,
            scaledOut: 0,
            entryPrices: [pos.entry_price],
            riskPercent: 0,
            rewardPercent: 0,
            riskRewardRatio: 0,
            initialSignals: pos.signals || [],
            lastUpdated: Date.now(),
          });
        }
      }

      console.log(`[PositionManager] Loaded ${this.positions.size} positions`);
    } catch (error) {
      console.error('[PositionManager] Load error:', error);
    }
  }

  /**
   * CREATE POSITION
   * Open new position
   */
  async createPosition(
    walletId: string,
    token: string,
    entryPrice: number,
    positionSize: number,
    leverage: number,
    conviction: number,
    stopLoss: number,
    takeProfit: number,
    signals: string[],
  ): Promise<ManagedPosition | null> {
    try {
      const posId = `pos-${Date.now()}`;

      const position: ManagedPosition = {
        id: posId,
        walletId,
        token,
        entryPrice,
        entryTime: Date.now(),
        positionSize,
        leverage,
        conviction,
        currentPrice: entryPrice,
        currentValue: positionSize,
        pnl: 0,
        pnlPercent: 0,
        holdTime: 0,
        status: 'OPEN',
        stopLoss,
        trailingStop: stopLoss,
        takeProfit,
        scaledIn: 0,
        scaledOut: 0,
        entryPrices: [entryPrice],
        riskPercent: (positionSize * leverage) / 100,
        rewardPercent: ((takeProfit - entryPrice) / entryPrice) * 100,
        riskRewardRatio: ((takeProfit - entryPrice) / (entryPrice - stopLoss)),
        initialSignals: signals,
        lastUpdated: Date.now(),
      };

      this.positions.set(posId, position);

      // Save to database
      await supabase.from('active_positions').insert({
        id: posId,
        wallet_id: walletId,
        token,
        entry_price: entryPrice,
        entry_time: Date.now(),
        position_size: positionSize,
        leverage,
        conviction,
        status: 'OPEN',
        stop_loss: stopLoss,
        take_profit: takeProfit,
        signals,
      });

      console.log(`[PositionManager] Created position: ${token} @ $${entryPrice}`);
      return position;
    } catch (error) {
      console.error('[PositionManager] Create error:', error);
      return null;
    }
  }

  /**
   * UPDATE POSITION PRICE
   * Called when price updates arrive
   */
  updatePositionPrice(positionId: string, newPrice: number): void {
    const pos = this.positions.get(positionId);
    if (!pos) return;

    pos.currentPrice = newPrice;
    pos.currentValue = newPrice * pos.positionSize;
    pos.pnl = (newPrice - pos.entryPrice) * pos.positionSize;
    pos.pnlPercent = ((newPrice - pos.entryPrice) / pos.entryPrice) * 100;
    pos.holdTime = Date.now() - pos.entryTime;
    pos.lastUpdated = Date.now();

    // Check if at target or stop
    if (newPrice >= pos.takeProfit) {
      pos.status = 'AT_PROFIT_TARGET';
    } else if (newPrice <= pos.stopLoss) {
      pos.status = 'AT_STOP_LOSS';
    } else {
      pos.status = 'OPEN';
    }
  }

  /**
   * SCALE POSITION
   * Add to winning position
   */
  async scalePosition(
    positionId: string,
    additionalSize: number,
    newEntryPrice: number,
  ): Promise<boolean> {
    const pos = this.positions.get(positionId);
    if (!pos) return false;

    try {
      // Update position
      pos.positionSize += additionalSize;
      pos.entryPrices.push(newEntryPrice);
      pos.entryPrice = this.calculateAverageEntry(pos.entryPrices);
      pos.scaledIn += 1;
      pos.status = 'SCALING_UP';
      pos.lastUpdated = Date.now();

      // Save to DB
      await supabase
        .from('active_positions')
        .update({
          position_size: pos.positionSize,
          entry_price: pos.entryPrice,
          status: 'SCALING_UP',
        })
        .eq('id', positionId);

      console.log(`[PositionManager] Scaled ${positionId}: +${additionalSize}`);
      return true;
    } catch (error) {
      console.error('[PositionManager] Scale error:', error);
      return false;
    }
  }

  /**
   * REDUCE POSITION
   * Take profit from position
   */
  async reducePosition(
    positionId: string,
    reduceAmount: number,
    exitPrice: number,
  ): Promise<boolean> {
    const pos = this.positions.get(positionId);
    if (!pos) return false;

    try {
      pos.positionSize -= reduceAmount;
      pos.scaledOut += 1;
      pos.status = 'SCALING_DOWN';
      pos.lastUpdated = Date.now();

      // If position completely closed
      if (pos.positionSize <= 0) {
        await this.closePosition(positionId, exitPrice, 'partial_exit');
        return true;
      }

      // Update DB
      await supabase
        .from('active_positions')
        .update({
          position_size: pos.positionSize,
          status: 'SCALING_DOWN',
        })
        .eq('id', positionId);

      console.log(`[PositionManager] Reduced ${positionId}: -${reduceAmount}`);
      return true;
    } catch (error) {
      console.error('[PositionManager] Reduce error:', error);
      return false;
    }
  }

  /**
   * CLOSE POSITION
   * Exit entire position
   */
  async closePosition(
    positionId: string,
    exitPrice: number,
    reason: string,
  ): Promise<boolean> {
    const pos = this.positions.get(positionId);
    if (!pos) return false;

    try {
      const finalPnL = (exitPrice - pos.entryPrice) * pos.positionSize;
      const finalPnLPercent = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;

      // Update status
      pos.status = 'CLOSING';
      pos.lastUpdated = Date.now();

      // Save outcome
      await supabase.from('trade_outcomes').insert({
        wallet_id: pos.walletId,
        token: pos.token,
        entry_price: pos.entryPrice,
        exit_price: exitPrice,
        position_size: pos.positionSize,
        pnl: finalPnL,
        pnl_percent: finalPnLPercent,
        hold_time_minutes: (pos.holdTime / 60000).toFixed(0),
        conviction: pos.conviction,
        reason,
        signals: pos.initialSignals,
        created_at: new Date().toISOString(),
      });

      // Remove from active
      this.positions.delete(positionId);

      // Emit event
      await eventOrchestrator.signalClosed(
        positionId,
        pos.token,
        exitPrice,
        finalPnL,
        finalPnLPercent,
        reason,
      );

      console.log(`[PositionManager] Closed ${positionId}: ${pos.token} P&L: ${finalPnLPercent.toFixed(2)}%`);
      return true;
    } catch (error) {
      console.error('[PositionManager] Close error:', error);
      return false;
    }
  }

  /**
   * GET POSITION
   */
  getPosition(positionId: string): ManagedPosition | undefined {
    return this.positions.get(positionId);
  }

  /**
   * GET ALL POSITIONS
   */
  getAllPositions(): ManagedPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * GET WALLET POSITIONS
   */
  getWalletPositions(walletId: string): ManagedPosition[] {
    return Array.from(this.positions.values()).filter((p) => p.walletId === walletId);
  }

  /**
   * PORTFOLIO METRICS
   */
  getPortfolioMetrics(walletId?: string) {
    const positions = walletId
      ? this.getWalletPositions(walletId)
      : this.getAllPositions();

    const totalCapital = positions.reduce((sum, p) => sum + (p.positionSize * p.leverage), 0);
    const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
    const avgHoldTime = positions.length > 0 ? positions.reduce((sum, p) => sum + p.holdTime, 0) / positions.length : 0;
    const winningPositions = positions.filter((p) => p.pnl > 0).length;

    return {
      positionCount: positions.length,
      totalCapital,
      totalValue,
      totalPnL,
      totalPnLPercent: totalCapital > 0 ? (totalPnL / totalCapital) * 100 : 0,
      winRate: positions.length > 0 ? (winningPositions / positions.length) * 100 : 0,
      avgHoldTime,
      exposure: (totalCapital / 100), // as % of wallet
      riskExposure: positions.reduce((sum, p) => sum + p.riskPercent, 0),
    };
  }

  /**
   * HELPER: Calculate average entry
   */
  private calculateAverageEntry(prices: number[]): number {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }
}

export const positionManager = new PositionManager();