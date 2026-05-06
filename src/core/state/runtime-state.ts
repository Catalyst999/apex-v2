// File path: src/core/state/runtime-state.ts
/**
 * RUNTIME STATE - Unified System Memory
 * Single source of truth for all system state
 * All modules read/write through this layer (not independently)
 */

import { EventEmitter } from 'events';

export interface ActiveSignal {
  id: string;
  token: string;
  type: string;
  conviction: number;
  detectedAt: number;
  status: 'DETECTED' | 'FILTERED' | 'SKIPPED' | 'WATCHED' | 'SCORED';
  reason?: string;
}

export interface ActiveTrade {
  id: string;
  walletId: string;
  token: string;
  entryPrice: number;
  entryTime: number;
  positionSize: number;
  leverage: number;
  conviction: number;
  status: 'OPEN' | 'MONITORING' | 'AT_STOP' | 'AT_TP' | 'CLOSING';
  currentPrice?: number;
  currentPnL?: number;
  signals: string[];
}

export interface WalletState {
  id: string;
  address: string;
  strategy: 'CONSERVATIVE' | 'AGGRESSIVE' | 'EXPERIMENTAL';
  status: 'ACTIVE' | 'PAUSED' | 'LEARNING';
  totalPnL: number;
  openPositions: number;
  winRate: number;
  convictionMultiplier: number;
  shouldTrade: boolean;
  lastUpdate: number;
}

export interface MarketRegimeState {
  regime: 'HEALTHY' | 'WARMING' | 'COLD';
  score: number;
  reason: string;
  lastUpdate: number;
  multiplier: number;
}

export interface NarrativeState {
  activeNarratives: {
    name: string;
    strength: number;
    acceleration: number;
    liquidityConcentration: number;
    exhaustion: number;
  }[];
  rotatingFrom?: string;
  rotatingTo?: string;
  lastRotation?: number;
}

export interface AIBudgetState {
  haikuTokensUsed: number;
  haikuTokensLimit: number;
  grokTokensUsed: number;
  grokTokensLimit: number;
  lastResetAt: number;
}

export interface TelegramSessionState {
  [userId: string]: {
    awaiting?: string;
    step?: string;
    data?: Record<string, any>;
    expiresAt: number;
    conversationHistory: Array<{ role: string; content: string }>;
  };
}

export interface DashboardConnection {
  id: string;
  userId: string;
  connectedAt: number;
  lastHeartbeat: number;
}

export interface ExecutionQueueItem {
  id: string;
  token: string;
  walletId: string;
  action: 'BUY' | 'SELL' | 'CLOSE';
  priority: number;
  createdAt: number;
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
}

export interface SkippedSignal {
  id: string;
  token: string;
  conviction: number;
  reason: string;
  skippedAt: number;
  couldHaveBeen?: number; // hypothetical return if entered
}

export interface SystemHealthMetrics {
  apiLatency: number;
  websocketHealth: 'OK' | 'DEGRADED' | 'FAILED';
  moduleSync: number; // 0-100
  executionSuccess: number; // 0-100
  feedFreshness: number; // 0-100
  overallHealth: number; // 0-100
  trustScore: number; // 0-100
  lastCheck: number;
}

class RuntimeStateManager extends EventEmitter {
  // Core state containers
  private activeSignals: Map<string, ActiveSignal> = new Map();
  private activeTrades: Map<string, ActiveTrade> = new Map();
  private walletStates: Map<string, WalletState> = new Map();
  private marketRegime: MarketRegimeState | null = null;
  private narrativeState: NarrativeState | null = null;
  private aiBudget: AIBudgetState | null = null;
  private telegramSessions: TelegramSessionState = {};
  private dashboardConnections: Map<string, DashboardConnection> = new Map();
  private executionQueue: Map<string, ExecutionQueueItem> = new Map();
  private skippedSignals: SkippedSignal[] = [];
  private systemHealth: SystemHealthMetrics | null = null;

  constructor() {
    super();
    this.setMaxListeners(100); // many modules will listen
    this.initializeHealth();
  }

  // ─── SIGNAL MANAGEMENT ──────────────────────────────────────────────

  addSignal(signal: ActiveSignal): void {
    this.activeSignals.set(signal.id, signal);
    this.emit('signal:added', signal);
    console.log(`[RuntimeState] Signal added: ${signal.token} (${signal.conviction}%)`);
  }

  getSignal(id: string): ActiveSignal | undefined {
    return this.activeSignals.get(id);
  }

  updateSignalStatus(id: string, status: ActiveSignal['status'], reason?: string): void {
    const signal = this.activeSignals.get(id);
    if (signal) {
      signal.status = status;
      if (reason) signal.reason = reason;
      this.emit('signal:updated', signal);
    }
  }

