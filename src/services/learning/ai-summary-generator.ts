// File path: src/services/learning/ai-summary-generator.ts
/**
 * AI SUMMARY GENERATOR
 * Claude generates daily trading insights and analysis
 * Learns from journal entries to improve future trading
 */

import { aiTaskRouter } from '../../core/routing/ai-task-router';
import { tradingJournalEngine } from './trading-journal-engine';
import { positionManager } from '../execution/position-manager';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export interface DailySummary {
  date: string;
  walletId: string;
  
  // Trading results
  tradesCompleted: number;
  winRate: number;
  totalPnL: number;
  bestTrade: string;
  worstTrade: string;
  
  // Analysis
  keyInsights: string[];
  commonMistakes: string[];
  winningPatterns: string[];
  
  // Recommendations
  recommendations: string[];
  focusAreas: string[];
  
  // Journal notes
  aiNotes: string;
  
  generatedAt: number;
}

class AISummaryGenerator {
  /**
   * GENERATE DAILY SUMMARY
   * Create comprehensive daily report
   */
  async generateDailySummary(walletId: string): Promise<DailySummary> {
    // Get journal data
    const journal = tradingJournalEngine.getWalletJournal(walletId, 20);
    const stats = tradingJournalEngine.getJournalStats(walletId);
    const mistakes = tradingJournalEngine.getCommonMistakes(walletId);
    const patterns = tradingJournalEngine.getWinningPatterns(walletId);

    // Today's trades only
    const today = new Date().setHours(0, 0, 0, 0);
    const todaysTrades = journal.filter((e) => e.createdAt >= today);

    // Queue AI task for analysis
    const taskId = await aiTaskRouter.queueTask(
      'GENERATE_DAILY_SUMMARY',
      {
        tradesCount: todaysTrades.length,
        totalPnL: stats.totalPnL,
        winRate: stats.winRate,
        avgWin: stats.avgWin,
        avgLoss: stats.avgLoss,
        mistakes: mistakes.map(([m]) => m),
        patterns: patterns.map(([p]) => p),
      },
      'HIGH',
    );

    if (!taskId) {
      console.warn('[AISummary] AI task queued failed, using default summary');
    }

    // Generate base summary
    const summary: DailySummary = {
      date: new Date().toISOString().split('T')[0],
      walletId,
      tradesCompleted: todaysTrades.length,
      winRate: stats.winRate,
      totalPnL: stats.totalPnL,
      bestTrade: todaysTrades.length > 0 ? Math.max(...todaysTrades.map((t) => t.pnl)).toFixed(2) : '0',
      worstTrade: todaysTrades.length > 0 ? Math.min(...todaysTrades.map((t) => t.pnl)).toFixed(2) : '0',
      keyInsights: this.generateKeyInsights(stats, todaysTrades),
      commonMistakes: mistakes.map(([m]) => m),
      winningPatterns: patterns.map(([p]) => p),
      recommendations: this.generateRecommendations(stats),
      focusAreas: this.identifyFocusAreas(stats, mistakes),
      aiNotes: await this.generateAINotes(stats, todaysTrades, mistakes),
      generatedAt: Date.now(),
    };

    // Emit event
    await eventOrchestrator.emit(
      'DAILY_SUMMARY_GENERATED',
      summary,
      'summary-generator',
      'NORMAL',
    );

    return summary;
  }

  /**
   * GENERATE KEY INSIGHTS
   */
  private generateKeyInsights(stats: any, trades: any[]): string[] {
    const insights: string[] = [];

    if (stats.winRate > 60) {
      insights.push('🟢 Strong win rate above 60% - maintain current strategy');
    } else if (stats.winRate < 40) {
      insights.push('🔴 Win rate below 40% - strategy needs adjustment');
    }

    if (stats.profitFactor > 2) {
      insights.push('📈 Excellent profit factor - wins significantly larger than losses');
    }

    const holdTimes = trades.map((t) => t.holdTime);
    if (holdTimes.length > 0) {
      const avgHold = holdTimes.reduce((a, b) => a + b) / holdTimes.length;
      if (avgHold < 60 * 60 * 1000) {
        insights.push('⚡ Quick scalping style - average hold under 1 hour');
      }
    }

    return insights.length > 0 ? insights : ['No major insights to report'];
  }

