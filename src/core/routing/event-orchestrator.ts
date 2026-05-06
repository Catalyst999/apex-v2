// File path: src/core/routing/event-orchestrator.ts
/**
 * EVENT ORCHESTRATOR - Unified Event Routing
 * Central event hub for all system communication
 * Replaces direct module calls - enforces event-first architecture
 */

import { EventEmitter } from 'events';
import { runtimeState } from '../state/runtime-state';

export interface SystemEvent {
  type: string;
  payload: any;
  timestamp: number;
  source?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

class EventOrchestrator extends EventEmitter {
  private eventLog: SystemEvent[] = [];
  private maxLogSize = 10000;
  private subscriptions: Map<string, Set<Function>> = new Map();
  private eventQueue: SystemEvent[] = [];
  private isProcessing = false;

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  /**
   * DISPATCH EVENT
   * All events must go through orchestrator
   */
  async dispatch(eventType: string, payload: any, source?: string, priority: string = 'NORMAL'): Promise<void> {
    const event: SystemEvent = {
      type: eventType,
      payload,
      timestamp: Date.now(),
      source,
      priority: priority as any,
    };

    // Log event
    this.logEvent(event);

    // Queue for processing
    this.eventQueue.push(event);

    // Process immediately if high priority
    if (priority === 'CRITICAL') {
      await this.processEvent(event);
    } else {
      // Process queue on next tick
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * PROCESS EVENT
   * Route event to all subscribers
   */
  private async processEvent(event: SystemEvent): Promise<void> {
    console.log(`[EventOrch] ${event.type} ${event.source ? `(from ${event.source})` : ''}`);

    // Get subscribers for this event type
    const subscribers = this.subscriptions.get(event.type) || new Set();

    // Call all subscribers
    for (const subscriber of subscribers) {
      try {
        await Promise.resolve(subscriber(event));
      } catch (error) {
        console.error(`[EventOrch] Error processing ${event.type}:`, error);
      }
    }

    // Emit on EventEmitter for legacy listeners
    this.eventEmitter('event', event);
  }

  /**
   * PROCESS EVENT QUEUE
   * Batch process queued events
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) return;

    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      await this.processEvent(event);
    }

    this.isProcessing = false;
  }

  /**
   * SUBSCRIBE
   * Subscribe to event type
   */
  subscribe(eventType: string, callback: (event: SystemEvent) => void | Promise<void>): () => void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }

    this.subscriptions.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(eventType)?.delete(callback);
    };
  }

  /**
   * SUBSCRIBE PATTERN
   * Subscribe to multiple events with pattern
   */
  subscribePattern(pattern: string, callback: (event: SystemEvent) => void | Promise<void>): () => void {
    const eventTypes = Array.from(this.subscriptions.keys());
    const regex = new RegExp(pattern);
    const unsubscribers: Array<() => void> = [];

    for (const eventType of eventTypes) {
      if (regex.test(eventType)) {
        unsubscribers.push(this.subscribe(eventType, callback));
      }
    }

    // Return function to unsubscribe all
    return () => {
      unsubscribers.forEach((u) => u());
    };
  }

  /**
   * SIGNAL LIFECYCLE EVENTS
   * Signal detection → skip/enter → exit → outcome
   */
  async signalDetected(token: string, conviction: number, source: string): Promise<void> {
    await this.dispatch('SIGNAL_DETECTED', { token, conviction }, source, 'NORMAL');
  }

  async signalFiltered(token: string, reason: string): Promise<void> {
    await this.dispatch('SIGNAL_FILTERED', { token, reason }, 'gateway', 'NORMAL');
  }

  async signalSkipped(token: string, conviction: number, reason: string): Promise<void> {
    await this.dispatch('SIGNAL_SKIPPED', { token, conviction, reason }, 'orchestrator', 'NORMAL');
  }

  async signalEntered(
    tradeId: string,
    token: string,
    entryPrice: number,
    conviction: number,
    walletId: string,
  ): Promise<void> {
    await this.dispatch(
      'TRADE_ENTERED',
      { tradeId, token, entryPrice, conviction, walletId },
      'execution',
      'HIGH',
    );
  }

  async signalClosed(
    tradeId: string,
    token: string,
    exitPrice: number,
    pnl: number,
    pnlPercent: number,
    reason: string,
  ): Promise<void> {
    await this.dispatch(
      'TRADE_CLOSED',
      { tradeId, token, exitPrice, pnl, pnlPercent, reason },
      'execution',
      'HIGH',
    );
  }

  /**
   * TELEGRAM EVENTS
   * User interactions
   */
  async telegramCommand(userId: string, command: string, args?: any): Promise<void> {
    await this.dispatch('TELEGRAM_COMMAND', { userId, command, args }, 'telegram', 'NORMAL');
  }

