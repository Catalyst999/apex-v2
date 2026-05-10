// src/services/intelligence/revival-engine/revival-watchlist.ts
import { runtimeState } from '../../../core/state/runtime-state';
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';
import { REVIVAL_ENGINE } from '../../../core/config';

export interface WatchlistEntry {
  token: string;
  addedAt: number;
  dormancyScore: number;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  source: 'HISTORICAL' | 'COMMUNITY' | 'DETECTED';
}

class RevivalWatchlist {
  private watchlist: Map<string, WatchlistEntry> = new Map();
  private maxSize: number = REVIVAL_ENGINE.MAX_WATCHLIST_SIZE;

  /**
   * ADD TO WATCHLIST
   */
  async addToken(
    token: string,
    dormancyScore: number,
    source: 'HISTORICAL' | 'COMMUNITY' | 'DETECTED',
  ): Promise<void> {
    if (this.watchlist.size >= this.maxSize) {
      this.removeLowPriority();
    }

    const entry: WatchlistEntry = {
      token,
      addedAt: Date.now(),
      dormancyScore,
      priority: dormancyScore > 80 ? 'HIGH' : dormancyScore > 50 ? 'NORMAL' : 'LOW',
      source,
    };

    this.watchlist.set(token, entry);

    await eventOrchestrator.revivalEvent(
      'WATCHLIST_UPDATE',
      token,
      {
        action: 'added',
        source,
        dormancyScore,
        priority: entry.priority,
      },
    );

    console.log(`[Watchlist] + ${token} (${entry.priority})`);
  }

  /**
   * REMOVE FROM WATCHLIST
   */
  async removeToken(token: string, reason: string): Promise<void> {
    this.watchlist.delete(token);

    await eventOrchestrator.revivalEvent(
      'WATCHLIST_UPDATE',
      token,
      {
        action: 'removed',
        reason,
      },
    );

    console.log(`[Watchlist] - ${token} (${reason})`);
  }

  /**
   * PROMOTE IN PRIORITY
   */
  async promoteToken(token: string): Promise<void> {
    const entry = this.watchlist.get(token);
    if (entry) {
      if (entry.priority === 'LOW') entry.priority = 'NORMAL';
      else if (entry.priority === 'NORMAL') entry.priority = 'HIGH';

      await eventOrchestrator.revivalEvent(
        'WATCHLIST_UPDATE',
        token,
        {
          action: 'promoted',
          newPriority: entry.priority,
        },
      );
    }
  }

  /**
   * GET WATCHLIST
   */
  getWatchlist(): WatchlistEntry[] {
    return Array.from(this.watchlist.values()).sort(
      (a, b) => b.dormancyScore - a.dormancyScore,
    );
  }

  /**
   * GET BY PRIORITY
   */
  getByPriority(priority: 'HIGH' | 'NORMAL' | 'LOW'): WatchlistEntry[] {
    return Array.from(this.watchlist.values()).filter(e => e.priority === priority);
  }

  /**
   * REMOVE LOW PRIORITY
   */
  private removeLowPriority(): void {
    const toRemove = Array.from(this.watchlist.entries())
      .filter(([_, e]) => e.priority === 'LOW')
      .sort((a, b) => a[1].addedAt - b[1].addedAt)
      .slice(0, 10);

    for (const [token] of toRemove) {
      this.watchlist.delete(token);
    }

    console.log(`[Watchlist] Removed ${toRemove.length} low-priority entries`);
  }

  /**
   * GET SIZE
   */
  getSize(): number {
    return this.watchlist.size;
  }
}

export const revivalWatchlist = new RevivalWatchlist();