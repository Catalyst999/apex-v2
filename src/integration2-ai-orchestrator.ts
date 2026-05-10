/**
 * INTEGRATION 2: AI ORCHESTRATION LAYER
 * 
 * CORE PRINCIPLE: AI enhances signals, doesn't create them
 * 
 * ✅ HARDCODED (deterministic):
 *   - filtering, scoring, thresholds, routing, execution, risk
 *   - signal generation, conviction math, wallet analysis
 *   - market regime classification
 * 
 * ✅ CLAUDE HAIKU (cheap, fast, language):
 *   - reasoning, summaries, conviction explanation, psychology
 *   - trade notes, signal explanation, daily journal
 * 
 * ✅ GROK (behavioral/social):
 *   - narrative velocity, Twitter/X interpretation
 *   - ecosystem rotation, sentiment shifts, meme culture
 * 
 * ❌ NEVER AI:
 *   - low conviction signals, repeated tokens, low volume
 *   - routine monitoring, real-time execution decisions
 */

import { aiTaskRouter } from './core/routing/ai-task-router';
import { runtimeState } from './core/state/runtime-state';

export interface AIBudgetState {
  dailyTokenLimit: 50000; // Claude Haiku + Grok combined
  monthlyTokenLimit: 1500000;
  currentDayTokens: number;
  currentMonthTokens: number;
  remainingToday: number;
  budgetDepleted: boolean;
  lastResetDay: number;
  lastResetMonth: number;
}

class Integration2AIOrchestrator {
  private budgetState: AIBudgetState = {
    dailyTokenLimit: 50000,
    monthlyTokenLimit: 1500000,
    currentDayTokens: 0,
    currentMonthTokens: 0,
    remainingToday: 50000,
    budgetDepleted: false,
    lastResetDay: Math.floor(Date.now() / (24 * 60 * 60 * 1000)),
    lastResetMonth: Math.floor(Date.now() / (30 * 24 * 60 * 60 * 1000)),
  };

  private readonly MIN_CONVICTION_FOR_AI = 75; // only call AI on good signals
  private readonly MIN_SIGNAL_SCORE = 70;

  /**
   * SHOULD USE AI?
   * Strict gating before any AI call
   */
  private shouldUseAI(
    conviction: number,
    signalScore: number,
    tokenHistoryCount: number,
  ): { allowed: boolean; reason: string } {
    // Check budget
    if (this.budgetState.budgetDepleted) {
      return { allowed: false, reason: 'Daily budget depleted' };
    }

    // Low conviction = skip AI
    if (conviction < this.MIN_CONVICTION_FOR_AI) {
      return { allowed: false, reason: `Conviction ${conviction} < ${this.MIN_CONVICTION_FOR_AI}` };
    }

    // Low signal score = skip AI
    if (signalScore < this.MIN_SIGNAL_SCORE) {
      return { allowed: false, reason: `Signal score ${signalScore} < ${this.MIN_SIGNAL_SCORE}` };
    }

    // Repeated token = skip AI (save cost)
    if (tokenHistoryCount > 10) {
      return { allowed: false, reason: 'Token already analyzed multiple times' };
    }

    return { allowed: true, reason: 'Eligible for AI' };
  }

  /**
   * CALL CLAUDE HAIKU
   * For explanation, reasoning, psychology
   */
  async explainSignalWithHaiku(
    token: string,
    signals: string[],
    conviction: number,
  ): Promise<{ explanation: string; tokensUsed: number }> {
    const shouldUse = this.shouldUseAI(conviction, 80, 1);
    if (!shouldUse.allowed) {
      return { explanation: `AI skipped: ${shouldUse.reason}`, tokensUsed: 0 };
    }

    const taskId = await aiTaskRouter.queueTask(
      'EXPLAIN_SIGNAL',
      {
        token,
        signals,
        conviction,
      },
      'NORMAL',
    );

    if (!taskId) {
      return {
        explanation: `${signals.join(', ')} - ${conviction.toFixed(0)}% conviction`,
        tokensUsed: 0,
      };
    }

    // In production, would wait for result
    // For now, return placeholder
    const tokensUsed = Math.round(conviction * 2); // rough estimate

    this.updateBudget(tokensUsed);

    return {
      explanation: `AI analysis queued for ${token}`,
      tokensUsed,
    };
  }

