// src/services/rpc/helius-websocket-monitor.ts
/**
 * HELIUS WEBSOCKET MONITOR
 * Real-time event subscriptions for critical tokens
 * Dynamic subscription management with TTL cleanup
 */

import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import { HELIUS } from '../../core/config';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export interface SubscriptionInfo {
  token: string;
  subscriptionId: number;
  addedAt: number;
  lastActivity: number;
  ttl: number; // milliseconds
}

class HeliusWebsocketMonitor {
  private connection: Connection;
  private subscriptions: Map<string, SubscriptionInfo> = new Map();
  private maxSubscriptions: number = 50;
  private subscriptionTtl: number = 3600000; // 1 hour default
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS.API_KEY}`;
    this.connection = new Connection(wsUrl, 'confirmed');
    this.startCleanupLoop();
  }

  /**
   * SUBSCRIBE TO TOKEN ACCOUNT
   */
  async subscribeToToken(
    mint: string,
    callback: (info: any) => void,
  ): Promise<number> {
    if (this.subscriptions.size >= this.maxSubscriptions) {
      console.warn('[HeliusWS] Max subscriptions reached, removing oldest...');
      this.removeOldestSubscription();
    }

    try {
      const pubkey = new PublicKey(mint);
      const subId = this.connection.onAccountChange(
        pubkey,
        callback,
        'confirmed' as Commitment,
      );

      this.subscriptions.set(mint, {
        token: mint,
        subscriptionId: subId,
        addedAt: Date.now(),
        lastActivity: Date.now(),
        ttl: this.subscriptionTtl,
      });

      console.log(`[HeliusWS] ✓ Subscribed to ${mint.slice(0, 8)}...`);
      return subId;
    } catch (error) {
      console.error('[HeliusWS] Subscribe failed:', error);
      throw error;
    }
  }

  /**
   * SUBSCRIBE TO WALLET ACTIVITY
   */
  async subscribeToWallet(
    address: string,
    callback: (logs: any) => void,
  ): Promise<number> {
    try {
      const pubkey = new PublicKey(address);
      const subId = this.connection.onLogs(
        pubkey,
        callback,
        'confirmed' as Commitment,
      );

      console.log(`[HeliusWS] ✓ Subscribed to wallet ${address.slice(0, 8)}...`);
      return subId;
    } catch (error) {
      console.error('[HeliusWS] Wallet subscribe failed:', error);
      throw error;
    }
  }

  /**
   * UNSUBSCRIBE FROM TOKEN
   */
  unsubscribeFromToken(mint: string): void {
    const sub = this.subscriptions.get(mint);
    if (sub) {
      this.connection.removeAccountChangeListener(sub.subscriptionId);
      this.subscriptions.delete(mint);
      console.log(`[HeliusWS] ✗ Unsubscribed from ${mint.slice(0, 8)}...`);
    }
  }

  /**
   * UPDATE LAST ACTIVITY
   */
  updateActivity(mint: string): void {
    const sub = this.subscriptions.get(mint);
    if (sub) {
      sub.lastActivity = Date.now();
    }
  }

  /**
   * CLEANUP LOOP
   * Remove expired subscriptions
   */
  private startCleanupLoop(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // Every minute
  }

  private performCleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [mint, sub] of this.subscriptions.entries()) {
      const age = now - sub.lastActivity;
      if (age > sub.ttl) {
        expired.push(mint);
      }
    }

    for (const mint of expired) {
      console.log(`[HeliusWS] Cleaning up expired sub: ${mint.slice(0, 8)}...`);
      this.unsubscribeFromToken(mint);
      eventOrchestrator.dispatch(
        'WEBSOCKET_SUBSCRIPTION_EXPIRED',
        { token: mint },
        'helius-websocket',
        'NORMAL',
      );
    }
  }

  /**
   * REMOVE OLDEST SUBSCRIPTION
   */
  private removeOldestSubscription(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [mint, sub] of this.subscriptions.entries()) {
      if (sub.lastActivity < oldestTime) {
        oldestTime = sub.lastActivity;
        oldest = mint;
      }
    }

    if (oldest) {
      this.unsubscribeFromToken(oldest);
    }
  }

  /**
   * GET ACTIVE SUBSCRIPTIONS
   */
  getActiveSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * GET SUBSCRIPTION COUNT
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * GET STATUS
   */
  getStatus() {
    return {
      activeSubscriptions: this.subscriptions.size,
      maxSubscriptions: this.maxSubscriptions,
      subscriptions: Array.from(this.subscriptions.values()).map(s => ({
        token: s.token,
        age: Date.now() - s.addedAt,
        lastActivity: Date.now() - s.lastActivity,
      })),
      type: 'HELIUS_WEBSOCKET_MONITOR',
    };
  }

  /**
   * SHUTDOWN
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    for (const mint of this.subscriptions.keys()) {
      this.unsubscribeFromToken(mint);
    }
    console.log('[HeliusWS] Shutdown complete');
  }
}

export const heliusWebsocketMonitor = new HeliusWebsocketMonitor();