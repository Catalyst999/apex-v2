// File path: src/core/routing/ai-task-router.ts
/**
 * AI TASK ROUTER - Enforce Strict AI Boundaries
 * Routes tasks to correct AI/hardcoded layer
 * Prevents AI overreach, reduces token costs dramatically
 */

import { runtimeState } from '../state/runtime-state';
import { eventOrchestrator } from './event-orchestrator';

export type AIProvider = 'HARDCODED' | 'HAIKU' | 'GROK';

export interface AITask {
  id: string;
  type: string;
  provider: AIProvider;
  tokens?: number;
  createdAt: number;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: any;
  error?: string;
}

class AITaskRouter {
  private taskQueue: Map<string, AITask> = new Map();
  private haikuQueue: AITask[] = [];
  private grokQueue: AITask[] = [];

  /**
   * ROUTE TASK
   * Determine which AI (or hardcoded) should handle this
   */
  routeTask(type: string, payload: any): { provider: AIProvider; cost: number } {
    // HARDCODED TASKS - NO AI
    if (
      [
        'FILTER_TOKEN',
        'SCORE_SIGNAL',
        'CALCULATE_POSITION',
        'CHECK_RISK',
        'ROUTE_EVENT',
        'VALIDATE_TRADE',
        'CALCULATE_CONVICTION',
        'TRACK_OUTCOME',
      ].includes(type)
    ) {
      return { provider: 'HARDCODED', cost: 0 };
    }

    // HAIKU TASKS - Reasoning, summaries, explanations
    if (
      [
        'EXPLAIN_SIGNAL',
        'SUMMARIZE_TRADES',
        'GENERATE_TRADE_NOTE',
        'ANALYZE_CONVICTION',
        'BEHAVIORAL_ANALYSIS',
        'EDGE_CASE_EVALUATION',
        'GENERATE_DAILY_SUMMARY',
        'PSYCHOLOGICAL_INSIGHT',
      ].includes(type)
    ) {
      return { provider: 'HAIKU', cost: 500 }; // avg tokens
    }

    // GROK TASKS - Social, narrative, sentiment
    if (
      [
        'EXTRACT_NARRATIVE',
        'ANALYZE_SOCIAL',
        'TRACK_INFLUENCER',
        'SENTIMENT_ANALYSIS',
        'NARRATIVE_VELOCITY',
        'ATTENTION_FLOW',
        'ECOSYSTEM_ROTATION',
        'TREND_EXTRACTION',
      ].includes(type)
    ) {
      return { provider: 'GROK', cost: 1000 }; // avg tokens
    }

    // Default to hardcoded if unknown
    console.warn(`[AIRouter] Unknown task type: ${type}, defaulting to HARDCODED`);
    return { provider: 'HARDCODED', cost: 0 };
  }

  /**
   * QUEUE TASK
   * Check budget and queue task
   */
  async queueTask(
    type: string,
    payload: any,
    priority: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL',
  ): Promise<string | null> {
    const { provider, cost } = this.routeTask(type, payload);
    const budget = runtimeState.getAIBudgetState();

    // Hardcoded tasks always succeed
    if (provider === 'HARDCODED') {
      const taskId = `task-${Date.now()}-${Math.random()}`;
      this.taskQueue.set(taskId, {
        id: taskId,
        type,
        provider,
        tokens: 0,
        createdAt: Date.now(),
        status: 'COMPLETED',
        result: { immediate: true, deferToHardcoded: true },
      });
      return taskId;
    }

    // Check AI budgets
    if (provider === 'HAIKU') {
      if (!budget || budget.haikuTokensUsed + cost > budget.haikuTokensLimit) {
        console.warn('[AIRouter] Haiku budget exceeded, skipping task');
        await eventOrchestrator.alertHealth('WARNING', `Haiku token budget exceeded for: ${type}`);
        return null;
      }

      if (!runtimeState.consumeHaikuTokens(cost)) {
        console.warn('[AIRouter] Failed to consume Haiku tokens');
        return null;
      }
    } else if (provider === 'GROK') {
      if (!budget || budget.grokTokensUsed + cost > budget.grokTokensLimit) {
        console.warn('[AIRouter] Grok budget exceeded, skipping task');
        await eventOrchestrator.alertHealth('WARNING', `Grok token budget exceeded for: ${type}`);
        return null;
      }

      if (!runtimeState.consumeGrokTokens(cost)) {
        console.warn('[AIRouter] Failed to consume Grok tokens');
        return null;
      }
    }

    // Create task
    const taskId = `task-${Date.now()}-${Math.random()}`;
    const task: AITask = {
      id: taskId,
      type,
      provider,
      tokens: cost,
      createdAt: Date.now(),
      status: 'QUEUED',
    };

    this.taskQueue.set(taskId, task);

    // Add to provider-specific queue
    if (provider === 'HAIKU') {
      this.haikuQueue.push(task);
    } else if (provider === 'GROK') {
      this.grokQueue.push(task);
    }

    console.log(`[AIRouter] Task queued: ${type} → ${provider} (${cost} tokens)`);

    return taskId;
  }

