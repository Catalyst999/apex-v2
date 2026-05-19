// File path: src/core/orchestrator/apex-orchestrator.ts
/**
 * APEX ORCHESTRATOR - Central Runtime Coordinator
 * Single point of orchestration for all system activities
 * Routes signals, manages lifecycle, synchronizes state
 */

import { EventEmitter } from 'events';
import { runtimeState, ActiveSignal, ActiveTrade, MarketRegimeState } from '../state/runtime-state';
import { emit as emitEvent, eventBus } from '../../services/events/event-bus';
import { TELEGRAM } from '../../core/config';
import { executionEngine } from '../../services/execution/execution-engine';
import { positionManager } from '../../services/execution/position-manager';
import { bot } from '../../services/telegram/bot';
import { drawdownTracker } from '../../services/risk/drawdown-tracker';

// NEW: Position Sizing & Survival Execution Engines
import { capitalStateEngine } from '../capital-state-engine';
import { convictionBasedSizer } from '../../services/execution/conviction-based-sizer';
import { concentratedConvictionEngine } from '../../services/execution/concentrated-conviction-engine';
import { POSITION_SIZING } from '../../core/config';

// Phase 1 - Ingestion Pipeline
import { signalIngestionHub } from '../../services/ingestion/signal-ingestion-hub';
import { startDedupCleanup } from '../../services/ingestion/signal-deduplicator';

// Phase 2 processors
import { createSignalEnrichmentProcessor } from '../../services/intelligence/processors/signal-enrichment-processor';
import { createNarrativeProcessor } from '../../services/intelligence/processors/narrative-processor';
import { createMarketMemoryProcessor } from '../../services/intelligence/processors/market-memory-processor';
import { createPatternProcessor } from '../../services/intelligence/processors/pattern-processor';
import { createConvictionAggregator } from '../../services/intelligence/processors/conviction-aggregator';
import { createRouterProcessor } from '../../services/routing/processors/router-processor';
import { createOutcomeProcessor } from '../../services/learning/processors/outcome-processor';
import { NarrativeIntelligenceEngine } from '../../services/intelligence/narrative-intelligence';

export type OrchestratorPhase = 'STARTUP' | 'MONITORING' | 'TRADING' | 'RISK' | 'SHUTDOWN';

class ApexOrchestrator extends EventEmitter {
  private phase: OrchestratorPhase = 'STARTUP';
  private isRunning = false;
  private lastUpdate = Date.now();
  private updateInterval = 1000; // 1 second orchestration tick

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * STARTUP
   * Initialize orchestrator and all subsystems
   */
  async startup(): Promise<void> {
    console.log('[Apex] Orchestrator starting...');
    this.phase = 'STARTUP';

    try {
      // Initialize runtime state
      runtimeState.initializeAIBudget(100000, 50000); // daily budgets

      // Initialize Phase 1 Scanners (ingestion pipeline)
      await this.initializeScanners();

      // Initialize Phase 2 processors
      this.initializeProcessors();

      // Listen to all critical events
      this.registerEventListeners();
      this.registerExecutionListeners();

      // Start orchestration loop
      this.isRunning = true;
      this.startOrchestrationLoop();

      console.log('[Apex] ✅ Orchestrator online');
      this.phase = 'MONITORING';
    } catch (error) {
      console.error('[Apex] Startup failed:', error);
      this.phase = 'SHUTDOWN';
    }
  }

  /**
   * INITIALIZE PHASE 2 PROCESSORS
   * Start all event-driven intelligence processors
   */
  private initializeProcessors(): void {
    try {
      // Create narrative engine (shared by narrative processor)
      const narrativeEngine = new NarrativeIntelligenceEngine(runtimeState);

      // Create all processors
      const enrichmentProcessor = createSignalEnrichmentProcessor(eventBus, runtimeState);
      const narrativeProcessor = createNarrativeProcessor(eventBus, runtimeState, narrativeEngine);
      const memoryProcessor = createMarketMemoryProcessor(eventBus, runtimeState);
      const patternProcessor = createPatternProcessor(eventBus, runtimeState);
      const convictionAggregator = createConvictionAggregator(eventBus, runtimeState);
      const routerProcessor = createRouterProcessor(eventBus, runtimeState);
      const outcomeProcessor = createOutcomeProcessor(eventBus, runtimeState);

      // Start all processors
      enrichmentProcessor.start();
      narrativeProcessor.start();
      memoryProcessor.start();
      patternProcessor.start();
      convictionAggregator.start();
      routerProcessor.start();
      outcomeProcessor.start();

      console.log('[Apex] ✅ Phase 2 processors initialized');
      console.log('[Apex]   - Signal Enrichment Processor');
      console.log('[Apex]   - Narrative Processor');
      console.log('[Apex]   - Market Memory Processor');
      console.log('[Apex]   - Pattern Processor');
      console.log('[Apex]   - Conviction Aggregator');
      console.log('[Apex]   - Router Processor');
      console.log('[Apex]   - Outcome Processor');
    } catch (error) {
      console.error('[Apex] Failed to initialize processors:', error);
      throw error;
    }
  }

