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

export interface RevivalCandidate {
  id: string;
  token: string;
  dormancyScore: number; // 0-100, how long dead
  reactivationVelocity: number; // 0-100, how fast waking up
  walletCoordinationScore: number; // 0-100, smart money clustering
  liquidityTrustScore: number; // 0-100, liquidity reliability
  attentionIgnitionScore: number; // 0-100, social acceleration
  lifecycleState: 'DEAD' | 'DORMANT' | 'REACTIVATING' | 'IGNITING' | 'EXPLODING' | 'EXHAUSTION';
  escalationLevel: number; // 0-100, readiness for execution
  detectedAt: number;
  lastUpdated: number;
  expiresAt: number; // TTL for ephemeral storage
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
  private revivalCandidates: Map<string, RevivalCandidate> = new Map();

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

  // ─── REVIVAL CANDIDATE MANAGEMENT ───────────────────────────────────────

  addRevivalCandidate(candidate: RevivalCandidate): void {
    this.revivalCandidates.set(candidate.token, candidate);
    this.emit('revival:candidate-added', candidate);
    console.log(`[RuntimeState] Revival candidate added: ${candidate.token} (score: ${candidate.lifecycleState})`);
  }

  getRevivalCandidate(token: string): RevivalCandidate | undefined {
    return this.revivalCandidates.get(token);
  }

  updateRevivalCandidate(token: string, updates: Partial<RevivalCandidate>): void {
    const candidate = this.revivalCandidates.get(token);
    if (candidate) {
      Object.assign(candidate, updates);
      candidate.lastUpdated = Date.now();
      this.emit('revival:candidate-updated', candidate);
    }
  }

  updateRevivalLifecycle(token: string, newState: RevivalCandidate['lifecycleState']): void {
    const candidate = this.revivalCandidates.get(token);
    if (candidate) {
      const oldState = candidate.lifecycleState;
      candidate.lifecycleState = newState;
      candidate.lastUpdated = Date.now();
      this.emit('revival:lifecycle-changed', { token, oldState, newState });
    }
  }

  updateRevivalEscalation(token: string, escalationLevel: number): void {
    const candidate = this.revivalCandidates.get(token);
    if (candidate) {
      candidate.escalationLevel = escalationLevel;
      candidate.lastUpdated = Date.now();
      this.emit('revival:escalation-updated', { token, escalationLevel });
    }
  }

  getAllRevivalCandidates(): RevivalCandidate[] {
    return Array.from(this.revivalCandidates.values());
  }

  getRevivalCandidatesByState(state: RevivalCandidate['lifecycleState']): RevivalCandidate[] {
    return Array.from(this.revivalCandidates.values()).filter(c => c.lifecycleState === state);
  }

  getActiveRevivalCandidates(): RevivalCandidate[] {
    return this.getAllRevivalCandidates().filter(c => c.expiresAt > Date.now());
  }

  removeRevivalCandidate(token: string): void {
    this.revivalCandidates.delete(token);
    this.emit('revival:candidate-removed', token);
  }

  // ─── REVIVAL CLEANUP (Ephemeral Memory Management) ──────────────────────

  cleanupExpiredRevivalCandidates(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [token, candidate] of this.revivalCandidates.entries()) {
      if (candidate.expiresAt < now) {
        expired.push(token);
      }
    }

    for (const token of expired) {
      this.revivalCandidates.delete(token);
    }

    if (expired.length > 0) {
      console.log(`[RuntimeState] Cleaned ${expired.length} expired revival candidates`);
    }
  }

  getRevivalStats(): {
    total: number;
    byState: Record<string, number>;
    active: number;
  } {
    const all = this.getAllRevivalCandidates();
    const byState: Record<string, number> = {
      DEAD: 0,
      DORMANT: 0,
      REACTIVATING: 0,
      IGNITING: 0,
      EXPLODING: 0,
      EXHAUSTION: 0,
    };

    for (const candidate of all) {
      byState[candidate.lifecycleState]++;
    }

    return {
      total: all.length,
      byState,
      active: this.getActiveRevivalCandidates().length,
    };
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
      revival: {
        candidates: Array.from(this.revivalCandidates.values()),
        stats: this.getRevivalStats(),
      },
    };
  }
}

// Export singleton
export const runtimeState = new RuntimeStateManager();