  /**
   * GET TASK
   * Retrieve task by ID
   */
  getTask(taskId: string): AITask | undefined {
    return this.taskQueue.get(taskId);
  }

  /**
   * COMPLETE TASK
   * Mark task as completed
   */
  completeTask(taskId: string, result: any): void {
    const task = this.taskQueue.get(taskId);
    if (task) {
      task.status = 'COMPLETED';
      task.result = result;
      console.log(`[AIRouter] Task completed: ${task.type}`);
    }
  }

  /**
   * FAIL TASK
   * Mark task as failed
   */
  failTask(taskId: string, error: string): void {
    const task = this.taskQueue.get(taskId);
    if (task) {
      task.status = 'FAILED';
      task.error = error;
      console.error(`[AIRouter] Task failed: ${task.type} - ${error}`);
    }
  }

  /**
   * GET NEXT HAIKU TASK
   */
  getNextHaikuTask(): AITask | undefined {
    return this.haikuQueue.shift();
  }

  /**
   * GET NEXT GROK TASK
   */
  getNextGrokTask(): AITask | undefined {
    return this.grokQueue.shift();
  }

  /**
   * BUDGET REPORT
   */
  getBudgetReport() {
    const budget = runtimeState.getAIBudgetState();
    if (!budget) return null;

    return {
      haiku: {
        used: budget.haikuTokensUsed,
        limit: budget.haikuTokensLimit,
        remaining: budget.haikuTokensLimit - budget.haikuTokensUsed,
        percentUsed: (budget.haikuTokensUsed / budget.haikuTokensLimit) * 100,
      },
      grok: {
        used: budget.grokTokensUsed,
        limit: budget.grokTokensLimit,
        remaining: budget.grokTokensLimit - budget.grokTokensUsed,
        percentUsed: (budget.grokTokensUsed / budget.grokTokensLimit) * 100,
      },
      lastReset: budget.lastResetAt,
    };
  }

  /**
   * QUEUE STATS
   */
  getQueueStats() {
    return {
      totalQueued: this.taskQueue.size,
      haikuQueued: this.haikuQueue.length,
      grokQueued: this.grokQueue.length,
      completed: Array.from(this.taskQueue.values()).filter((t) => t.status === 'COMPLETED').length,
      failed: Array.from(this.taskQueue.values()).filter((t) => t.status === 'FAILED').length,
    };
  }

  /**
   * ENFORCE BOUNDARIES
   * Prevents AI from being used where it shouldn't
   */
  enforceHardcodedOnly(type: string): boolean {
    const hardcodedOnlyTasks = [
      'FILTER_TOKEN',
      'SCORE_SIGNAL',
      'CALCULATE_POSITION',
      'CHECK_RISK',
      'ROUTE_EVENT',
      'VALIDATE_TRADE',
      'CALCULATE_CONVICTION',
    ];

    return hardcodedOnlyTasks.includes(type);
  }

  /**
   * EXPLAIN DECISION
   * Why was this routed to this provider?
   */
  explainRouting(type: string): string {
    const { provider, cost } = this.routeTask(type, {});

    if (provider === 'HARDCODED') {
      return `${type} is a HARDCODED task (deterministic, zero cost, instant)`;
    } else if (provider === 'HAIKU') {
      return `${type} requires HAIKU reasoning (~${cost} tokens) for behavioral interpretation`;
    } else if (provider === 'GROK') {
      return `${type} requires GROK analysis (~${cost} tokens) for social/narrative extraction`;
    }

    return 'Unknown routing decision';
  }
}

// Export singleton
export const aiTaskRouter = new AITaskRouter();