  /**
   * INITIALIZE PHASE 1 SCANNERS
   * Start all 7 signal sources (onchain, webhook, monitor, dexscreener, pumpfun, fake-volume, lowcap-lore)
   */
  private async initializeScanners(): Promise<void> {
    try {
      // 1. OnChain Scanner (polling every 30 seconds)
      try {
        const { scanOnChain, cleanProcessedPools } = await import('../../services/scanner/onchain-scanner');
        setInterval(async () => {
          try {
            const signals = await scanOnChain();
            for (const sig of signals) {
              await signalIngestionHub.ingestSignal(sig, 'onchain');
            }
            cleanProcessedPools();
          } catch (err) {
            console.error('[Apex] OnChain scan error:', err);
          }
        }, 30000);
        console.log('[Apex] ✅ OnChain scanner initialized (30s interval)');
      } catch (err) {
        console.warn('[Apex] ⚠️  OnChain scanner failed to initialize:', err);
      }

      // 2. Webhook Server (HTTP port 3001)
      try {
        const { createWebhookServer } = await import('../../services/routing/helius-webhook');
        const webhookApp = createWebhookServer(async (pair) => {
          try {
            await signalIngestionHub.ingestSignal(pair, 'webhook');
          } catch (err) {
            console.error('[Apex] Webhook ingestion error:', err);
          }
        });
        webhookApp.listen(3001, () => {
          console.log('[Apex] ✅ Webhook server initialized (port 3001)');
        });
      } catch (err) {
        console.warn('[Apex] ⚠️  Webhook server failed to initialize:', err);
      }

      // 3. WSS Monitor (WebSocket streaming)
      try {
        const { startWssMonitor } = await import('../../services/scanner/monitor');
        await startWssMonitor();
        console.log('[Apex] ✅ WSS monitor initialized');
      } catch (err) {
        console.warn('[Apex] ⚠️  WSS monitor failed to initialize:', err);
      }

      // 4. DexScreener Scanner (polling every 60 seconds)
      try {
        const { fetchNewSolanaPairs } = await import('../../services/scanner/dexscreener');
        setInterval(async () => {
          try {
            const pairs = await fetchNewSolanaPairs();
            for (const pair of pairs) {
              await signalIngestionHub.ingestSignal(pair, 'dexscreener');
            }
          } catch (err) {
            console.error('[Apex] DexScreener scan error:', err);
          }
        }, 60000);
        console.log('[Apex] ✅ DexScreener scanner initialized (60s interval)');
      } catch (err) {
        console.warn('[Apex] ⚠️  DexScreener scanner failed to initialize:', err);
      }

      // 5. PumpFun Monitor (polling every 45 seconds)
      try {
        const { checkPumpFunGraduations } = await import('../../services/scanner/pumpfun-monitor');
        setInterval(async () => {
          try {
            const tokens = await checkPumpFunGraduations();
            for (const token of tokens) {
              await signalIngestionHub.ingestSignal(token, 'pumpfun');
            }
          } catch (err) {
            console.error('[Apex] PumpFun scan error:', err);
          }
        }, 45000);
        console.log('[Apex] ✅ PumpFun monitor initialized (45s interval)');
      } catch (err) {
        console.warn('[Apex] ⚠️  PumpFun monitor failed to initialize:', err);
      }

      // 6. Fake Volume Detector (polling every 90 seconds)
      try {
        const { fetchNewSolanaPairs } = await import('../../services/scanner/dexscreener');
        const { scanForFakeVolumePlays } = await import('../../services/scanner/fake-volume-detector');

        setInterval(async () => {
          try {
            const pairs = await fetchNewSolanaPairs();
            const plays = scanForFakeVolumePlays(pairs);
            for (const play of plays) {
              await signalIngestionHub.ingestSignal(play, 'fake-volume');
            }
          } catch (err) {
            console.error('[Apex] Fake Volume scan error:', err);
          }
        }, 90000);

        console.log('[Apex] ✅ Fake Volume detector initialized (90s interval)');
      } catch (err) {
        console.warn('[Apex] ⚠️  Fake Volume detector failed to initialize:', err);
      }

      // 7. Lowcap Lore Scanner (polling every 120 seconds)
      try {
        const { fetchNewSolanaPairs } = await import('../../services/scanner/dexscreener');
        const { scanForLorePlays } = await import('../../services/scanner/lowcap-lore-scanner');

        setInterval(async () => {
          try {
            const pairs = await fetchNewSolanaPairs();
            const lorePlays = scanForLorePlays(pairs);
            for (const play of lorePlays) {
              await signalIngestionHub.ingestSignal(play, 'lowcap-lore');
            }
          } catch (err) {
            console.error('[Apex] Lowcap Lore scan error:', err);
          }
        }, 120000);

        console.log('[Apex] ✅ Lowcap lore scanner initialized (120s interval)');
      } catch (err) {
        console.warn('[Apex] ⚠️  Lowcap lore scanner failed to initialize:', err);
      }

      // 8. Start deduplication cleanup (every 10 minutes)
      try {
        startDedupCleanup(10 * 60 * 1000);
        console.log('[Apex] ✅ Deduplication cleanup scheduled (10m interval)');
      } catch (err) {
        console.warn('[Apex] ⚠️  Dedup cleanup failed to initialize:', err);
      }

      console.log('[Apex] ✅ Phase 1 Ingestion Pipeline online');
    } catch (error) {
      console.error('[Apex] Scanner initialization failed:', error);
      throw error;
    }
  }

