/**
 * EXECUTION ENGINE
 * Takes routing decisions and executes trades
 * Manages position lifecycle: entry → monitoring → exit
 */

import { supabase } from '../../core/db/supabase';
import { runtimeState } from '../../core/state/runtime-state';
import { walletManager } from '../wallet/wallet-manager';
import { outcomeLogger, TradeOutcome } from '../learning/outcome-logger';
import { capitalStateEngine } from '../../core/capital-state-engine';
import { concentratedConvictionEngine } from './concentrated-conviction-engine';
import { buyNowTestEngine } from './buy-now-test-engine';
import { emit } from '../events/event-bus';
import { drawdownTracker } from '../risk/drawdown-tracker';
import { portfolioCorrelationEngine } from '../risk/portfolio-correlation-engine';
import { rpcOrchestrator } from '../rpc/rpc-orchestrator';
import { solanaConnection } from '../rpc/solana-connection';
import * as jupiter from './jupiter';
import { EXECUTION } from '../../core/config';
import { usdToSol, solToLamports } from './parity';
import { v4 as uuidv4 } from 'uuid';
import { positionManager } from './position-manager';

export interface ActivePosition {
  id: string;
  walletId: string;
  token: string;
  entryPrice: number;
  entryTime: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  takeProfit: number;
  conviction: number;
  status: 'OPEN' | 'MONITORING' | 'AT_STOP' | 'AT_TP' | 'CLOSING';
  currentPrice?: number;
  currentPnL?: number;
  currentPnLPercent?: number;
  txSignature?: string;
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
  maxPositionSize: 2000,
  minStopDistance: 0.02,
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
   * VALIDATE LIQUIDITY
   * Uses RPC orchestrator to check if token has sufficient liquidity
   */
  private async validateLiquidity(token: string): Promise<{ valid: boolean; reason: string }> {
    try {
      const marketData = await rpcOrchestrator.getMarketData(token);

      if (!marketData) {
        return { valid: false, reason: 'Could not fetch market data' };
      }

      const liquidity = marketData.liquidity?.usd || 0;

      // Minimum liquidity: $50k
      if (liquidity < 50000) {
        return {
          valid: false,
          reason: `Liquidity too low: $${liquidity.toFixed(0)} < $50k minimum`,
        };
      }

      return { valid: true, reason: 'OK' };
    } catch (err) {
      console.error('[Execution] Liquidity check error:', err);
      return { valid: false, reason: 'Liquidity check failed' };
    }
  }

  /**
   * ENRICH TOKEN BEFORE TRADE
   * Uses RPC orchestrator for enrichment at high conviction
   */
  private async enrichTokenBeforeTrade(token: string, conviction: number): Promise<any | null> {
    try {
      if (conviction < 70) {
        return null;
      }

      const enrichment = await rpcOrchestrator.enrichToken(token, conviction);

      if (!enrichment) {
        return null;
      }

      console.log(`[Execution] Token enriched: ${token.slice(0, 8)}...`);
      return enrichment;
    } catch (err) {
      console.error('[Execution] Enrichment error:', err);
      return null;
    }
  }

  /**
   * CHECK TOKEN MIGRATION
   * Checks if token migrated (e.g., Pump.fun → Raydium)
   */
  private async checkTokenMigration(token: string): Promise<{ migrated: boolean; poolInfo?: any }> {
    try {
      const migration = await rpcOrchestrator.checkMigration(token);

      if (migration.hasMigrated) {
        console.log(`[Execution] Token migrated to Raydium: ${token.slice(0, 8)}...`);
        return { migrated: true, poolInfo: migration.poolInfo };
      }

      return { migrated: false };
    } catch (err) {
      console.error('[Execution] Migration check error:', err);
      return { migrated: false };
    }
  }

