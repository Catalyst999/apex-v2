// File path: src/services/execution/trailing-stop-engine.ts
/**
 * TRAILING STOP ENGINE
 * Automatically moves stops with price
 * Locks in profits, gives upside room
 */

import { positionManager, ManagedPosition } from './position-manager';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

class TrailingStopEngine {
  private trailingStopPercent = 3; // 3% trailing distance

  /**
   * UPDATE TRAILING STOPS
   * Called on price update
   */
  updateTrailingStops(positions: ManagedPosition[]): void {
    for (const position of positions) {
      this.updateTrailingStop(position);
    }
  }

  /**
   * UPDATE SINGLE TRAILING STOP
   */
  private updateTrailingStop(position: ManagedPosition): void {
    if (position.status !== 'OPEN') return;

    const currentPrice = position.currentPrice;
    const highWaterMark = Math.max(position.entryPrice, currentPrice); // highest price seen
    const newTrailingStop = highWaterMark * (1 - this.trailingStopPercent / 100);

    // Only move stop UP (tighter), never down (looser)
    if (newTrailingStop > position.trailingStop) {
      const oldStop = position.trailingStop;
      position.trailingStop = newTrailingStop;

      console.log(
        `[TrailingStop] ${position.token} stop moved: $${oldStop.toFixed(8)} → $${newTrailingStop.toFixed(8)}`,
      );
    }

    // Check if hit
    if (currentPrice <= position.trailingStop && position.status === 'OPEN') {
      position.status = 'AT_STOP_LOSS';
      console.log(`[TrailingStop] 🛑 ${position.token} hit trailing stop at $${currentPrice.toFixed(8)}`);
    }
  }

  /**
   * GET TRAILING STOP DISTANCE
   */
  getTrailingStopDistance(position: ManagedPosition): number {
    return position.currentPrice - position.trailingStop;
  }

  /**
   * CALCULATE STOP FOR PROFIT LEVEL
   * Different stop % based on profit
   */
  calculateStopForProfitLevel(position: ManagedPosition): number {
    const profitPercent = position.pnlPercent;

    if (profitPercent < 0) {
      return position.entryPrice * 0.97; // 3% below entry
    } else if (profitPercent < 5) {
      return position.entryPrice * 0.98; // 2% below entry
    } else if (profitPercent < 10) {
      return position.entryPrice; // breakeven
    } else if (profitPercent < 25) {
      return position.entryPrice * 1.05; // 5% above entry
    } else {
      return position.entryPrice * 1.10; // 10% above entry
    }
  }

  /**
   * AGGRESSIVE TRAILING
   * 5% trail for fast movers
   */
  enableAggressiveTrail(positionId: string): void {
    const position = positionManager.getPosition(positionId);
    if (position) {
      this.trailingStopPercent = 5;
      console.log(`[TrailingStop] 🏃 Aggressive trailing enabled for ${position.token}`);
    }
  }

  /**
   * CONSERVATIVE TRAILING
   * 2% trail for steady positions
   */
  enableConservativeTrail(positionId: string): void {
    const position = positionManager.getPosition(positionId);
    if (position) {
      this.trailingStopPercent = 2;
      console.log(`[TrailingStop] 🛡️ Conservative trailing enabled for ${position.token}`);
    }
  }
}

export const trailingStopEngine = new TrailingStopEngine();