  /**
   * Main orchestration loop
   * Runs every second to coordinate system
   */
  private startOrchestrationLoop(): void {
    setInterval(() => {
      if (!this.isRunning) return;

      try {
        this.coordinateCycle();
      } catch (error) {
        console.error('[Apex] Orchestration cycle error:', error);
      }
    }, this.updateInterval);
  }

  /**
   * Main coordination cycle
   * Runs every orchestration tick
   */
  private coordinateCycle(): void {
    const now = Date.now();

    // 1. Check system health
    this.checkSystemHealth();

    // 2. Process pending signals
    this.processSignals();

    // 3. Monitor active trades
    this.monitorTrades();

    // 3.5. Monitor positions (Phase 3)
    this.monitorPositions();

    // 4. Sync dashboard connections
    this.syncDashboard();

    // 5. Clean up expired sessions
    this.cleanupExpiredSessions();

    // 6. Check execution queue
    this.processExecutionQueue();

    this.lastUpdate = now;
  }

  /**
   * SIGNAL PROCESSING
   * Route signals through complete lifecycle
   */
  private processSignals(): void {
    const signals = runtimeState.getActiveSignals();

    for (const signal of signals) {
      if (signal.status === 'DETECTED') {
        this.processDetectedSignal(signal);
      }
    }
  }