  getActiveSignals(): ActiveSignal[] {
    return Array.from(this.activeSignals.values()).filter((s) => s.status !== 'SKIPPED');
  }

  getAllSignals(): ActiveSignal[] {
    return Array.from(this.activeSignals.values());
  }

  // ─── TRADE MANAGEMENT ───────────────────────────────────────────────

  addTrade(trade: ActiveTrade): void {
    this.activeTrades.set(trade.id, trade);
    const wallet = this.walletStates.get(trade.walletId);
    if (wallet) {
      wallet.openPositions += 1;
      wallet.lastUpdate = Date.now();
    }
    this.emit('trade:opened', trade);
    console.log(`[RuntimeState] Trade opened: ${trade.token} @ $${trade.entryPrice}`);
  }

  getTrade(id: string): ActiveTrade | undefined {
    return this.activeTrades.get(id);
  }

  updateTrade(id: string, updates: Partial<ActiveTrade>): void {
    const trade = this.activeTrades.get(id);
    if (trade) {
      Object.assign(trade, updates);
      this.emit('trade:updated', trade);
    }
  }

  closeTrade(id: string): void {
    const trade = this.activeTrades.get(id);
    if (trade) {
      const wallet = this.walletStates.get(trade.walletId);
      if (wallet) {
        wallet.openPositions -= 1;
        wallet.lastUpdate = Date.now();
      }
      this.activeTrades.delete(id);
      this.emit('trade:closed', trade);
      console.log(`[RuntimeState] Trade closed: ${trade.token}`);
    }
  }

  getOpenTrades(walletId?: string): ActiveTrade[] {
    const trades = Array.from(this.activeTrades.values()).filter((t) => t.status !== 'CLOSING');
    return walletId ? trades.filter((t) => t.walletId === walletId) : trades;
  }

  // ─── WALLET MANAGEMENT ──────────────────────────────────────────────

  setWallet(wallet: WalletState): void {
    this.walletStates.set(wallet.id, wallet);
    this.emit('wallet:updated', wallet);
  }

  getWallet(walletId: string): WalletState | undefined {
    return this.walletStates.get(walletId);
  }

  getAllWallets(): WalletState[] {
    return Array.from(this.walletStates.values());
  }

  updateWalletMultiplier(walletId: string, multiplier: number): void {
    const wallet = this.walletStates.get(walletId);
    if (wallet) {
      wallet.convictionMultiplier = multiplier;
      wallet.lastUpdate = Date.now();
      this.emit('wallet:multiplier-updated', { walletId, multiplier });
    }
  }

  // ─── REGIME MANAGEMENT ──────────────────────────────────────────────

  setRegime(regime: MarketRegimeState): void {
    this.marketRegime = regime;
    this.emit('regime:updated', regime);
    console.log(`[RuntimeState] Regime: ${regime.regime} (${regime.score}/100)`);
  }

  getRegime(): MarketRegimeState | null {
    return this.marketRegime;
  }

  // ─── NARRATIVE MANAGEMENT ───────────────────────────────────────────

  setNarrativeState(narrative: NarrativeState): void {
    this.narrativeState = narrative;
    this.emit('narrative:updated', narrative);
  }

  getNarrativeState(): NarrativeState | null {
    return this.narrativeState;
  }

  // ─── AI BUDGET MANAGEMENT ───────────────────────────────────────────

  initializeAIBudget(haikuLimit: number, grokLimit: number): void {
    this.aiBudget = {
      haikuTokensUsed: 0,
      haikuTokensLimit: haikuLimit,
      grokTokensUsed: 0,
      grokTokensLimit: grokLimit,
      lastResetAt: Date.now(),
    };
  }

  consumeHaikuTokens(tokens: number): boolean {
    if (!this.aiBudget) return false;
    if (this.aiBudget.haikuTokensUsed + tokens > this.aiBudget.haikuTokensLimit) {
      console.warn('[RuntimeState] Haiku budget exceeded');
      return false;
    }
    this.aiBudget.haikuTokensUsed += tokens;
    this.emit('ai:haiku-tokens-consumed', tokens);
    return true;
  }

  consumeGrokTokens(tokens: number): boolean {
    if (!this.aiBudget) return false;
    if (this.aiBudget.grokTokensUsed + tokens > this.aiBudget.grokTokensLimit) {
      console.warn('[RuntimeState] Grok budget exceeded');
      return false;
    }
    this.aiBudget.grokTokensUsed += tokens;
    this.emit('ai:grok-tokens-consumed', tokens);
    return true;
  }