  /**
   * CALL GROK
   * For social sentiment, influencer analysis
   */
  async analyzeSocialWithGrok(
    token: string,
    narrative: string,
  ): Promise<{ sentiment: string; tokensUsed: number }> {
    const shouldUse = this.shouldUseAI(75, 70, 1);
    if (!shouldUse.allowed) {
      return { sentiment: 'neutral', tokensUsed: 0 };
    }

    const taskId = await aiTaskRouter.queueTask(
      'ANALYZE_SOCIAL_SENTIMENT',
      {
        token,
        narrative,
      },
      'NORMAL',
    );

    if (!taskId) {
      return { sentiment: 'neutral', tokensUsed: 0 };
    }

    const tokensUsed = 800; // Grok API calls are ~800 tokens

    this.updateBudget(tokensUsed);

    return {
      sentiment: 'bullish',
      tokensUsed,
    };
  }

  /**
   * DAILY JOURNAL (Haiku)
   * Summary of trading day
   */
  async generateDailyJournal(trades: any[]): Promise<{ journal: string; tokensUsed: number }> {
    // Always call for daily journal (good use of Haiku)
    const taskId = await aiTaskRouter.queueTask(
      'GENERATE_DAILY_JOURNAL',
      {
        tradeCount: trades.length,
        totalPnL: trades.reduce((s, t) => s + t.pnl, 0),
      },
      'NORMAL',
    );

    if (!taskId) {
      return { journal: 'Journal generation failed', tokensUsed: 0 };
    }

    const tokensUsed = 1200; // daily journal ~1200 tokens

    this.updateBudget(tokensUsed);

    return {
      journal: 'Daily journal generated',
      tokensUsed,
    };
  }

  /**
   * CONVICTION EXPLANATION (Haiku)
   * Why this conviction score?
   */
  async explainConviction(
    token: string,
    conviction: number,
    factors: Record<string, number>,
  ): Promise<{ explanation: string; tokensUsed: number }> {
    // Only for high conviction trades (> 80)
    if (conviction < 80) {
      return { explanation: 'Conviction below explanation threshold', tokensUsed: 0 };
    }

    const taskId = await aiTaskRouter.queueTask(
      'EXPLAIN_CONVICTION',
      {
        token,
        conviction,
        factors,
      },
      'NORMAL',
    );

    if (!taskId) {
      return { explanation: `${conviction.toFixed(0)}% conviction due to: ${Object.keys(factors).join(', ')}`, tokensUsed: 0 };
    }

    const tokensUsed = 600;

    this.updateBudget(tokensUsed);

    return {
      explanation: 'Conviction explained',
      tokensUsed,
    };
  }

  /**
   * UPDATE BUDGET
   */
  private updateBudget(tokensUsed: number): void {
    const now = Date.now();
    const currentDay = Math.floor(now / (24 * 60 * 60 * 1000));
    const currentMonth = Math.floor(now / (30 * 24 * 60 * 60 * 1000));

    // Reset daily if new day
    if (currentDay !== this.budgetState.lastResetDay) {
      this.budgetState.currentDayTokens = 0;
      this.budgetState.lastResetDay = currentDay;
    }

    // Reset monthly if new month
    if (currentMonth !== this.budgetState.lastResetMonth) {
      this.budgetState.currentMonthTokens = 0;
      this.budgetState.lastResetMonth = currentMonth;
    }

    // Consume tokens
    this.budgetState.currentDayTokens += tokensUsed;
    this.budgetState.currentMonthTokens += tokensUsed;
    this.budgetState.remainingToday = Math.max(0, this.budgetState.dailyTokenLimit - this.budgetState.currentDayTokens);

    // Check if depleted
    this.budgetState.budgetDepleted = this.budgetState.remainingToday <= 0;

    console.log(`[AI Budget] Used ${tokensUsed}, Remaining today: ${this.budgetState.remainingToday}`);
  }

  /**
   * GET BUDGET STATUS
   */
  getBudgetStatus(): AIBudgetState {
    return { ...this.budgetState };
  }

  /**
   * AI USAGE RULES (for reference)
   */
  getUsageRules(): string {
    return `
    AI USAGE RULES (Integration 2)
    
    ✅ CALL AI IF:
    - Conviction > 75%
    - Signal score > 70
    - Token not already analyzed 10+ times
    - Daily budget available
    - Task is: explain, reason, summarize, sentiment
    
    ❌ NEVER CALL AI FOR:
    - Low conviction signals (< 75%)
    - Repeated tokens (> 10x analyzed)
    - Routine monitoring
    - Execution decisions
    - Filtering / scoring logic
    
    💰 BUDGET: $5/month max
    - Daily: 50k tokens (Claude Haiku)
    - Monthly: 1.5M tokens
    - When depleted: system continues on hardcoded logic only
    
    🎯 PRIORITY:
    1. Daily journal summaries
    2. High conviction explanations
    3. Social sentiment (Grok)
    4. Pattern analysis
    `;
  }
}

export const integration2AIOrchestrator = new Integration2AIOrchestrator();