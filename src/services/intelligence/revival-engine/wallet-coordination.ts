// src/services/intelligence/revival-engine/wallet-coordination.ts
import { eventOrchestrator } from '../../../core/routing/event-orchestrator';

export interface WalletCoordination {
  token: string;
  coordinationScore: number; // 0-100
  walletCount: number;
  similarAmounts: number;
  timingCluster: number;
  confidence: number;
}

class WalletCoordinationAnalyzer {
  async analyzeCoordination(
    token: string,
    recentBuyers: any[],
    recentAmounts: number[],
  ): Promise<WalletCoordination> {
    let coordinationScore = 0;
    const walletCount = recentBuyers.length;

    // Wallet clustering (multiple wallets in short time)
    if (walletCount > 20) coordinationScore += 35;
    else if (walletCount > 10) coordinationScore += 20;
    else if (walletCount > 5) coordinationScore += 10;

    // Similar amounts (mirror buys = coordination signal)
    const avgAmount = recentAmounts.reduce((a, b) => a + b, 0) / recentAmounts.length;
    const standardDev = Math.sqrt(
      recentAmounts.reduce((sq, n) => sq + Math.pow(n - avgAmount, 2), 0) / recentAmounts.length,
    );
    const coefficientOfVariation = standardDev / avgAmount;

    if (coefficientOfVariation < 0.2) coordinationScore += 30; // Very similar
    else if (coefficientOfVariation < 0.5) coordinationScore += 15;

    // Timing cluster (buys within short window)
    const timingGaps = recentBuyers
      .slice(1)
      .map((b, i) => b.timestamp - recentBuyers[i].timestamp);
    const avgGap = timingGaps.reduce((a, b) => a + b, 0) / timingGaps.length;

    if (avgGap < 10000) coordinationScore += 25; // Within 10 seconds
    else if (avgGap < 30000) coordinationScore += 12;

    const coordination: WalletCoordination = {
      token,
      coordinationScore: Math.min(100, coordinationScore),
      walletCount,
      similarAmounts: recentAmounts.filter(a => Math.abs(a - avgAmount) < avgAmount * 0.3).length,
      timingCluster: avgGap,
      confidence: walletCount > 5 ? 0.85 : 0.5,
    };

    if (coordinationScore > 60) {
      await eventOrchestrator.revivalEvent(
        'COORDINATION',
        token,
        {
          walletCount,
          coordinationScore,
          confidence: coordination.confidence,
          priority: 'HIGH',
        },
      );
    }

    return coordination;
  }
}

export const walletCoordinationAnalyzer = new WalletCoordinationAnalyzer();