  getAIBudgetState(): AIBudgetState | null {
    return this.aiBudget;
  }

  // ─── TELEGRAM SESSION MANAGEMENT ────────────────────────────────────

  createSession(userId: string): void {
    this.telegramSessions[userId] = {
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 min expiry
      conversationHistory: [],
    };
  }

  getSession(userId: string): (typeof this.telegramSessions)[string] | undefined {
    const session = this.telegramSessions[userId];
    if (!session) return undefined;

    // Check expiry
    if (session.expiresAt < Date.now()) {
      delete this.telegramSessions[userId];
      return undefined;
    }

    return session;
  }

  updateSession(userId: string, updates: Partial<(typeof this.telegramSessions)[string]>): void {
    const session = this.getSession(userId);
    if (session) {
      Object.assign(session, updates);
      session.expiresAt = Date.now() + 30 * 60 * 1000; // reset expiry
      this.emit('telegram:session-updated', { userId, session });
    }
  }

  endSession(userId: string): void {
    delete this.telegramSessions[userId];
    this.emit('telegram:session-ended', userId);
  }

  // ─── DASHBOARD CONNECTION MANAGEMENT ────────────────────────────────

  registerDashboard(id: string, userId: string): void {
    this.dashboardConnections.set(id, {
      id,
      userId,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    });
    this.emit('dashboard:connected', { id, userId });
  }

  updateDashboardHeartbeat(id: string): void {
    const conn = this.dashboardConnections.get(id);
    if (conn) {
      conn.lastHeartbeat = Date.now();
    }
  }

  getDashboardConnections(): DashboardConnection[] {
    return Array.from(this.dashboardConnections.values());
  }

  // ─── EXECUTION QUEUE MANAGEMENT ─────────────────────────────────────

  enqueueExecution(item: ExecutionQueueItem): void {
    this.executionQueue.set(item.id, item);
    this.emit('execution:enqueued', item);
  }

  getNextExecution(): ExecutionQueueItem | undefined {
    const pending = Array.from(this.executionQueue.values())
      .filter((e) => e.status === 'PENDING')
      .sort((a, b) => b.priority - a.priority);
    return pending[0];
  }

  updateExecutionStatus(id: string, status: ExecutionQueueItem['status']): void {
    const item = this.executionQueue.get(id);
    if (item) {
      item.status = status;
      this.emit('execution:status-updated', { id, status });
    }
  }

  // ─── SKIPPED SIGNAL TRACKING ────────────────────────────────────────

  recordSkippedSignal(signal: SkippedSignal): void {
    this.skippedSignals.push(signal);
    this.emit('signal:skipped', signal);
  }

  getSkippedSignals(limit: number = 50): SkippedSignal[] {
    return this.skippedSignals.slice(-limit);
  }

  // ─── SYSTEM HEALTH MANAGEMENT ───────────────────────────────────────

  private initializeHealth(): void {
    this.systemHealth = {
      apiLatency: 0,
      websocketHealth: 'OK',
      moduleSync: 100,
      executionSuccess: 100,
      feedFreshness: 100,
      overallHealth: 100,
      trustScore: 100,
      lastCheck: Date.now(),
    };
  }

  updateHealth(updates: Partial<SystemHealthMetrics>): void {
    if (this.systemHealth) {
      Object.assign(this.systemHealth, updates);
      this.systemHealth.lastCheck = Date.now();

      // Calculate overall health
      const scores = [
        this.systemHealth.moduleSync,
        this.systemHealth.executionSuccess,
        this.systemHealth.feedFreshness,
      ];
      this.systemHealth.overallHealth = scores.reduce((a, b) => a + b) / scores.length;
      this.systemHealth.trustScore = Math.min(100, this.systemHealth.overallHealth * 0.9 + 10);

      this.emit('health:updated', this.systemHealth);
    }
  }

  getHealth(): SystemHealthMetrics | null {
    return this.systemHealth;
  }

  // ─── GLOBAL STATE DUMP ──────────────────────────────────────────────

  getFullState() {
    return {
      signals: Array.from(this.activeSignals.values()),
      trades: Array.from(this.activeTrades.values()),
      wallets: Array.from(this.walletStates.values()),
      regime: this.marketRegime,
      narrative: this.narrativeState,
      aiBudget: this.aiBudget,
      dashboardConnections: Array.from(this.dashboardConnections.values()),
      sessionCount: Object.keys(this.telegramSessions).length,
      queuedExecutions: Array.from(this.executionQueue.values()),
      health: this.systemHealth,
    };
  }
}

// Export singleton
export const runtimeState = new RuntimeStateManager();
