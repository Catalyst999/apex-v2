/**
 * INFORMATION COMPRESSION
 * You're going to drown in signals later
 * This compresses 15 spam alerts into 1 clear signal
 * 
 * Problem: "BONK SIGNAL, RAYDIUM SIGNAL, BULLRUN SIGNAL, PUMP SIGNAL"
 * Solution: "SOL Meme Narrative Ignition - Strength 88, Leaders: [BONK, RAYDIUM]"
 */

export interface CompressedSignal {
  narrative: string;
  strength: number; // 0-100
  topLeaders: string[];
  supportingSignals: string[];
  timeframe: string;
  action: 'BUY' | 'SELL' | 'WATCH' | 'AVOID';
  confidence: number;
  urgency: 'immediate' | 'soon' | 'monitor' | 'casual';
}

export interface SignalCluster {
  narrative: string;
  tokens: Map<string, number>; // token -> signal count
  avgStrength: number;
  uniqueSignals: Set<string>;
  totalSignalCount: number;
  priority: number; // 0-100
}

class InformationCompressor {
  private recentSignals: Array<{ token: string; signal: string; conviction: number; timestamp: number }> = [];
  private readonly COMPRESSION_WINDOW = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RECENT = 100;

  /**
   * ADD SIGNAL
   */
  addSignal(token: string, signal: string, conviction: number): void {
    this.recentSignals.push({
      token,
      signal,
      conviction,
      timestamp: Date.now(),
    });

    // Keep only recent
    if (this.recentSignals.length > this.MAX_RECENT) {
      this.recentSignals.shift();
    }

    // Remove old signals
    const cutoff = Date.now() - this.COMPRESSION_WINDOW;
    const idx = this.recentSignals.findIndex((s) => s.timestamp > cutoff);
    if (idx > 0) {
      this.recentSignals.splice(0, idx);
    }
  }

  /**
   * CLUSTER SIGNALS
   * Group by narrative/theme
   */
  clusterSignals(narrative: string): SignalCluster {
    const recent = this.recentSignals.filter((s) => Date.now() - s.timestamp < this.COMPRESSION_WINDOW);

    const tokenMap = new Map<string, number>();
    const signalSet = new Set<string>();
    let totalConviction = 0;

    for (const sig of recent) {
      tokenMap.set(sig.token, (tokenMap.get(sig.token) || 0) + 1);
      signalSet.add(sig.signal);
      totalConviction += sig.conviction;
    }

    const avgStrength = recent.length > 0 ? totalConviction / recent.length : 0;

    // Priority: more signals + higher conviction = higher priority
    const priority = Math.min(100, (recent.length / 10) * 50 + (avgStrength / 100) * 50);

    return {
      narrative,
      tokens: tokenMap,
      avgStrength,
      uniqueSignals: signalSet,
      totalSignalCount: recent.length,
      priority,
    };
  }

  /**
   * COMPRESS TO TELEGRAM MESSAGE
   */
  compressForTelegram(cluster: SignalCluster): string {
    if (cluster.totalSignalCount === 0) {
      return '⏸️ No active signals';
    }

    // Get top leaders
    const sorted = Array.from(cluster.tokens.entries()).sort((a, b) => b[1] - a[1]);
    const topLeaders = sorted.slice(0, 3).map((e) => e[0]);

    // Build message
    let msg = `🎯 ${cluster.narrative}\n`;
    msg += `💪 Strength: ${cluster.avgStrength.toFixed(0)}\n`;
    msg += `📊 Signals: ${cluster.totalSignalCount}\n\n`;

    msg += `🔝 Leaders:\n`;
    for (const leader of topLeaders) {
      msg += `  • ${leader}\n`;
    }

    msg += `\n📡 Signals: ${Array.from(cluster.uniqueSignals).slice(0, 3).join(', ')}`;

    return msg;
  }

  /**
   * COMPRESS MULTIPLE CLUSTERS
   */
  compressMultiple(clusters: SignalCluster[]): CompressedSignal[] {
    return clusters
      .filter((c) => c.priority > 40) // only high priority
      .map((cluster) => this.clusterToCompressed(cluster))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5); // top 5 compressed signals
  }

  /**
   * CLUSTER TO COMPRESSED SIGNAL
   */
  private clusterToCompressed(cluster: SignalCluster): CompressedSignal {
    const sorted = Array.from(cluster.tokens.entries()).sort((a, b) => b[1] - a[1]);
    const topLeaders = sorted.slice(0, 3).map((e) => e[0]);

    // Determine action
    let action: 'BUY' | 'SELL' | 'WATCH' | 'AVOID';
    if (cluster.avgStrength > 80) action = 'BUY';
    else if (cluster.avgStrength > 60) action = 'WATCH';
    else if (cluster.avgStrength > 40) action = 'WATCH';
    else action = 'AVOID';

    // Determine urgency
    let urgency: 'immediate' | 'soon' | 'monitor' | 'casual';
    if (cluster.priority > 80) urgency = 'immediate';
    else if (cluster.priority > 60) urgency = 'soon';
    else if (cluster.priority > 40) urgency = 'monitor';
    else urgency = 'casual';

    return {
      narrative: cluster.narrative,
      strength: cluster.avgStrength,
      topLeaders,
      supportingSignals: Array.from(cluster.uniqueSignals).slice(0, 3),
      timeframe: '5m',
      action,
      confidence: Math.min(1, cluster.priority / 100),
      urgency,
    };
  }

  /**
   * DEDUPLICATION
   * Don't repeat same signal within window
   */
  isDuplicate(token: string, signal: string): boolean {
    const recent = this.recentSignals.filter((s) => Date.now() - s.timestamp < this.COMPRESSION_WINDOW);
    return recent.some((s) => s.token === token && s.signal === signal);
  }

  /**
   * EXPORT TO JSON
   */
  exportCompressed(clusters: SignalCluster[]): any {
    return {
      timestamp: Date.now(),
      totalSignals: this.recentSignals.length,
      clusters: clusters.map((c) => ({
        narrative: c.narrative,
        strength: c.avgStrength.toFixed(0),
        leaders: Array.from(c.tokens.keys()).slice(0, 5),
        signalCount: c.totalSignalCount,
      })),
    };
  }
}

export const informationCompressor = new InformationCompressor();