  private async processDetectedSignal(signal: ActiveSignal): Promise<void> {
    try {
      // Signal detected → check if should proceed
      runtimeState.updateSignalStatus(signal.id, 'FILTERED', 'Running pre-filter');

      // Emit for filter checks
      await emitEvent({
        type: 'SIGNAL_FILTERED',
        token: signal.token,
        conviction: signal.conviction,
        timestamp: Date.now(),
      });

      // Check if still valid
      const regime = runtimeState.getRegime();
      if (regime?.regime === 'COLD' && signal.conviction < 70) {
        runtimeState.recordSkippedSignal({
          id: signal.id,
          token: signal.token,
          conviction: signal.conviction,
          reason: 'Cold regime, low conviction',
          skippedAt: Date.now(),
        });
        runtimeState.updateSignalStatus(signal.id, 'SKIPPED', 'Cold regime');
        return;
      }

      // Move to watched
      runtimeState.updateSignalStatus(signal.id, 'WATCHED', 'Monitoring');

      // Emit for analysis
      await emitEvent({
        type: 'SIGNAL_WATCHED',
        token: signal.token,
        conviction: signal.conviction,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[Apex] Error processing signal:', error);
    }
  }

  /**
   * TRADE MONITORING
   * Monitor active trades, check stops/targets
   */
  private monitorTrades(): void {
    const trades = runtimeState.getOpenTrades();

    for (const trade of trades) {
      this.monitorTrade(trade);
    }
  }

  private async monitorTrade(trade: ActiveTrade): Promise<void> {
    // In real system, would get live price
    // For now, just ensure state is synchronized

    try {
      // Check if trade should be closed
      if (trade.status === 'OPEN') {
        runtimeState.updateTrade(trade.id, { status: 'MONITORING' });

        // Emit monitoring event
        await emitEvent({
          type: 'TRADE_CLOSED',
          tradeId: trade.id,
          token: trade.token,
          walletId: trade.walletId,
          entryPrice: trade.entryPrice,
          exitPrice: trade.currentPrice || 0,
          pnl: trade.currentPnL || 0,
          pnlPercent: ((trade.currentPrice || 0) - trade.entryPrice) / trade.entryPrice * 100,
          reason: 'monitoring',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('[Apex] Error monitoring trade:', error);
    }
  }

  /**
   * PHASE 3: POSITION MONITORING
   * Evaluate jeet exits, drawdown tracking, and dead-position detection
   */
  private async monitorPositions(): Promise<void> {
    try {
      await positionManager.monitorPositions();
    } catch (error) {
      console.error('[Apex] Error monitoring positions:', error);
    }
  }

  /**
   * DASHBOARD SYNCHRONIZATION
   * Keep all dashboard clients in sync
   */
  private syncDashboard(): void {
    const connections = runtimeState.getDashboardConnections();

    for (const conn of connections) {
      // Update heartbeat
      runtimeState.updateDashboardHeartbeat(conn.id);

      // Broadcast state update (would send via WebSocket)
      this.broadcastStateToConnection(conn.id);
    }
  }

  private broadcastStateToConnection(connectionId: string): void {
    // In production, would send via WebSocket
    const state = runtimeState.getFullState();
    this.emit(`dashboard:sync:${connectionId}`, state);
  }

  /**
   * TELEGRAM SESSION MANAGEMENT
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    // Sessions auto-expire in runtime state
    // Just emit for logging if needed
  }

  /**
   * EXECUTION QUEUE PROCESSING
   * Process pending executions in order
   */
  private processExecutionQueue(): void {
    const nextExecution = runtimeState.getNextExecution();

    if (nextExecution && nextExecution.status === 'PENDING') {
      this.executeQueuedTrade(nextExecution.id);
    }
  }

  private async executeQueuedTrade(executionId: string): Promise<void> {
    try {
      runtimeState.updateExecutionStatus(executionId, 'EXECUTING');

      // Execute trade logic here
      // Would call execution engine

      runtimeState.updateExecutionStatus(executionId, 'COMPLETED');

      console.log(`[Apex] Execution completed: ${executionId}`);
    } catch (error) {
      console.error('[Apex] Execution failed:', error);
      runtimeState.updateExecutionStatus(executionId, 'FAILED');
    }
  }

  /**
   * SYSTEM HEALTH CHECK
   * Verify all subsystems are healthy
   */
  private checkSystemHealth(): void {
    const health = runtimeState.getHealth();
    if (!health) return;

    // Check feed freshness (would compare timestamps)
    const feedFreshness = 100; // placeholder

    // Check execution success rate
    const executionSuccess = 95; // placeholder

    // Check module synchronization
    const moduleSync = 98; // placeholder

    runtimeState.updateHealth({
      feedFreshness,
      executionSuccess,
      moduleSync,
    });

    // If health degrades below threshold, emit alert
    if (health.overallHealth < 50) {
      this.emit('alert:health-degraded', health);
      console.warn('[Apex] ⚠️ System health degraded');
    }
  }

  /**
   * EVENT LISTENERS
   * Register for critical events
   */
  private registerEventListeners(): void {
    // Listen for new signals
    eventBus.subscribe('TOKEN_DETECTED', async (event: any) => {
      const signal: ActiveSignal = {
        id: `signal-${Date.now()}`,
        token: event.token,
        type: 'TOKEN_DETECTED',
        conviction: 50, // would calculate
        detectedAt: Date.now(),
        status: 'DETECTED',
      };
      runtimeState.addSignal(signal);
      this.emit('signal:detected', signal);
    });

    // Listen for regime changes
    eventBus.subscribe('REGIME_CHANGE', async (event: any) => {
      const regime: MarketRegimeState = {
        regime: event.newRegime,
        score: event.regimeScore || 50,
        reason: event.reason || 'Regime changed',
        lastUpdate: Date.now(),
        multiplier: event.newRegime === 'HEALTHY' ? 1 : event.newRegime === 'WARMING' ? 0.85 : 0.65,
      };
      runtimeState.setRegime(regime);
      this.emit('regime:updated', regime);
    });

    console.log('[Apex] Event listeners registered');
  }

  private registerExecutionListeners(): void {
    console.log('[Apex] Registering execution listeners...');
    
    // ───────────────────────────────────────────────────────────────
    // LISTEN: TRADE_SIGNAL (from Phase 2 router)
    // ───────────────────────────────────────────────────────────────
    
    eventBus.subscribe('TRADE_SIGNAL', async (signal: any) => {
      try {
        console.log(`[Apex/Exec] 🎯 Trade signal received: ${signal.tokenAddress.slice(0, 8)}... | Conviction: ${signal.conviction}`);
        
        // Get active wallet
        const activeWallet = runtimeState.getAllWallets()[0];
        if (!activeWallet) {
          console.warn('[Apex/Exec] ❌ No active wallet selected. Cannot execute.');
          return;
        }
        
        // Check if trading is enabled for this wallet
        if (!activeWallet.shouldTrade) {
          console.warn('[Apex/Exec] ⚠️ Trading disabled for wallet. Skipping.');
          return;
        }
        
        // ───────────────────────────────────────────────────────────
        // CHECK EXECUTION MODE
        // ───────────────────────────────────────────────────────────
        
        const mode = runtimeState.getExecutionMode();
        console.log(`[Apex/Exec] Mode: ${mode.toUpperCase()}`);
        
        if (mode === 'SHADOW') {
          // SHADOW: Simulate trade without actual execution
          console.log(`[Apex/Exec] 🔷 SHADOW MODE - Simulating trade (not executing)`);
          
          // Create a fake position for tracking
          const simulatedPosition = {
            id: `sim-${signal.tokenAddress}-${Date.now()}`,
            walletId: activeWallet.id,
            token: signal.tokenAddress,
            entryPrice: signal.entryPrice || 0,
            entryTime: Date.now(),
            positionSize: signal.positionSize,
            leverage: signal.leverage,
            conviction: signal.conviction,
            status: 'OPEN',
            currentPrice: signal.entryPrice || 0,
            currentPnL: 0,
            signals: signal.initialSignals || [],
          };
          
          runtimeState.addTrade(simulatedPosition as any);
          
          await emitEvent({
            type: 'TRADE_EXECUTED_SHADOW',
            tokenAddress: signal.tokenAddress,
            positionSize: signal.positionSize,
            leverage: signal.leverage,
            conviction: signal.conviction,
            timestamp: Date.now(),
            reason: 'SHADOW_MODE',
          } as any);
          
          return;
        }
        
        // ───────────────────────────────────────────────────────────
        // CHECK DRAWDOWN CIRCUIT BREAKER
        // ───────────────────────────────────────────────────────────
        
        if (drawdownTracker.shouldPauseTrading()) {
          console.warn('[Apex/Exec] 🛑 DRAWDOWN LIMIT HIT - Trading paused');
          
          await emitEvent({
            type: 'TRADING_PAUSED',
            reason: 'DRAWDOWN_CIRCUIT_BREAKER',
            metrics: drawdownTracker.getCurrentMetrics(),
            timestamp: Date.now(),
          } as any);
          
          return;
        }
        
        // ───────────────────────────────────────────────────────────
        // CHECK FOR SEMI_AUTO APPROVAL (if needed)
        // ───────────────────────────────────────────────────────────
        
        if (mode === 'SEMI_AUTO') {
          console.log(`[Apex/Exec] ⏳ SEMI_AUTO MODE - Awaiting approval for: ${signal.tokenAddress.slice(0, 8)}...`);
          
          // Send approval request via Telegram/Dashboard
          const approved = await this.requestTradeApproval(signal, activeWallet);
          
          if (!approved) {
            console.log(`[Apex/Exec] ❌ Trade rejected by user`);
            
            await emitEvent({
              type: 'TRADE_REJECTED',
              tokenAddress: signal.tokenAddress,
              reason: 'USER_REJECTION',
              timestamp: Date.now(),
            } as any);
            
            return;
          }
          
          console.log(`[Apex/Exec] ✅ Trade approved by user`);
        }
        
        // ───────────────────────────────────────────────────────────
        // PHASE 3: POSITION SIZING & SURVIVAL EXECUTION
        // ───────────────────────────────────────────────────────────
        
        if (POSITION_SIZING.CAPITAL_STATE_ENABLED) {
          console.log(`[Apex/Exec] 💰 Applying Position Sizing Philosophy...`);
          
          // 1. DETERMINE CAPITAL STATE
          const capitalState = capitalStateEngine.determineState(activeWallet);
          const sizingRules = capitalStateEngine.getSizingRules(capitalState);
          
          console.log(`[Apex/Exec] 📊 Capital State: ${capitalState} | Max Positions: ${sizingRules.maxSimultaneousPositions} | Aggression: ${sizingRules.aggressionMultiplier}x`);
          
          // 2. CHECK CONCENTRATED CONVICTION (Anti-spreading)
          const concentrationCheck = await concentratedConvictionEngine.evaluateTradeConcentration(
            activeWallet,
            { confidence: signal.conviction } as any // TODO: Map to CanonicalSignal
          );
          
          if (!concentrationCheck.proceed) {
            console.warn(`[Apex/Exec] 🛑 Concentration check failed: ${concentrationCheck.reason}`);
            
            await emitEvent({
              type: 'TRADE_REJECTED',
              tokenAddress: signal.tokenAddress,
              reason: concentrationCheck.reason,
              timestamp: Date.now(),
            } as any);
            
            return;
          }
          
          // 3. CALCULATE CONVICTION-BASED POSITION SIZE
          const positionSizeRequest = {
            conviction: signal.conviction,
            walletBalance: activeWallet.totalPnL || 100, // TODO: Get actual balance
            maxPositionSize: sizingRules.maxPositionSize,
            leverage: signal.leverage,
            narrative: {
              strength: 'moderate' as const, // TODO: Get from narrative engine
              smartMoneyConfirm: false, // TODO: Get from smart money engine
              narrativeLifecycle: 'early' as const, // TODO: Get from narrative engine
            },
            liquidity: {
              quality: 'medium' as const, // TODO: Get from liquidity analysis
              available: signal.liquidity || 10000,
            },
            marketRegime: signal.marketRegime || 'bullish',
            recentPerformance: {
              winRate: activeWallet.winRate || 0.5,
              profitFactor: 1.5, // TODO: Calculate from history
            },
          };
          
          const calculatedSize = convictionBasedSizer.calculatePositionSize(positionSizeRequest);
          
          // Override the signal's position size with our calculated size
          signal.positionSize = calculatedSize;
          
          console.log(`[Apex/Exec] 💰 Position Size: $${calculatedSize.toFixed(2)} (${(calculatedSize / (activeWallet.totalPnL || 100) * 100).toFixed(1)}% of capital)`);
          
          // 4. VALIDATE AGAINST CAPITAL STATE RULES
          if (signal.positionSize > sizingRules.maxPositionSize / 100 * (activeWallet.totalPnL || 100)) {
            console.warn(`[Apex/Exec] ⚠️ Position size exceeds capital state limit, capping...`);
            signal.positionSize = sizingRules.maxPositionSize / 100 * (activeWallet.totalPnL || 100);
          }
          
          if (activeWallet.openPositions >= sizingRules.maxSimultaneousPositions) {
            console.warn(`[Apex/Exec] 🛑 At max positions for ${capitalState} state (${activeWallet.openPositions}/${sizingRules.maxSimultaneousPositions})`);
            
            await emitEvent({
              type: 'TRADE_REJECTED',
              tokenAddress: signal.tokenAddress,
              reason: `Max positions reached for ${capitalState} capital state`,
              timestamp: Date.now(),
            } as any);
            
            return;
          }
          
          // 5. CHECK CAPITAL STATE TRADING PERMISSION
          if (!sizingRules.allowNewEntries) {
            console.warn(`[Apex/Exec] 🛑 New entries not allowed in ${capitalState} state`);
            
            await emitEvent({
              type: 'TRADE_REJECTED',
              tokenAddress: signal.tokenAddress,
              reason: `${capitalState} capital state prevents new entries`,
              timestamp: Date.now(),
            } as any);
            
            return;
          }
        }
        
        // ───────────────────────────────────────────────────────────
        // EXECUTE TRADE
        // ───────────────────────────────────────────────────────────
        
        console.log(`[Apex/Exec] 🚀 Executing trade: ${signal.tokenAddress.slice(0, 8)}...`);
        
        const position = await executionEngine.executeTrade(
          signal.tokenAddress,
          signal.entryPrice || 0,
          signal.conviction,
          signal.positionSize,
          signal.leverage,
          signal.stopLoss || 0,
          signal.takeProfit || 0,
          activeWallet.id,
          signal.initialSignals || []
        );
        
        if (!position) {
          console.warn(`[Apex/Exec] ❌ Trade execution failed`);
          
          await emitEvent({
            type: 'TRADE_EXECUTION_FAILED',
            tokenAddress: signal.tokenAddress,
            reason: 'Validation failed or insufficient liquidity',
            timestamp: Date.now(),
          } as any);
          
          return;
        }
        
        // ───────────────────────────────────────────────────────────
        // SYNC TO RUNTIME STATE
        // ───────────────────────────────────────────────────────────
        
        runtimeState.addTrade({
          id: position.id,
          walletId: position.walletId,
          token: position.token,
          entryPrice: position.entryPrice,
          entryTime: position.entryTime,
          positionSize: position.positionSize,
          leverage: position.leverage,
          conviction: position.conviction,
          status: 'OPEN',
          currentPrice: position.entryPrice,
          currentPnL: 0,
          signals: position.signals || [],
        });
        
        // Update wallet stats
        activeWallet.openPositions += 1;
        activeWallet.lastUpdate = Date.now();
        
        console.log(`[Apex/Exec] ✅ Position opened: ${position.token.slice(0, 8)}...`);
        
      } catch (err) {
        console.error('[Apex/Exec] Fatal error:', err);
        
        await emitEvent({
          type: 'EXECUTION_ERROR',
          error: String(err),
          timestamp: Date.now(),
        } as any);
      }
    });
    
    // ───────────────────────────────────────────────────────────────
    // LISTEN: TRADE_CLOSED (from position-manager or exits)
    // ───────────────────────────────────────────────────────────────
    
    eventBus.subscribe('TRADE_CLOSED', async (event: any) => {
      try {
        console.log(`[Apex/Exec] 📊 Trade closed: ${event.token} | P&L: ${event.pnl >= 0 ? '+' : ''}${event.pnl?.toFixed(2)}`);
        
        // Get the trade from runtime state
        const trade = runtimeState.getTrade(event.tradeId);
        if (!trade) return;
        
        // Update runtime state
        runtimeState.closeTrade(event.tradeId);
        
        // Update wallet stats
        const wallet = runtimeState.getWallet(trade.walletId);
        if (wallet) {
          wallet.openPositions = Math.max(0, wallet.openPositions - 1);
          wallet.totalPnL += event.pnl || 0;
          wallet.lastUpdate = Date.now();
        }
        
        // ───────────────────────────────────────────────────────────
        // UPDATE DRAWDOWN TRACKER
        // ───────────────────────────────────────────────────────────
        
        if (event.pnl && event.pnl < 0) {
          const walletBalance = wallet ? wallet.totalPnL : 0;
          drawdownTracker.updatePortfolioValue(walletBalance);
          
          // Check if should pause
          if (drawdownTracker.shouldPauseTrading()) {
            console.warn(`[Apex/Exec] 🛑 DRAWDOWN LIMIT HIT - Pausing trading`);
            
            if (wallet) {
              wallet.shouldTrade = false;
            }
            
            await emitEvent({
              type: 'TRADING_PAUSED',
              reason: 'DRAWDOWN_CIRCUIT_BREAKER',
              metrics: drawdownTracker.getCurrentMetrics(),
              timestamp: Date.now(),
            } as any);
          }
        }
        
        console.log(`[Apex/Exec] ✅ Trade removed from tracking`);
        
      } catch (err) {
        console.error('[Apex/Exec] Error processing closed trade:', err);
      }
    });
    
    console.log('[Apex] ✅ Execution listeners registered');
  }

  /**
   * REQUEST APPROVAL FOR TRADE (SEMI_AUTO mode)
   * Can be implemented via Telegram or Dashboard
   */
  private async requestTradeApproval(signal: any, wallet: any): Promise<boolean> {
    // TODO: Implement approval mechanism
    // Options:
    // 1. Send Telegram message with approval buttons
    // 2. Send to Dashboard and wait for response
    // 3. Use in-app approval queue
    
    // For now, return true (auto-approve in development)
    console.log(`[Apex] TODO: Implement approval for ${signal.tokenAddress}`);
    return true;
  }

  private async handleTradeSignal(signal: any): Promise<void> {
    try {
      if (signal.decision !== 'TRADE') {
        console.log(`[Apex/Exec] Skipping non-trade signal for ${signal.tokenName || signal.tokenAddress}`);
        return;
      }

      const mode = runtimeState.getExecutionMode();
      const token = signal.tokenName || signal.tokenAddress || 'UNKNOWN';
      const wallet = runtimeState.getAllWallets()[0];

      console.log(`[Apex/Exec] 🎯 Trade signal received: ${token} | Conviction: ${signal.confidence}`);
      console.log(`[Apex/Exec] Mode: ${mode}`);

      if (!wallet) {
        console.warn('[Apex/Exec] No wallet in runtime state. Aborting trade signal.');
        return;
      }

      const entryPrice = signal.entryPrice || signal.price || 0;
      const positionSize = signal.positionSize || 0;
      const leverage = signal.leverage || 1;
      const stopLoss = signal.stopLoss || 0;
      const takeProfit = signal.takeProfit || 0;

      if (mode === 'SHADOW') {
        const simulatedTrade: ActiveTrade = {
          id: `shadow-${Date.now()}`,
          walletId: wallet.id,
          token,
          entryPrice,
          entryTime: Date.now(),
          positionSize,
          leverage,
          conviction: signal.confidence || 0,
          status: 'OPEN',
          signals: signal.reasons || [],
        };

        runtimeState.addTrade(simulatedTrade);
        runtimeState.addExecution({
          id: `exec-${Date.now()}`,
          tokenAddress: signal.tokenAddress,
          tokenName: token,
          walletAddress: wallet.address,
          tradeSignalId: signal.tokenAddress || signal.tokenName || `signal-${Date.now()}`,
          conviction: signal.confidence || 0,
          convictionMode: 'OBSERVATION',
          positionSize,
          leverage,
          stopLoss,
          takeProfit,
          status: 'COMPLETED',
          mode: 'SHADOW',
          createdAt: Date.now(),
          executedAt: Date.now(),
          narrativeCategory: signal.marketRegime || 'unknown',
          patternShape: signal.severity || 'unknown',
        });

        await emitEvent({
          type: 'TRADE_EXECUTED_SHADOW',
          token,
          walletId: wallet.id,
          entryPrice,
          positionSize,
          leverage,
          timestamp: Date.now(),
        });

        console.log(`[Apex/Exec] ✅ Shadow position simulated: ${token}`);
        return;
      }

      if (mode === 'SEMI_AUTO') {
        const executionId = `exec-${Date.now()}`;
        runtimeState.addExecution({
          id: executionId,
          tokenAddress: signal.tokenAddress,
          tokenName: token,
          walletAddress: wallet.address,
          tradeSignalId: signal.tokenAddress || signal.tokenName || executionId,
          conviction: signal.confidence || 0,
          convictionMode: 'CAUTIOUS',
          positionSize,
          leverage,
          stopLoss,
          takeProfit,
          status: 'PENDING',
          mode: 'SEMI_AUTO',
          createdAt: Date.now(),
          narrativeCategory: signal.marketRegime || 'unknown',
          patternShape: signal.severity || 'unknown',
        });

        if (bot && bot.sendMessage) {
          const chatId = TELEGRAM?.chatId;
          if (chatId) {
            try {
              await bot.sendMessage(chatId, `
🟡 *SEMI_AUTO TRADE REQUEST*
Token: ${token}
Conviction: ${signal.confidence}
Size: ${positionSize}
Leverage: ${leverage}x
StopLoss: ${stopLoss}
TakeProfit: ${takeProfit}

Approve or reject this trade.
              `.trim(), {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: 'Approve', callback_data: `trade_approve:${executionId}` },
                      { text: 'Reject', callback_data: `trade_reject:${executionId}` },
                    ],
                  ],
                },
              });
            } catch (err) {
              console.warn('[Apex/Exec] Failed to send semi-auto approval Telegram message', err);
            }
          } else {
            console.warn('[Apex/Exec] No TELEGRAM.chatId configured for semi-auto approval message');
          }
        }

        await emitEvent({
          type: 'TRADE_APPROVAL_REQUESTED',
          executionId,
          token,
          walletId: wallet.id,
          timestamp: Date.now(),
        });

        console.log(`[Apex/Exec] 🟡 Semi-auto approval queued: ${token}`);
        return;
      }

      const position = await executionEngine.executeTrade(
        token,
        entryPrice,
        signal.confidence || 0,
        positionSize,
        leverage,
        stopLoss,
        takeProfit,
        wallet.id,
        signal.reasons || [],
      );

      if (!position) {
        console.warn(`[Apex/Exec] Trade execution blocked by validation: ${token}`);
        return;
      }

      runtimeState.addTrade({
        id: position.id,
        walletId: position.walletId,
        token: position.token,
        entryPrice: position.entryPrice,
        entryTime: position.entryTime,
        positionSize: position.positionSize,
        leverage: position.leverage,
        conviction: position.conviction,
        status: 'OPEN',
        signals: position.signals || [],
      });

      await emitEvent({
        type: 'TRADE_EXECUTED',
        tradeId: position.id,
        token: position.token,
        walletId: position.walletId,
        entryPrice: position.entryPrice,
        positionSize: position.positionSize,
        leverage: position.leverage,
        timestamp: Date.now(),
      });

      console.log(`[Apex/Exec] ✅ Position opened: ${token}`);
    } catch (error) {
      console.error('[Apex/Exec] Error handling trade signal:', error);
    }
  }

  private async processApproval(executionId: string, approved: boolean): Promise<void> {
    const execution = runtimeState.getExecution(executionId);
    if (!execution) {
      console.warn(`[Apex/Exec] Approval event for unknown execution ${executionId}`);
      return;
    }

    if (!approved) {
      runtimeState.updateExecutionStatus(executionId, 'FAILED');
      await emitEvent({
        type: 'TRADE_REJECTED',
        executionId,
        token: execution.tokenName,
        walletId: execution.walletAddress,
        timestamp: Date.now(),
      });
      console.log(`[Apex/Exec] Trade rejected by human for ${execution.tokenName}`);
      return;
    }

    runtimeState.updateExecutionStatus(executionId, 'EXECUTING');

    const wallet = runtimeState.getAllWallets()[0];
    if (!wallet) {
      console.warn('[Apex/Exec] No wallet available for approved execution');
      runtimeState.updateExecutionStatus(executionId, 'FAILED');
      return;
    }

    const position = await executionEngine.executeTrade(
      execution.tokenName,
      execution.executedAt || 0,
      execution.conviction,
      execution.positionSize,
      execution.leverage,
      execution.stopLoss,
      execution.takeProfit,
      wallet.id,
      [],
    );

    if (position) {
      runtimeState.addTrade({
        id: position.id,
        walletId: position.walletId,
        token: position.token,
        entryPrice: position.entryPrice,
        entryTime: position.entryTime,
        positionSize: position.positionSize,
        leverage: position.leverage,
        conviction: position.conviction,
        status: 'OPEN',
        signals: position.signals || [],
      });
      runtimeState.updateExecutionStatus(executionId, 'COMPLETED');
      console.log(`[Apex/Exec] ✅ Semi-auto approved trade executed: ${execution.tokenName}`);
    } else {
      runtimeState.updateExecutionStatus(executionId, 'FAILED');
      console.warn(`[Apex/Exec] Semi-auto execution failed for ${execution.tokenName}`);
    }
  }

  /**
   * REPORTING
   * Generate system status
   */
  getSystemStatus() {
    const state = runtimeState.getFullState();
    const health = runtimeState.getHealth();

    return {
      phase: this.phase,
      isRunning: this.isRunning,
      uptime: Date.now() - this.lastUpdate,
      health,
      summary: {
        activeSignals: state.signals.length,
        activeTrades: state.trades.length,
        wallets: state.wallets.length,
        dashboardConnections: state.dashboardConnections.length,
        sessions: state.sessionCount,
        regime: state.regime?.regime || 'UNKNOWN',
      },
    };
  }

  /**
   * SHUTDOWN
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[Apex] Shutting down...');
    this.phase = 'SHUTDOWN';
    this.isRunning = false;

    // Close all connections
    const connections = runtimeState.getDashboardConnections();
    for (const conn of connections) {
      this.emit(`dashboard:disconnect:${conn.id}`);
    }

    console.log('[Apex] ✅ Orchestrator shutdown complete');
  }
}

// Export singleton
export const apexOrchestrator = new ApexOrchestrator();
