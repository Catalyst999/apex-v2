// File path: src/services/execution/dynamic-scaling-engine.ts
/**
 * DYNAMIC SCALING ENGINE
 * Intelligently adds to winning positions
 * Scales down losing positions
 * Manages position pyramiding
 */

import { runtimeState } from '../../core/state/runtime-state';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';
import { positionManager, ManagedPosition } from './position-manager';

interface ScalingDecision {
  shouldScale: boolean;
  action: 'ADD' | 'REDUCE' | 'NONE';
  reason: string;
  amount: number;
  newSize?: number;
}

class DynamicScalingEngine {
  private scalingLimits = {
    maxScaleIns: 3, // max times to add
    maxScaleOuts: 2, // max times to reduce
    minProfitToScale: 2, // 2% profit before adding
    maxExposurePercent: 40, // max % of wallet in one trade
  };

  /**
   * EVALUATE POSITION FOR SCALING
   * Decide if should add/reduce
   */
  evaluateScaling(position: ManagedPosition): ScalingDecision {
    // Check if should ADD (already profitable)
    if (position.pnlPercent > this.scalingLimits.minProfitToScale && position.scaledIn < this.scalingLimits.maxScaleIns) {
      return {
        shouldScale: true,
        action: 'ADD',
        reason: `Winning position +${position.pnlPercent.toFixed(2)}%, scaling up`,
        amount: position.positionSize * 0.5, // add 50% more
      };
    }

    // Check if should REDUCE (losing, bleeding)
    if (position.pnlPercent < -5 && position.scaledOut < this.scalingLimits.maxScaleOuts) {
      return {
        shouldScale: true,
        action: 'REDUCE',
        reason: `Position at -${Math.abs(position.pnlPercent).toFixed(2)}%, reducing exposure`,
        amount: position.positionSize * 0.25, // reduce 25%
      };
    }

    return {
      shouldScale: false,
      action: 'NONE',
      reason: 'Position not meeting scaling criteria',
      amount: 0,
    };
  }

  /**
   * EXECUTE SCALING
   * Add or remove from position
   */
  async executeScaling(position: ManagedPosition, decision: ScalingDecision): Promise<boolean> {
    if (!decision.shouldScale) return false;

    try {
      if (decision.action === 'ADD') {
        // Get current price (would come from price feed)
        const currentPrice = position.currentPrice;

        // Check risk limits
        const wallet = runtimeState.getWallet(position.walletId);
        if (!wallet) return false;

        const projectedExposure = ((position.positionSize + decision.amount) * position.leverage) / 100;
        if (projectedExposure > this.scalingLimits.maxExposurePercent) {
          console.warn(`[DynamicScaling] Would exceed exposure limits for ${position.token}`);
          return false;
        }

        // Scale up
        const success = await positionManager.scalePosition(
          position.id,
          decision.amount,
          currentPrice,
        );

        if (success) {
          await eventOrchestrator.emit(
            'POSITION_SCALED_UP',
            {
              positionId: position.id,
              token: position.token,
              previousSize: position.positionSize,
              newSize: position.positionSize + decision.amount,
              reason: decision.reason,
            },
            'scaling-engine',
            'NORMAL',
          );

          console.log(`[DynamicScaling] ✅ Added ${decision.amount} to ${position.token}`);
        }

        return success;
      } else if (decision.action === 'REDUCE') {
        // Scale down
        const success = await positionManager.reducePosition(
          position.id,
          decision.amount,
          position.currentPrice,
        );

        if (success) {
          await eventOrchestrator.emit(
            'POSITION_SCALED_DOWN',
            {
              positionId: position.id,
              token: position.token,
              previousSize: position.positionSize,
              newSize: Math.max(0, position.positionSize - decision.amount),
              reason: decision.reason,
            },
            'scaling-engine',
            'NORMAL',
          );

          console.log(`[DynamicScaling] 📉 Reduced ${decision.amount} from ${position.token}`);
        }

        return success;
      }

      return false;
    } catch (error) {
      console.error('[DynamicScaling] Execute error:', error);
      return false;
    }
  }

  /**
   * PYRAMID SCALING
   * Sophisticated multi-layer scaling
   */
  getPyramidingPlan(position: ManagedPosition) {
    const plan: Array<{ layer: number; profitTarget: number; addAmount: number }> = [];

    // Layer 1: Add at +2%
    if (position.pnlPercent > 2) {
      plan.push({
        layer: 1,
        profitTarget: 2,
        addAmount: position.positionSize * 0.25,
      });
    }

    // Layer 2: Add at +5%
    if (position.pnlPercent > 5 && position.scaledIn >= 1) {
      plan.push({
        layer: 2,
        profitTarget: 5,
        addAmount: position.positionSize * 0.15,
      });
    }

    // Layer 3: Add at +10%
    if (position.pnlPercent > 10 && position.scaledIn >= 2) {
      plan.push({
        layer: 3,
        profitTarget: 10,
        addAmount: position.positionSize * 0.1,
      });
    }

    return plan;
  }

  /**
   * PROFIT TAKING LEVELS
   * Structured exit plan
   */
  getProfitTakingLevels(position: ManagedPosition) {
    const entryPrice = position.entryPrice;
    const tp = position.takeProfit;
    const profitRange = tp - entryPrice;

    return {
      level1: {
        price: entryPrice + profitRange * 0.25,
        sellPercent: 25,
        label: 'First profit level (25% sold)',
      },
      level2: {
        price: entryPrice + profitRange * 0.50,
        sellPercent: 35,
        label: 'Halfway (35% sold)',
      },
      level3: {
        price: entryPrice + profitRange * 0.75,
        sellPercent: 25,
        label: 'Final level (25% sold)',
      },
      level4: {
        price: tp,
        sellPercent: 15,
        label: 'Target hit (15% sold or let ride)',
      },
    };
  }

  /**
   * GET SCALING STATS
   */
  getScalingStats(positionId: string) {
    const position = positionManager.getPosition(positionId);
    if (!position) return null;

    return {
      timesScaledIn: position.scaledIn,
      timesScaledOut: position.scaledOut,
      maxScalesIn: this.scalingLimits.maxScaleIns,
      maxScalesOut: this.scalingLimits.maxScaleOuts,
      canScaleMore: position.scaledIn < this.scalingLimits.maxScaleIns,
      avgEntryPrice: position.entryPrice,
      entryPrices: position.entryPrices,
    };
  }
}

export const dynamicScalingEngine = new DynamicScalingEngine();