// File path: src/services/execution/position-manager.ts
/**
 * POSITION MANAGER
 * Unified position tracking and management
 * Central intelligence for all open positions
 */

import { supabase } from '../../core/db/supabase';
import { runtimeState } from '../../core/state/runtime-state';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';
import { evaluateJeetSignal, analyzeVolumeProfile, volumeProfileSummary } from './jeet-exit';
import { drawdownTracker } from '../risk/drawdown-tracker';
import { rpcOrchestrator } from '../rpc/rpc-orchestrator';
import { solanaConnection } from '../rpc/solana-connection';
import { outcomeLogger, TradeOutcome } from '../learning/outcome-logger';
import { confidenceAdjuster } from '../learning/confidence-adjuster';
import { tradingJournalEngine } from '../learning/trading-journal-engine';
import { aiSummaryGenerator } from '../learning/ai-summary-generator';
import { capitalStateEngine } from '../../core/capital-state-engine';
import { v4 as uuidv4 } from 'uuid';

// NEW: Position Sizing & Survival Execution Engines
import { buyNowTestEngine } from './buy-now-test-engine';
import { profitProtectionEngine } from './profit-protection-engine';
import { psychologicalRiskManager } from './psychological-risk-management';
import { POSITION_SIZING } from '../../core/config';

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
  currentPnL: number;
  currentPnLPercent: number;
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
            currentPnL: 0,
            currentPnLPercent: 0,
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
        currentPnL: 0,
        currentPnLPercent: 0,
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
      const now = Date.now();
      const finalPnL = (exitPrice - pos.entryPrice) * pos.positionSize;
      const finalPnLPercent = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const holdTime = now - pos.entryTime;
      const holdTimeMinutes = Math.floor(holdTime / 60000);

      // ─── UPDATE POSITION STATUS ──────────────────────────────
      pos.status = 'CLOSING';
      pos.lastUpdated = now;

      // ─── SAVE OUTCOME TO DATABASE ────────────────────────────
      await supabase.from('trade_outcomes').insert({
        wallet_id: pos.walletId,
        token: pos.token,
        entry_price: pos.entryPrice,
        exit_price: exitPrice,
        position_size: pos.positionSize,
        pnl: finalPnL,
        pnl_percent: finalPnLPercent,
        hold_time_minutes: holdTimeMinutes,
        conviction: pos.conviction,
        reason,
        signals: pos.initialSignals,
        created_at: new Date().toISOString(),
      });

      // ─── LOG OUTCOME FOR LEARNING ───────────────────────────
      const outcome = {
        id: uuidv4(),
        walletId: pos.walletId,
        token: pos.token,
        entryPrice: pos.entryPrice,
        entryConviction: pos.conviction,
        entryMode: this.getConvictionMode(pos.conviction),
        entrySignals: pos.initialSignals || [],
        emotionState: 'unknown',
        marketRegime: runtimeState.getRegime()?.regime || 'UNKNOWN',
        narrativeContext: 'unknown',
        abnormalityScore: pos.conviction,
        exitPrice,
        exitReason: reason,
        pnl: finalPnL,
        pnlPercent: finalPnLPercent,
        holdTime,
        confidence: pos.conviction,
        expectedValue: (pos.takeProfit - pos.entryPrice) * 0.5,
        falseLiquiditySignal: reason.includes('liquidity'),
        fakeSocialSignal: reason.includes('social'),
        whaleExitDetected: reason.includes('whale'),
        manipulationDetected: reason.includes('pump'),
        timestamp: pos.entryTime,
        completedAt: now,
      };

      const resolvedOutcome: 'WIN' | 'LOSS' | 'BREAK_EVEN' = finalPnL > 0
        ? 'WIN'
        : finalPnL < 0
        ? 'LOSS'
        : 'BREAK_EVEN';

      const tradeOutcome: TradeOutcome = {
        ...outcome,
        outcome: resolvedOutcome,
      };

      try {
        await outcomeLogger.logOutcome(tradeOutcome);
        console.log('[PositionManager] ✅ Outcome recorded');
      } catch (outcomeErr) {
        console.warn('[PositionManager] Error logging outcome:', outcomeErr);
      }

      // ─────────────────────────────────────────────────────────
      // STEP 2: ADJUST CONFIDENCE BASED ON OUTCOME
      // ─────────────────────────────────────────────────────────
      console.log('[PositionManager] 🧠 Adjusting confidence...');
      const adjustment = await confidenceAdjuster.adjustConviction(pos.walletId, pos.conviction, tradeOutcome);
      const newMultiplier = await confidenceAdjuster.getMultiplier(pos.walletId);
      console.log(`[PositionManager] ✅ Confidence adjustment: ${adjustment.reason}`);
      console.log(`[PositionManager] ✅ Confidence multiplier: ${newMultiplier.toFixed(2)}x`);

      // ─────────────────────────────────────────────────────────
      // STEP 3: CREATE TRADING JOURNAL ENTRY
      // ─────────────────────────────────────────────────────────
      console.log('[PositionManager] 📚 Creating journal entry...');
      await tradingJournalEngine.logTrade(
        pos.walletId,
        pos.token,
        pos.entryPrice,
        exitPrice,
        pos.positionSize,
        pos.initialSignals || [],
        pos.conviction,
        reason,
        holdTime,
      );
      console.log('[PositionManager] ✅ Journal entry created');

      // ─────────────────────────────────────────────────────────
      // STEP 4: UPDATE WALLET STATS
      // ─────────────────────────────────────────────────────────
      const wallet = runtimeState.getWallet(pos.walletId);
      if (wallet) {
        wallet.totalPnL += finalPnL;
        wallet.openPositions = Math.max(0, wallet.openPositions - 1);
        (wallet as any).totalTrades = ((wallet as any).totalTrades || 0) + 1;
        wallet.lastUpdate = now;

        if (tradeOutcome.outcome === 'WIN') {
          (wallet as any).winningTrades = ((wallet as any).winningTrades || 0) + 1;
        } else if (tradeOutcome.outcome === 'LOSS') {
          (wallet as any).losingTrades = ((wallet as any).losingTrades || 0) + 1;
        }

        wallet.winRate = (wallet as any).totalTrades > 0
          ? ((wallet as any).winningTrades || 0) / (wallet as any).totalTrades
          : 0;

        console.log(`[PositionManager] 📈 Updated wallet: ${(wallet.winRate * 100).toFixed(1)}% win rate`);
      }

      // ─────────────────────────────────────────────────────────
      // STEP 5: PSYCHOLOGICAL RISK MANAGEMENT
      // ─────────────────────────────────────────────────────────
      if (wallet) {
        if (tradeOutcome.outcome === 'LOSS') {
          console.log('[PositionManager] ⚠️ Loss detected. Evaluating psychological safety...');
          const psychResult = await psychologicalRiskManager.evaluateAfterLoss(wallet, pos);
          console.log(`[PositionManager] 📊 Recommendation: ${psychResult.recommendedAction}`);

          if (psychResult.newCapitalState !== wallet.capitalState) {
            wallet.capitalState = psychResult.newCapitalState;
            console.log(`[PositionManager] 🔄 Capital state: ${wallet.capitalState}`);
          }

          if (psychResult.recommendedAction === 'pause') {
            wallet.shouldTrade = false;
            console.warn(`[PositionManager] 🛑 TRADING PAUSED: ${psychResult.reason}`);
            eventOrchestrator.emit('TRADING_PAUSED_PSYCHOLOGICAL', {
              walletId: pos.walletId,
              reason: psychResult.reason,
              timestamp: now,
            });
          }
        } else if (tradeOutcome.outcome === 'WIN') {
          wallet.consecutiveLosses = 0;
          wallet.consecutiveWins = (wallet.consecutiveWins || 0) + 1;

          if (wallet.consecutiveWins >= 5 && wallet.winRate > 0.6) {
            wallet.capitalState = 'AGGRESSIVE';
            console.log('[PositionManager] 🚀 5+ wins. Upgraded to AGGRESSIVE mode.');
          }
        }
      }

      // ─────────────────────────────────────────────────────────
      // STEP 6: AI SUMMARY GENERATION
      // ─────────────────────────────────────────────────────────
      try {
        await aiSummaryGenerator.generateDailySummary(pos.walletId);
        console.log('[PositionManager] 🤖 AI summary generated');
      } catch (summaryErr) {
        console.warn('[PositionManager] AI summary generation failed:', summaryErr);
      }

      // ─────────────────────────────────────────────────────────
      // STEP 7: DRAWDOWN TRACKING
      // ─────────────────────────────────────────────────────────
      if (finalPnL < 0 && wallet) {
        const portfolioValue = wallet.totalPnL + ((wallet as any).initialCapital || 0);
        drawdownTracker.updatePortfolioValue(portfolioValue);
        
        if (drawdownTracker.shouldPauseTrading()) {
          wallet.shouldTrade = false;
          wallet.capitalState = 'DRAWDOWN';
          console.warn('[PositionManager] 🛑 DRAWDOWN LIMIT HIT');
        }
      }

      // ─────────────────────────────────────────────────────────
      // STEP 8: CAPITAL STATE UPDATE
      // ─────────────────────────────────────────────────────────
      if (wallet) {
        const derivedState = capitalStateEngine.determineState(wallet);
        if (derivedState !== wallet.capitalState) {
          wallet.capitalState = derivedState;
          console.log(`[PositionManager] 🔁 Recomputed capital state: ${wallet.capitalState}`);
        }
      }

      // ─────────────────────────────────────────────────────────
      // CLEANUP
      // ─────────────────────────────────────────────────────────
      this.positions.delete(positionId);

      await eventOrchestrator.signalClosed(
        positionId,
        pos.token,
        exitPrice,
        finalPnL,
        finalPnLPercent,
        reason,
      );

      const emoji = finalPnL >= 0 ? '✅' : '❌';
      console.log(
        `[Monitor] ${emoji} Position closed: ${pos.token} | Exit: ${reason} | P&L: ${finalPnLPercent.toFixed(2)}% ($${finalPnL.toFixed(2)}) | Hold: ${holdTimeMinutes}min`
      );

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

  /**
   * PHASE 3: MONITORING LOOP
   * Evaluate jeet exits, drawdown tracking, and dead-position detection
   */
  async monitorPositions(priceUpdate: Record<string, number> = {}): Promise<void> {
    const now = Date.now();
    
    for (const [positionId, position] of this.positions) {
      try {
        // Get current price - use passed-in update or fetch from RPC
        let currentPrice = priceUpdate[position.token];
        if (!currentPrice) {
          await this.updatePositionPriceViaRPC(position, rpcOrchestrator);
          currentPrice = position.currentPrice;
        }
        
        if (!currentPrice || currentPrice <= 0) continue;
        
        // ─── UPDATE POSITION METRICS ─────────────────────────────
        position.currentPrice = currentPrice;
        position.currentValue = currentPrice * position.positionSize;
        position.pnl = (currentPrice - position.entryPrice) * position.positionSize;
        position.pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        position.currentPnL = position.pnl;
        position.currentPnLPercent = position.pnlPercent;
        position.holdTime = now - position.entryTime;
        position.lastUpdated = now;
        
        // ─── CHECK 1: TAKE PROFIT HIT ────────────────────────────
        if (currentPrice >= position.takeProfit) {
          console.log(
            `[Monitor] 💰 Take profit hit: ${position.token} @ $${currentPrice.toFixed(8)}`
          );
          await this.closePosition(positionId, currentPrice, 'take_profit_hit');
          continue;
        }
        
        // ─── CHECK 2: STOP LOSS HIT ──────────────────────────────
        if (currentPrice <= position.stopLoss) {
          console.log(
            `[Monitor] 🛑 Stop loss hit: ${position.token} @ $${currentPrice.toFixed(8)}`
          );
          await this.closePosition(positionId, currentPrice, 'stop_loss_hit');
          continue;
        }
        
        // ─── CHECK 3: TRAILING STOP HIT ──────────────────────────
        if (currentPrice <= position.trailingStop) {
          console.log(
            `[Monitor] 🛑 Trailing stop hit: ${position.token} @ $${currentPrice.toFixed(8)}`
          );
          await this.closePosition(positionId, currentPrice, 'trailing_stop_hit');
          continue;
        }
        
        // ─── CHECK 4: UPDATE TRAILING STOP ──────────────────────
        const highWaterMark = Math.max(position.entryPrice, currentPrice);
        const newTrailingStop = highWaterMark * (1 - 0.03); // 3% trailing
        
        // Only move stop UP (tighter), never down (looser)
        if (newTrailingStop > position.trailingStop) {
          position.trailingStop = newTrailingStop;
        }
        
        // ─── CHECK 5: JEET SIGNAL EVALUATION (NEW) ───────────────
        if (position.pnlPercent > 50) { // Only evaluate if already in profit
          try {
            const volumeProfile = analyzeVolumeProfile({ priceUsd: currentPrice });
            const jeetSignal = evaluateJeetSignal(
              { priceUsd: currentPrice },
              position.entryPrice,
              'JEET',
              volumeProfile
            );
            
            if (jeetSignal.shouldJeet) {
              console.log(
                `[Monitor] 🎯 Jeet signal (${jeetSignal.trigger}): ${position.token}`
              );
              console.log(`    Reason: ${jeetSignal.reason}`);
              console.log(`    Urgency: ${jeetSignal.urgency}`);
              console.log(`    Volume profile: ${volumeProfileSummary(volumeProfile)}`);
              
              await this.closePosition(
                positionId,
                currentPrice,
                `jeet_${jeetSignal.trigger}`
              );
              continue;
            }
          } catch (err) {
            console.warn(`[Monitor] Jeet evaluation error for ${position.token}:`, err);
            // Don't fail on jeet evaluation errors
          }
        }
        
        // ─── CHECK 5.5: BUY-NOW TEST (Survival Philosophy) ───────
        if (POSITION_SIZING.BUY_NOW_TEST_ENABLED) {
          try {
            const marketData = { currentPrice }; // TODO: Get full market data
            const buyNowResult = await buyNowTestEngine.evaluateBuyNowTest(position, marketData);
            
            if (!buyNowResult.shouldHold) {
              console.log(`[Monitor] 🧪 Buy-now test failed: ${position.token}`);
              console.log(`    Reason: ${buyNowResult.reason}`);
              
              if (buyNowResult.shouldReduce) {
                // Reduce position size by 50%
                const newSize = position.positionSize * 0.5;
                console.log(`[Monitor] 📉 Reducing position from $${position.positionSize} to $${newSize}`);
                
                // TODO: Implement partial position closing
                // For now, close entire position
                await this.closePosition(positionId, currentPrice, 'buy_now_test_reduce');
                continue;
              }
            }
          } catch (err) {
            console.warn(`[Monitor] Buy-now test error for ${position.token}:`, err);
          }
        }
        
        // ─── CHECK 5.6: PROFIT PROTECTION (Intelligent Scaling) ───
        if (POSITION_SIZING.PROFIT_TAKING_ENABLED && position.pnlPercent > 25) {
          try {
            const profitTakingLevels = await profitProtectionEngine.calculateProfitTakingLevels(position);
            const shouldTakeProfits = await profitProtectionEngine.shouldTakeProfits(position, currentPrice);
            
            if (shouldTakeProfits.shouldScale) {
              console.log(`[Monitor] 💰 Profit taking signal: ${position.token}`);
              console.log(`    Scaling ${shouldTakeProfits.scalePercentage}%`);
              console.log(`    Reason: ${shouldTakeProfits.reason}`);
              
              // TODO: Implement partial position scaling
              // For now, close entire position
              await this.closePosition(positionId, currentPrice, `profit_scale_${shouldTakeProfits.scalePercentage}`);
              continue;
            }
          } catch (err) {
            console.warn(`[Monitor] Profit protection error for ${position.token}:`, err);
          }
        }
        
        // ─── CHECK 6: DEAD POSITION DETECTION ────────────────────
        const elapsedMinutes = (now - position.entryTime) / 60000;
        const priceChange = Math.abs((currentPrice - position.entryPrice) / position.entryPrice);
        
        if (elapsedMinutes > 30 && priceChange < 0.01) {
          console.log(
            `[Monitor] 💤 Dead position: ${position.token} (30min, <1% change)`
          );
          await this.closePosition(positionId, currentPrice, 'dead_position');
          continue;
        }
        
        // ─── CHECK 7: EXTREME LOSS PROTECTION (PANIC STOP) ────────
        if (position.pnlPercent < -20) {
          console.warn(
            `[Monitor] 🚨 PANIC STOP: ${position.token} down ${position.pnlPercent.toFixed(1)}%`
          );
          await this.closePosition(positionId, currentPrice, 'panic_stop');
          continue;
        }
        
        // ─── UPDATE DRAWDOWN TRACKING ────────────────────────────
        const wallet = runtimeState.getWallet(position.walletId);
        if (wallet) {
          const portfolioValue = wallet.totalPnL + ((wallet as any).initialCapital || 0);
          drawdownTracker.updatePortfolioValue(portfolioValue);
        }
        
      } catch (err) {
        console.error(`[Monitor] Error monitoring ${positionId}:`, err);
        // Don't fail entire monitoring loop on single position error
      }
    }
  }

  /**
   * PHASE 3: EVALUATE POSITION HEALTH
   * Check jeet signals, drawdown, and dead position status
   */
  private async evaluatePositionHealth(position: ManagedPosition): Promise<void> {
    try {
      // Update position price via RPC orchestrator
      await this.updatePositionPriceViaRPC(position, rpcOrchestrator);

      // ─── JEET EXIT EVALUATION ───────────────────────────────────────────────

      const jeetSignal = evaluateJeetSignal(
        position.currentPrice ? { priceUsd: position.currentPrice } : null,
        position.entryPrice,
        'MARTINGALE', // default strategy
        analyzeVolumeProfile(position.currentPrice ? { priceUsd: position.currentPrice } : null)
      );

      if (jeetSignal.shouldJeet) {
        console.log(`[PositionManager] 🚨 JEET signal for ${position.token}: ${jeetSignal.reason}`);

        // Execute jeet exit with high slippage
        await this.closePosition(position.id, position.currentPrice, `jeet_${jeetSignal.trigger.toLowerCase()}`);
        return;
      }

      // ─── DRAWDOWN TRACKING ─────────────────────────────────────────────────

      // Update individual position drawdown
      const positionDrawdown = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
      if (positionDrawdown < -25) { // 25% individual position drawdown
        console.log(`[PositionManager] 📉 Position drawdown alert: ${position.token} -${positionDrawdown.toFixed(2)}%`);

        // Could scale down or close position
        if (positionDrawdown < -40) {
          await this.closePosition(position.id, position.currentPrice, 'position_drawdown_cutoff');
          return;
        }
      }

      // ─── DEAD POSITION DETECTION ───────────────────────────────────────────

      const isDeadPosition = this.detectDeadPosition(position);
      if (isDeadPosition) {
        console.log(`[PositionManager] 💀 Dead position detected: ${position.token}`);
        await this.closePosition(position.id, position.currentPrice, 'dead_position');
        return;
      }

    } catch (error) {
      console.error(`[PositionManager] Error evaluating ${position.token}:`, error);
    }
  }

  /**
   * PHASE 3: DETECT DEAD POSITION
   * Check if position is stuck with no movement or volume
   */
  private detectDeadPosition(position: ManagedPosition): boolean {
    const holdTimeHours = position.holdTime / (1000 * 60 * 60);
    // Note: priceChange24h and volume24h not available from RPC orchestrator yet
    // For now, use simplified criteria

    // Dead position criteria:
    // 1. Held for more than 48 hours
    // 2. Position is underwater by more than 10%

    const isStuck = holdTimeHours > 48 && position.pnlPercent < -10;

    return isStuck;
  }

  /**
   * PHASE 3: GET MARKET DATA
   * Fetch current market data for a token
   */
  private async getMarketData(token: string): Promise<any> {
    try {
      // Use RPC orchestrator for market data
      const marketData = await rpcOrchestrator.getMarketData(token);
      return marketData;
    } catch (error) {
      console.error(`[PositionManager] Error getting market data for ${token}:`, error);
      return null;
    }
  }

  /**
   * UPDATE POSITION PRICE VIA RPC
   * Updates position price using RPC orchestrator market data
   */
  private async updatePositionPriceViaRPC(
    position: ManagedPosition,
    rpcOrch: any // RpcOrchestrator
  ): Promise<number | null> {
    try {
      // Get market data from RPC orchestrator
      const marketData = await rpcOrch.getMarketData(position.token);
      
      if (!marketData) {
        console.warn(`[Monitor] Could not get market data for ${position.token}`);
        return null;
      }
      
      const currentPrice = parseFloat(marketData.priceUsd || '0');
      
      if (currentPrice <= 0) {
        console.warn(`[Monitor] Invalid price for ${position.token}`);
        return null;
      }
      
      // Update position with current price
      position.currentPrice = currentPrice;
      position.currentPnL = (currentPrice - position.entryPrice) * position.positionSize;
      position.currentPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      position.lastUpdated = Date.now();
      
      return currentPrice;
    } catch (err) {
      console.error('[Monitor] Price fetch error:', err);
      return null;
    }
  }

  /**
   * HELPER: Convert conviction to entry mode label
   */
  private getConvictionMode(conviction: number): 'AGGRESSIVE' | 'CAUTIOUS' | 'DEFENSIVE' | 'OBSERVATION' | 'INACTIVE' {
    if (conviction >= 85) return 'AGGRESSIVE';
    if (conviction >= 70) return 'CAUTIOUS';
    if (conviction >= 50) return 'OBSERVATION';
    if (conviction >= 30) return 'DEFENSIVE';
    return 'INACTIVE';
  }
}

export const positionManager = new PositionManager();

/**
 * GET RPC METRICS
 * Returns RPC orchestrator and connection health metrics
 */
function getRPCMetrics(): any {
  return {
    rpcHealth: rpcOrchestrator.getMetrics(),
    connectionHealth: solanaConnection.getHealthReport(),
    rpcStatus: rpcOrchestrator.getStatus(),
  };
}