  /**
   * WAIT FOR FINALIZED CONFIRMATION
   * Waits for transaction to be finalized on blockchain
   */
  private async waitForFinalizedConfirmation(signature: string, timeoutMs: number = 60000): Promise<void> {
    const connection = solanaConnection.getBestConnection();
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });

        if (status.value?.confirmationStatus === 'finalized') {
          console.log(`[Execution] ✅ Transaction finalized: ${signature.slice(0, 20)}...`);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      } catch (err) {
        console.error('[Execution] Confirmation check error:', err);
        throw err;
      }
    }

    throw new Error(`Transaction confirmation timeout after ${timeoutMs}ms`);
  }

  /**
   * EXECUTE TRADE - FULL BLOCKCHAIN INTEGRATION
   * 
   * Flow:
   * 1. Get wallet with keypair
   * 2. Calculate trade amount
   * 3. Get Jupiter quote
   * 4. Build & sign transaction
   * 5. Broadcast via RPC
   * 6. Wait for finalized confirmation
   * 7. Create position record
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
    const tradeStartTime = Date.now();
    
    try {
      console.log(`[Execution] 🚀 Starting trade: ${token.slice(0, 8)}...`);
      
      // ─────────────────────────────────────────────────────────────
      // PRE-TRADE CHECKS WITH RPC ORCHESTRATION
      // ─────────────────────────────────────────────────────────────
      
      // Check liquidity
      const liquidityCheck = await this.validateLiquidity(token);
      if (!liquidityCheck.valid) {
        console.warn(`[Execution] ❌ Liquidity check failed: ${liquidityCheck.reason}`);
        return null;
      }
      
      // Check migration status (if applicable)
      const migration = await this.checkTokenMigration(token);
      if (!migration.migrated && conviction < 60) {
        console.warn('[Execution] ⚠️ Token not migrated and conviction low, proceeding with caution');
      }
      
      // Enrich token data
      const enrichment = await this.enrichTokenBeforeTrade(token, conviction);
      if (enrichment) {
        console.log(`[Execution] 📊 Token enriched with ${Object.keys(enrichment).length} features`);
      }
      
      // ─────────────────────────────────────────────────────────────
      // GET WALLET
      // ─────────────────────────────────────────────────────────────
      
      const wallet = await walletManager.getWallet(walletId);
      if (!wallet) {
        console.error('[Execution] ❌ Wallet not found');
        return null;
      }
      
      const runtimeWallet = runtimeState.getWallet(walletId);
      const walletCapitalState = runtimeWallet
        ? capitalStateEngine.determineState(runtimeWallet)
        : 'MEDIUM';
      const sizingRules = capitalStateEngine.getSizingRules(walletCapitalState);

      if (runtimeWallet && runtimeWallet.shouldTrade === false) {
        console.warn('[Execution] ⚠️ Trading is currently paused for this wallet by survival rules');
        return null;
      }

      if (!sizingRules.allowNewEntries) {
        console.warn(`[Execution] ⚠️ New entries blocked by ${walletCapitalState} capital state`);
        return null;
      }

      if (runtimeWallet) {
        runtimeWallet.capitalState = walletCapitalState;
        runtimeState.setWallet(runtimeWallet);
      }

      const walletBalance = runtimeWallet?.balance ?? (wallet as any).balance ?? 0;
      if (walletBalance > 0) {
        const maxAllowedUsd = walletBalance * (sizingRules.maxPositionSize / 100);
        if (positionSize > maxAllowedUsd) {
          console.log(`[Execution] 🔧 Reducing position size from ${positionSize} to ${maxAllowedUsd.toFixed(2)} based on ${walletCapitalState} sizing rules`);
          positionSize = maxAllowedUsd;
        }
      }

      if (leverage > sizingRules.maxLeverage) {
        console.log(`[Execution] 🔧 Reducing leverage from ${leverage} to ${sizingRules.maxLeverage} based on ${walletCapitalState}`);
        leverage = sizingRules.maxLeverage;
      }

      if (runtimeWallet) {
        const concentrationCheck = await concentratedConvictionEngine.evaluateTradeConcentration(runtimeWallet, {
          token,
          entryPrice,
          stopLoss,
          takeProfit,
          conviction,
        });

        if (!concentrationCheck.proceed) {
          console.warn(`[Execution] ❌ Trade blocked by concentrated conviction: ${concentrationCheck.reason}`);
          return null;
        }
      }

      const keypair = await walletManager.getWalletKeypair(walletId);
      if (!keypair) {
        console.error('[Execution] ❌ Cannot decrypt keypair');
        return null;
      }

      // ─────────────────────────────────────────────────────────────
      // CALCULATE AMOUNT
      // ─────────────────────────────────────────────────────────────
      
      const amountUSD = positionSize * leverage;
      const solAmount = await usdToSol(amountUSD);
      const lamports = Number(await solToLamports(solAmount));
      
      // ─────────────────────────────────────────────────────────────
      // GET JUPITER QUOTE
      // ─────────────────────────────────────────────────────────────
      
      const slippageBps = this.getSlippageFromConviction(conviction);
      console.log(`[Execution] 🎯 Getting quote from Jupiter`);
      
      const quoteResult = await jupiter.getQuote(token, lamports, slippageBps);
      if (!quoteResult.success || !quoteResult.quote) {
        console.error('[Execution] ❌ Quote failed:', quoteResult.error);
        return null;
      }

      if (quoteResult.quote.price) {
        const marketCheck = await buyNowTestEngine.evaluateBuyNowTest(
          { walletId, token, conviction, takeProfit, stopLoss, positionSize, leverage } as any,
          { currentPrice: quoteResult.quote.price }
        );

        if (!marketCheck.shouldHold) {
          console.warn(`[Execution] ❌ Buy-now test failed: ${marketCheck.reason}`);
          return null;
        }
      }
      
      // ─────────────────────────────────────────────────────────────
      // BUILD & SIGN TRANSACTION
      // ─────────────────────────────────────────────────────────────
      
      console.log(`[Execution] 🏗️ Building swap transaction`);
      const txResult = await jupiter.buildSwap(quoteResult.quote, keypair);
      
      if (!txResult.success || !txResult.tx) {
        console.error('[Execution] ❌ Transaction build failed');
        return null;
      }
      
      // ─────────────────────────────────────────────────────────────
      // BROADCAST VIA RPC ORCHESTRATOR
      // ─────────────────────────────────────────────────────────────
      
      console.log(`[Execution] 📡 Broadcasting transaction via RPC orchestrator`);
      
      // Get best RPC connection
      const connection = solanaConnection.getBestConnection();
      const broadcastStartTime = Date.now();
      
      let signature: string;
      try {
        signature = await connection.sendRawTransaction(txResult.tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        
        const broadcastLatency = Date.now() - broadcastStartTime;
        
        // Record metrics for RPC orchestrator
        // (helps it track which RPC is healthiest)
        console.log(`[Execution] ✅ Broadcast success: ${signature.slice(0, 20)}... (${broadcastLatency}ms)`);
      } catch (err: any) {
        console.error('[Execution] ❌ Broadcast failed:', err.message);
        return null;
      }
      
      // ─────────────────────────────────────────────────────────────
      // WAIT FOR FINALIZED CONFIRMATION
      // ─────────────────────────────────────────────────────────────
      
      console.log(`[Execution] ⏳ Waiting for finalized confirmation`);
      
      try {
        await this.waitForFinalizedConfirmation(signature, 60000);
      } catch (err: any) {
        console.error('[Execution] ❌ Confirmation timeout:', err.message);
        return null;
      }
      
      // ─────────────────────────────────────────────────────────────
      // CREATE POSITION
      // ─────────────────────────────────────────────────────────────
      
      const position: ActivePosition = {
        id: `pos-${walletId}-${token}-${Date.now()}`,
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
        txSignature: signature,
        signals,
        currentPrice: entryPrice,
        currentPnL: 0,
        currentPnLPercent: 0,
      };
      
      // Store position
      await positionManager.createPosition(walletId, token, entryPrice, positionSize, leverage, conviction, stopLoss, takeProfit, signals);
      runtimeState.addTrade({
        id: position.id,
        walletId,
        token,
        entryPrice,
        entryTime: Date.now(),
        positionSize,
        leverage,
        conviction,
        status: 'OPEN',
        currentPrice: entryPrice,
        currentPnL: 0,
        signals,
      });
      
      const executionTime = Date.now() - tradeStartTime;
      console.log(`[Execution] ✅ TRADE COMPLETE in ${executionTime}ms`);
      
      return position;
      
    } catch (err: any) {
      console.error('[Execution] ❌ FATAL ERROR:', err.message);
      return null;
    }
  }

  /**
   * CLOSE POSITION
   */
  async closePosition(positionId: string, exitPrice: number, reason: string): Promise<void> {
    try {
      const position = this.openPositions.get(positionId);
      if (!position) return;

      const pnl = (exitPrice - position.entryPrice) * position.positionSize;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
      const holdTime = Math.floor((Date.now() - position.entryTime) / 1000);

      await supabase.from('active_positions').update({
        status: 'CLOSED',
        exit_price: exitPrice,
        exit_reason: reason,
        pnl,
        pnl_percent: pnlPercent,
        hold_time: holdTime,
        closed_at: new Date().toISOString(),
      }).eq('id', positionId);

      const outcome: TradeOutcome = {
        id: uuidv4(),
        walletId: position.walletId,
        token: position.token,
        entryPrice: position.entryPrice,
        entryConviction: position.conviction,
        entryMode: 'AGGRESSIVE' as const,
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
        expectedValue: (position.takeProfit - position.entryPrice) * 0.5,
        falseLiquiditySignal: reason.includes('liquidity'),
        fakeSocialSignal: reason.includes('social'),
        whaleExitDetected: reason.includes('whale'),
        manipulationDetected: reason.includes('pump'),
        timestamp: position.entryTime,
        completedAt: Date.now(),
        outcome: 'WIN' as const,
      };

      await outcomeLogger.logOutcome(outcome);

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

      this.openPositions.delete(positionId);
    } catch (error) {
      console.error('[Execution] Failed to close position:', error);
    }
  }

  /**
   * UPDATE POSITION PRICE
   */
  updatePositionPrice(positionId: string, currentPrice: number): void {
    const position = this.openPositions.get(positionId);
    if (!position) return;

    position.currentPrice = currentPrice;
    position.currentPnL = (currentPrice - position.entryPrice) * position.positionSize;
    position.currentPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  }

  /**
   * GET OPEN POSITIONS
   */
  getOpenPositions(): ActivePosition[] {
    return Array.from(this.openPositions.values());
  }

  /**
   * GET POSITION
   */
  getPosition(positionId: string): ActivePosition | undefined {
    return this.openPositions.get(positionId);
  }

  /**
   * GET SLIPPAGE FROM CONVICTION
   * Higher conviction = tighter slippage (less slippage needed)
   * Lower conviction = loose slippage (need more buffer)
   */
  private getSlippageFromConviction(conviction: number): number {
    if (conviction >= 85) return 200; // 2%
    if (conviction >= 75) return 300; // 3%
    if (conviction >= 65) return 500; // 5%
    if (conviction >= 50) return 750; // 7.5%
    if (conviction >= 40) return 1000; // 10%
    if (conviction >= 30) return 1500; // 15%
    return 2000; // 20%
  }

  /**
   * VALIDATE EXECUTION - ENHANCED
   * Check risk limits before trading
   */
  private async validateExecution(
    walletId: string,
    positionSize: number,
    leverage: number,
    tokenAddress?: string,
    narrative?: string
  ): Promise<{ valid: boolean; reason: string }> {
    
    // ─── CHECK 1: Max open positions ─────────────────────────────
    const openCount = Array.from(this.openPositions.values())
      .filter((p) => p.walletId === walletId).length;
    
    if (openCount >= this.config.maxOpenPositions) {
      return {
        valid: false,
        reason: `Max open positions (${this.config.maxOpenPositions}) reached`,
      };
    }
    
    // ─── CHECK 2: Position size ─────────────────────────────────
    if (positionSize > this.config.maxPositionSize) {
      return {
        valid: false,
        reason: `Position size $${positionSize} exceeds max $${this.config.maxPositionSize}`,
      };
    }
    
    if (positionSize < 10) {
      return {
        valid: false,
        reason: 'Position size too small (minimum $10)',
      };
    }
    
    // ─── CHECK 3: Leverage ──────────────────────────────────────
    if (leverage > this.config.maxLeverage) {
      return {
        valid: false,
        reason: `Leverage ${leverage}x exceeds max ${this.config.maxLeverage}x`,
      };
    }
    
    if (leverage < 1) {
      return {
        valid: false,
        reason: 'Leverage must be at least 1x',
      };
    }
    
    // ─── CHECK 4: Wallet balance ────────────────────────────────
    const wallet = await walletManager.getWallet(walletId);
    if (!wallet) {
      return { valid: false, reason: 'Wallet not found' };
    }
    
    if ((wallet as any).balance < positionSize) {
      return {
        valid: false,
        reason: `Insufficient balance: $${(wallet as any).balance} < $${positionSize}`,
      };
    }
    
    // ─── CHECK 5: Portfolio exposure ────────────────────────────
    const currentExposure = Array.from(this.openPositions.values())
      .filter((p) => p.walletId === walletId)
      .reduce((sum, p) => sum + (p.positionSize * p.leverage), 0);
    
    const maxExposure = ((wallet as any).balance || 1000) * 0.8; // Max 80% of wallet
    if (currentExposure + (positionSize * leverage) > maxExposure) {
      return {
        valid: false,
        reason: `Portfolio exposure would exceed 80% limit`,
      };
    }
    
    // ─── CHECK 6: CORRELATION RISK ──────────────────────────────
    if (tokenAddress && narrative) {
      const correlation = portfolioCorrelationEngine.analyzePortfolioCorrelation();
      
      // Check if portfolio is already too correlated
      if (correlation.portfolioRisk === 'HIGHLY_CORRELATED') {
        return {
          valid: false,
          reason: `Portfolio already highly correlated. ${correlation.recommendation}`,
        };
      }
      
      // Check if we can safely add this position
      if (!portfolioCorrelationEngine.canAddPosition(tokenAddress, narrative)) {
        const suggestion = portfolioCorrelationEngine.suggestCorrelationReduction();
        return {
          valid: false,
          reason: `Adding ${narrative} would increase correlation. Consider closing ${suggestion} first.`,
        };
      }
    }
    
    // ─── CHECK 7: DRAWDOWN CIRCUIT BREAKER ───────────────────────
    if (drawdownTracker.shouldPauseTrading()) {
      const metrics = drawdownTracker.getCurrentMetrics();
      return {
        valid: false,
        reason: `Trading paused: Drawdown ${metrics.currentDrawdown.toFixed(1)}% exceeds ${metrics.maximumRiskPercent}% limit`,
      };
    }
    
    return { valid: true, reason: 'OK' };
  }

  /**
   * EXECUTE TRADE WITH VALIDATION
   * Call this instead of direct executeTrade()
   */
  async executeTradeWithValidation(
    token: string,
    entryPrice: number,
    conviction: number,
    positionSize: number,
    leverage: number,
    stopLoss: number,
    takeProfit: number,
    walletId: string,
    signals: string[],
    narrative?: string
  ): Promise<ActivePosition | null> {
    
    // Run all validations
    const validation = await this.validateExecution(
      walletId,
      positionSize,
      leverage,
      token, // tokenAddress
      narrative
    );
    
    if (!validation.valid) {
      console.log(`[Execution] ❌ Trade blocked: ${validation.reason}`);
      return null;
    }
    
    // Validations passed, execute
    return this.executeTrade(
      token,
      entryPrice,
      conviction,
      positionSize,
      leverage,
      stopLoss,
      takeProfit,
      walletId,
      signals
    );
  }

  /**
   * CHECK CORRELATION BEFORE ENTRY
   * Returns detailed correlation analysis
   */
  checkCorrelationRisk(
    tokenAddress: string,
    narrative: string
  ): {
    canEnter: boolean;
    currentRisk: 'DIVERSIFIED' | 'CORRELATED' | 'HIGHLY_CORRELATED';
    reason: string;
    highRiskPairs: number;
    recommendation?: string;
  } {
    const correlation = portfolioCorrelationEngine.analyzePortfolioCorrelation();
    
    return {
      canEnter: portfolioCorrelationEngine.canAddPosition(tokenAddress, narrative),
      currentRisk: correlation.portfolioRisk,
      reason: correlation.recommendation,
      highRiskPairs: correlation.correlations.filter((c: any) => c.risk === 'HIGH').length,
      recommendation: portfolioCorrelationEngine.suggestCorrelationReduction() || undefined,
    };
  }

  /**
   * CHECK DRAWDOWN STATUS
   * Returns drawdown metrics
   */
  checkDrawdownStatus(): {
    shouldPause: boolean;
    currentDrawdown: number;
    maxAllowed: number;
    lastDrawdownEvent?: {
      severity: string;
      timestamp: number;
      recoveryDays?: number;
    };
  } {
    const metrics = drawdownTracker.getCurrentMetrics();
    const worst = drawdownTracker.getWorstDrawdown();
    
    return {
      shouldPause: drawdownTracker.shouldPauseTrading(),
      currentDrawdown: metrics.currentDrawdown,
      maxAllowed: metrics.maximumRiskPercent,
      lastDrawdownEvent: worst ? {
        severity: worst.severity || 'unknown',
        timestamp: worst.timestamp,
        recoveryDays: worst.recoveryDays,
      } : undefined,
    };
  }

  /**
   * GET PRE-EXECUTION REPORT
   * Full assessment before executing trade
   */
  getPreExecutionReport(
    walletId: string,
    tokenAddress: string,
    positionSize: number,
    leverage: number,
    narrative: string
  ): {
    canExecute: boolean;
    blockers: string[];
    warnings: string[];
    correlationAnalysis: any;
    drawdownAnalysis: any;
    exposureAnalysis: {
      currentExposure: number;
      maxAllowed: number;
      projectedExposure: number;
      utilizationPercent: number;
    };
  } {
    const blockers: string[] = [];
    const warnings: string[] = [];
    
    // Check correlation
    const corrAnalysis = this.checkCorrelationRisk(tokenAddress, narrative);
    if (!corrAnalysis.canEnter) {
      blockers.push(corrAnalysis.reason);
    } else if (corrAnalysis.currentRisk === 'CORRELATED') {
      warnings.push(`Portfolio correlation increasing: ${corrAnalysis.highRiskPairs} high-risk pairs`);
    }
    
    // Check drawdown
    const ddAnalysis = this.checkDrawdownStatus();
    if (ddAnalysis.shouldPause) {
      blockers.push(`Drawdown ${ddAnalysis.currentDrawdown.toFixed(1)}% > ${ddAnalysis.maxAllowed}%`);
    }
    
    // Check exposure
    const exposureAnalysis = this.calculateExposureAnalysis(walletId, positionSize, leverage);
    if (exposureAnalysis.utilizationPercent > 75) {
      warnings.push(`High portfolio utilization: ${exposureAnalysis.utilizationPercent.toFixed(0)}%`);
    }
    if (exposureAnalysis.utilizationPercent > 90) {
      blockers.push('Portfolio nearly fully exposed');
    }
    
    return {
      canExecute: blockers.length === 0,
      blockers,
      warnings,
      correlationAnalysis: corrAnalysis,
      drawdownAnalysis: ddAnalysis,
      exposureAnalysis,
    };
  }

  /**
   * CALCULATE EXPOSURE ANALYSIS
   * Helper for exposure metrics
   */
  private calculateExposureAnalysis(
    walletId: string,
    newPositionSize: number,
    leverage: number
  ): {
    currentExposure: number;
    maxAllowed: number;
    projectedExposure: number;
    utilizationPercent: number;
  } {
    let currentExposure = 0;
    for (const pos of this.openPositions.values()) {
      if (pos.walletId === walletId) {
        currentExposure += pos.positionSize * pos.leverage;
      }
    }
    
    const maxExposure = 80; // 80% of wallet
    const projectedExposure = currentExposure + (newPositionSize * leverage);
    
    return {
      currentExposure,
      maxAllowed: maxExposure,
      projectedExposure,
      utilizationPercent: (projectedExposure / maxExposure) * 100,
    };
  }

  /**
   * GET CONVICTION MODE
   */
  private getConvictionMode(conviction: number): string {
    if (conviction >= 85) return 'VERY_HIGH';
    if (conviction >= 70) return 'HIGH';
    if (conviction >= 50) return 'MEDIUM';
    if (conviction >= 30) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * SLEEP UTILITY
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const executionEngine = new ExecutionEngine();
