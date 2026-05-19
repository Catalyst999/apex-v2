// File path: src/services/events/event-bus.ts
/**
 * EVENT BUS - CENTRAL EVENT PIPELINE
 * All signals flow through this bus for logging, replay, and analysis
 */

import { supabase } from '../../db/supabase';
import { SignalEvent } from './signal-types';

export interface EventStats {
  totalEvents: number;
  subscriptions: number;
}

export interface EventRecord {
  id: string;
  type: string;
  payload: unknown;
  timestamp: string;
  source?: string;
  wallet_id?: string;
}

type EventHandler = (event: SignalEvent) => void | Promise<void>;

type EmitPayload = SignalEvent | { type: string; [key: string]: any };

class EventBus {
  private subscriptions: Map<string, EventHandler[]> = new Map();
  private eventCount: number = 0;

  /**
   * Emit an event to all subscribers and log to database
   */
  async emit(eventOrType: EmitPayload | string, payload?: Record<string, any>): Promise<void> {
    const event: SignalEvent = typeof eventOrType === 'string'
      ? { ...(payload || {}), type: eventOrType, timestamp: (payload?.timestamp ?? Date.now()) } as SignalEvent
      : (eventOrType as SignalEvent);

    try {
      // Log to database
      const { error } = await supabase
        .from('events')
        .insert({
          type: event.type,
          payload: event,
          timestamp: new Date(event.timestamp),
          source: 'payload' in event ? (event as any).source : undefined,
          wallet_id: 'walletId' in event ? (event as any).walletId : undefined,
        });

      if (error) {
        console.error('[EventBus] Failed to log event:', error);
      } else {
        this.eventCount++;
      }

      // Notify subscribers
      const handlers = this.subscriptions.get(event.type) || [];
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error(`[EventBus] Handler error for ${event.type}:`, err);
        }
      }

      console.log(`[EventBus] Emitted ${event.type}`);
    } catch (error) {
      console.error('[EventBus] Emit error:', error);
    }
  }

  /**
   * Subscribe to an event type
   */
  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType)!.push(handler);
  }

  /**
   * Unsubscribe from an event type
   */
  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.subscriptions.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get event statistics
   */
  async getStats(): Promise<EventStats> {
    try {
      const { count, error } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('[EventBus] Stats error:', error);
        return { totalEvents: this.eventCount, subscriptions: this.subscriptions.size };
      }

      return {
        totalEvents: count || 0,
        subscriptions: this.subscriptions.size,
      };
    } catch (error) {
      console.error('[EventBus] Stats error:', error);
      return { totalEvents: this.eventCount, subscriptions: this.subscriptions.size };
    }
  }

  /**
   * Get recent event history
   */
  async getHistory(limit: number = 10): Promise<EventRecord[]> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[EventBus] History error:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        timestamp: row.timestamp,
        source: row.source,
        wallet_id: row.wallet_id,
      }));
    } catch (error) {
      console.error('[EventBus] History error:', error);
      return [];
    }
  }

  /**
   * Get events by type
   */
  async getEventsByType(eventType: string, limit: number = 50): Promise<EventRecord[]> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('type', eventType)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[EventBus] Get by type error:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        timestamp: row.timestamp,
        source: row.source,
        wallet_id: row.wallet_id,
      }));
    } catch (error) {
      console.error('[EventBus] Get by type error:', error);
      return [];
    }
  }
}

// Export class and singleton instance
export { EventBus };
export const eventBus = new EventBus();

// Convenience function for emitting
export async function emit(eventOrType: EmitPayload | string, payload?: Record<string, any>): Promise<void> {
  return eventBus.emit(eventOrType, payload);
}
