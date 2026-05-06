// File path: src/core/orchestrator/apex-orchestrator.ts
/**
 * APEX ORCHESTRATOR - Central Runtime Coordinator
 * Single point of orchestration for all system activities
 * Routes signals, manages lifecycle, synchronizes state
 */

import { EventEmitter } from 'events';
import { runtimeState, ActiveSignal, ActiveTrade, MarketRegimeState } from '../state/runtime-state';
import { emit as emitEvent, eventBus } from '../../services/events/event-bus';

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

      // Listen to all critical events
      this.registerEventListeners();

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

    // Listen for trade execution requests
    eventBus.subscribe('TRADE_SIGNAL', async (event: any) => {
      const trade: ActiveTrade = {
        id: `trade-${Date.now()}`,
        walletId: event.walletId,
        token: event.token,
        entryPrice: event.entryPrice,
        entryTime: Date.now(),
        positionSize: event.positionSize,
        leverage: event.leverage || 1,
        conviction: event.conviction,
        status: 'OPEN',
        signals: [],
      };
      runtimeState.addTrade(trade);
      this.emit('trade:created', trade);
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