  /**
   * GENERATE RECOMMENDATIONS
   */
  private generateRecommendations(stats: any): string[] {
    const recs: string[] = [];

    if (stats.winRate < 50) {
      recs.push('Focus on improving entry signals - current conviction may be too optimistic');
    }

    if (stats.avgLoss > Math.abs(stats.avgWin)) {
      recs.push('Tighten stop losses - losses are larger than wins');
    }

    if (stats.tradesLogged < 10) {
      recs.push('Need more sample size - log more trades for statistical significance');
    }

    recs.push('Review journal entries for common patterns before tomorrow');

    return recs;
  }

  /**
   * IDENTIFY FOCUS AREAS
   */
  private identifyFocusAreas(stats: any, mistakes: any[]): string[] {
    const areas: string[] = [];

    if (mistakes.length > 0) {
      areas.push(`Reduce: ${mistakes[0][0]}`);
    }

    if (stats.winRate < 45) {
      areas.push('Entry timing - practice identifying better entry points');
    }

    if (stats.profitFactor < 1.5) {
      areas.push('Risk management - focus on reducing average loss size');
    }

    return areas;
  }

  /**
   * GENERATE AI NOTES
   * Claude's analytical perspective
   */
  private async generateAINotes(stats: any, trades: any[], mistakes: any[]): Promise<string> {
    // This would call Claude Haiku for behavioral analysis
    // For now, return template
    return `
Today's trading session analyzed:
- ${stats.tradesLogged} trades executed
- ${stats.winRate.toFixed(1)}% win rate
- ${stats.totalPnL > 0 ? '✅' : '❌'} ${Math.abs(stats.totalPnL).toFixed(2)} P&L

Key observation: Your trades show ${stats.profitFactor > 1.5 ? 'healthy' : 'needs improvement'} risk/reward characteristics.

Most common issue: ${mistakes.length > 0 ? mistakes[0][0] : 'None identified'}

Suggestion: Focus on ${stats.winRate < 50 ? 'signal quality' : 'position management'} tomorrow.
    `.trim();
  }

  /**
   * EXPORT SUMMARY
   */
  exportSummary(summary: DailySummary): string {
    let report = `
╔════════════════════════════════════════════════════════════╗
║              DAILY TRADING SUMMARY                         ║
║              ${summary.date}                              ║
╠════════════════════════════════════════════════════════════╣

📊 TRADING RESULTS:
  Trades Completed: ${summary.tradesCompleted}
  Win Rate: ${summary.winRate.toFixed(1)}%
  Total P&L: ${summary.totalPnL > 0 ? '✅' : '❌'} $${Math.abs(summary.totalPnL).toFixed(2)}
  Best Trade: ${summary.bestTrade}
  Worst Trade: ${summary.worstTrade}

💡 KEY INSIGHTS:
${summary.keyInsights.map((i) => `  • ${i}`).join('\n')}

❌ COMMON MISTAKES:
${summary.commonMistakes.map((m) => `  • ${m}`).join('\n')}

✅ WINNING PATTERNS:
${summary.winningPatterns.map((p) => `  • ${p}`).join('\n')}

📋 RECOMMENDATIONS:
${summary.recommendations.map((r) => `  • ${r}`).join('\n')}

🎯 FOCUS AREAS:
${summary.focusAreas.map((f) => `  • ${f}`).join('\n')}

📝 AI NOTES:
${summary.aiNotes.split('\n').map((l) => `  ${l}`).join('\n')}

╚════════════════════════════════════════════════════════════╝
    `.trim();

    return report;
  }
}

export const aiSummaryGenerator = new AISummaryGenerator();