  async telegramMessage(userId: string, text: string): Promise<void> {
    await this.dispatch('TELEGRAM_MESSAGE', { userId, text }, 'telegram', 'NORMAL');
  }

  async telegramButtonPress(userId: string, buttonId: string): Promise<void> {
    await this.dispatch('TELEGRAM_BUTTON', { userId, buttonId }, 'telegram', 'NORMAL');
  }

  /**
   * ALERT EVENTS
   * System alerts
   */
  async alertSignal(token: string, conviction: number, reason: string): Promise<void> {
    await this.dispatch('ALERT_SIGNAL', { token, conviction, reason }, 'alert-service', 'HIGH');
  }

  async alertTrade(token: string, type: 'ENTRY' | 'EXIT', details: any): Promise<void> {
    await this.dispatch(`ALERT_${type}`, { token, ...details }, 'alert-service', 'HIGH');
  }

  async alertHealth(severity: 'WARNING' | 'CRITICAL', message: string): Promise<void> {
    await this.dispatch('ALERT_HEALTH', { severity, message }, 'health', 'CRITICAL');
  }

  /**
   * REGIME EVENTS
   */
  async regimeChange(newRegime: string, score: number, reason: string): Promise<void> {
    await this.dispatch('REGIME_CHANGE', { newRegime, score, reason }, 'regime-engine', 'HIGH');
  }

  /**
   * NARRATIVE EVENTS
   */
  async narrativeDetected(name: string, strength: number, acceleration: number): Promise<void> {
    await this.dispatch('NARRATIVE_DETECTED', { name, strength, acceleration }, 'narrative-engine', 'NORMAL');
  }

  async narrativeRotation(from: string, to: string): Promise<void> {
    await this.dispatch('NARRATIVE_ROTATION', { from, to }, 'narrative-engine', 'HIGH');
  }

  async narrativeExhaustion(name: string): Promise<void> {
    await this.dispatch('NARRATIVE_EXHAUSTION', { name }, 'narrative-engine', 'NORMAL');
  }

  /**
   * WALLET EVENTS
   */
  async walletAdded(walletId: string, address: string): Promise<void> {
    await this.dispatch('WALLET_ADDED', { walletId, address }, 'wallet-service', 'NORMAL');
  }

  async walletSelected(walletId: string): Promise<void> {
    await this.dispatch('WALLET_SELECTED', { walletId }, 'wallet-service', 'NORMAL');
  }

  async walletStrategyChanged(walletId: string, strategy: string): Promise<void> {
    await this.dispatch('WALLET_STRATEGY_CHANGED', { walletId, strategy }, 'wallet-service', 'NORMAL');
  }

  /**
   * OUTCOME EVENTS
   * Trade results
   */
  async outcomeRecorded(
    walletId: string,
    token: string,
    pnl: number,
    pnlPercent: number,
    holdTime: number,
    signals: string[],
  ): Promise<void> {
    await this.dispatch(
      'OUTCOME_RECORDED',
      { walletId, token, pnl, pnlPercent, holdTime, signals },
      'learning-engine',
      'NORMAL',
    );
  }

  /**
   * LOGGING
   */
  private logEvent(event: SystemEvent): void {
    this.eventLog.push(event);

    // Keep log size bounded
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }
  }

  /**
   * QUERY
   * Get event history
   */
  getEventHistory(filter?: { type?: string; source?: string; limit?: number }): SystemEvent[] {
    let events = [...this.eventLog];

    if (filter?.type) {
      events = events.filter((e) => e.type === filter.type);
    }

    if (filter?.source) {
      events = events.filter((e) => e.source === filter.source);
    }

    const limit = filter?.limit || 100;
    return events.slice(-limit);
  }

  /**
   * STATISTICS
   */
  getStatistics() {
    const eventTypeCounts: Record<string, number> = {};

    for (const event of this.eventLog) {
      eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
    }

    return {
      totalEvents: this.eventLog.length,
      uniqueTypes: Object.keys(eventTypeCounts).length,
      topEvents: Object.entries(eventTypeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10),
      subscriberCount: this.subscriptions.size,
      queuedEvents: this.eventQueue.length,
    };
  }

  /**
   * REPLAY
   * Replay events (for testing/debugging)
   */
  async replay(events: SystemEvent[]): Promise<void> {
    for (const event of events) {
      await this.processEvent(event);
    }
  }

  /**
   * CLEAR
   * Clear logs (for testing)
   */
  clearLog(): void {
    this.eventLog = [];
  }

  // Helper for legacy EventEmitter
  private eventEmitter(type: string, event: SystemEvent): void {
    this.emit(type, event);
  }
}

// Export singleton
export const eventOrchestrator = new EventOrchestrator();
