// File path: src/services/narrative/solana-narrative-engine.ts
/**
 * SOLANA NARRATIVE ROTATION ENGINE
 * Tracks attention flow INSIDE Solana ecosystem
 * Follows liquidity and narrative shifts before price moves
 */

import { supabase } from '../../core/db/supabase';
import { runtimeState } from '../../core/state/runtime-state';
import { eventOrchestrator } from '../../core/routing/event-orchestrator';

export interface Narrative {
  name: string;
  category: 'MEME' | 'ECOSYSTEM' | 'AGENT' | 'DEFI' | 'INFRASTRUCTURE' | 'CELEBRITY' | 'GAMING';
  strength: number; // 0-100
  acceleration: number; // momentum
  liquidityConcentration: number; // % in top 10 tokens
  holderGrowth: number; // % change 24h
  socialVelocity: number; // mentions/minute
  influencerCount: number; // active influencers
  narrativeAge: number; // hours
  exhaustion: number; // 0-100, when to fade
  lastUpdate: number;
}

class SolanaNarrativeEngine {
  private narratives: Map<string, Narrative> = new Map();
  private rotationHistory: Array<{ from: string; to: string; timestamp: number }> = [];
  private previousNarrative: string | null = null;
  private updateInterval = 5 * 60 * 1000; // 5 minutes

  constructor() {}

  /**
   * START ENGINE
   * Begin tracking narratives
   */
  start(): void {
    console.log('[NarrativeEngine] Solana Narrative Rotation Engine started');

    // Update narratives every 5 minutes
    setInterval(() => {
      this.updateNarratives();
    }, this.updateInterval);

    // Initial load
    this.loadNarratives();
  }

  /**
   * LOAD NARRATIVES
   * Load from database or initialize defaults
   */
  private async loadNarratives(): Promise<void> {
    try {
      // In production, would load from DB
      // For now, initialize with common Solana narratives

      this.addNarrative({
        name: 'SOL Memes',
        category: 'MEME',
        strength: 45,
        acceleration: 0,
        liquidityConcentration: 25,
        holderGrowth: 5,
        socialVelocity: 150,
        influencerCount: 12,
        narrativeAge: 48,
        exhaustion: 35,
        lastUpdate: Date.now(),
      });

      this.addNarrative({
        name: 'AI Agents',
        category: 'AGENT',
        strength: 62,
        acceleration: 15,
        liquidityConcentration: 40,
        holderGrowth: 12,
        socialVelocity: 280,
        influencerCount: 18,
        narrativeAge: 24,
        exhaustion: 20,
        lastUpdate: Date.now(),
      });

      this.addNarrative({
        name: 'TON Bridge',
        category: 'ECOSYSTEM',
        strength: 38,
        acceleration: -5,
        liquidityConcentration: 15,
        holderGrowth: 2,
        socialVelocity: 80,
        influencerCount: 6,
        narrativeAge: 72,
        exhaustion: 55,
        lastUpdate: Date.now(),
      });

      this.addNarrative({
        name: 'DeFi Summer',
        category: 'DEFI',
        strength: 55,
        acceleration: 8,
        liquidityConcentration: 35,
        holderGrowth: 8,
        socialVelocity: 200,
        influencerCount: 14,
        narrativeAge: 36,
        exhaustion: 30,
        lastUpdate: Date.now(),
      });

      console.log('[NarrativeEngine] Loaded 4 narratives');
    } catch (error) {
      console.error('[NarrativeEngine] Load error:', error);
    }
  }

  /**
   * ADD NARRATIVE
   */
  private addNarrative(narrative: Narrative): void {
    this.narratives.set(narrative.name, narrative);
  }

  /**
   * UPDATE NARRATIVES
   * Check narrative strength and rotation
   */
  private async updateNarratives(): Promise<void> {
    try {
      // Get current strongest narrative
      const strongest = this.getStrongestNarrative();

      if (!strongest) return;

      // Check for rotation
      if (this.previousNarrative && this.previousNarrative !== strongest.name) {
        await this.handleNarrativeRotation(this.previousNarrative, strongest.name);
      }

      // Update narrative state in runtime
      const narrativeState = {
        activeNarratives: Array.from(this.narratives.values())
          .sort((a, b) => b.strength - a.strength)
          .slice(0, 3),
        rotatingFrom: this.previousNarrative || undefined,
        rotatingTo: strongest.name,
        lastRotation: this.rotationHistory[this.rotationHistory.length - 1]?.timestamp,
      };

      runtimeState.setNarrativeState(narrativeState);

      this.previousNarrative = strongest.name;
    } catch (error) {
      console.error('[NarrativeEngine] Update error:', error);
    }
  }

  /**
   * HANDLE NARRATIVE ROTATION
   * When narrative shifts
   */
  private async handleNarrativeRotation(from: string, to: string): Promise<void> {
    console.log(`[NarrativeEngine] 🔄 Rotation detected: ${from} → ${to}`);

    // Record rotation
    this.rotationHistory.push({
      from,
      to,
      timestamp: Date.now(),
    });

    // Keep history bounded
    if (this.rotationHistory.length > 100) {
      this.rotationHistory = this.rotationHistory.slice(-100);
    }

    // Emit event
    await eventOrchestrator.narrativeRotation(from, to);

    // Calculate impact
    const toNarrative = this.narratives.get(to);
    if (toNarrative) {
      const acceleration = toNarrative.acceleration;
      const impact =
        acceleration > 20 ? '🚀 EXPLOSIVE' : acceleration > 10 ? '⚡ STRONG' : '📈 MODERATE';

      console.log(`[NarrativeEngine] Impact: ${impact} (accel: ${acceleration}%)`);
    }
  }

  /**
   * UPDATE NARRATIVE METRICS
   * Manually update a narrative's strength
   */
  async updateNarrativeMetrics(
    name: string,
    updates: Partial<Narrative>,
  ): Promise<void> {
    const narrative = this.narratives.get(name);
    if (narrative) {
      Object.assign(narrative, updates);
      narrative.lastUpdate = Date.now();
      console.log(`[NarrativeEngine] Updated ${name}:`, updates);
    }
  }

  /**
   * GET STRONGEST NARRATIVE
   */
  getStrongestNarrative(): Narrative | null {
    let strongest: Narrative | null = null;

    for (const narrative of this.narratives.values()) {
      if (!strongest || narrative.strength > strongest.strength) {
        strongest = narrative;
      }
    }

    return strongest;
  }

  /**
   * GET TOP NARRATIVES
   */
  getTopNarratives(count: number = 3): Narrative[] {
    return Array.from(this.narratives.values())
      .sort((a, b) => b.strength - a.strength)
      .slice(0, count);
  }

  /**
   * IS NARRATIVE EXHAUSTED
   * Check if narrative is dying
   */
  isNarrativeExhausted(name: string): boolean {
    const narrative = this.narratives.get(name);
    if (!narrative) return false;

    return narrative.exhaustion > 70 || narrative.acceleration < -10;
  }

  /**
   * GET ROTATION HISTORY
   */
  getRotationHistory(limit: number = 10): Array<{ from: string; to: string; timestamp: number }> {
    return this.rotationHistory.slice(-limit);
  }

  /**
   * CALCULATE NARRATIVE SCORE
   * Score for conviction engine
   */
  getNarrativeScore(narrativeName: string): number {
    const narrative = this.narratives.get(narrativeName);
    if (!narrative) return 0;

    // Score based on multiple factors
    const strengthScore = narrative.strength; // 0-100
    const accelerationScore = Math.min(100, narrative.acceleration * 5); // Convert to 0-100
    const exhaustionPenalty = narrative.exhaustion * 0.5; // Reduce score if exhausted
    const ageBonus = Math.max(0, 30 - narrative.narrativeAge / 2); // Newer is better

    let score = (strengthScore * 0.4 + accelerationScore * 0.3 + ageBonus * 0.3) - exhaustionPenalty;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * SHOULD ALLOCATE TO NARRATIVE
   * Risk management for narrative allocation
   */
  shouldAllocateToNarrative(name: string): boolean {
    const narrative = this.narratives.get(name);
    if (!narrative) return false;

    // Don't allocate if:
    // - Exhausted
    // - Weak
    // - Declining
    if (narrative.exhaustion > 60) return false;
    if (narrative.strength < 40) return false;
    if (narrative.acceleration < -15) return false;

    return true;
  }

  /**
   * GET NARRATIVE INTELLIGENCE
   * Detailed analysis
   */
  getNarrativeIntelligence(name: string): any {
    const narrative = this.narratives.get(name);
    if (!narrative) return null;

    const score = this.getNarrativeScore(name);
    const phase =
      narrative.exhaustion > 70
        ? 'DYING'
        : narrative.acceleration > 15
          ? 'IGNITION'
          : narrative.acceleration > 5
            ? 'GROWTH'
            : narrative.acceleration < -10
              ? 'DECLINE'
              : 'STABLE';

    return {
      name,
      score,
      phase,
      strength: narrative.strength,
      acceleration: narrative.acceleration,
      liquidity: narrative.liquidityConcentration,
      social: narrative.socialVelocity,
      influencers: narrative.influencerCount,
      exhaustion: narrative.exhaustion,
      recommendation:
        phase === 'IGNITION'
          ? '🚀 ACCUMULATE'
          : phase === 'GROWTH'
            ? '📈 STRONG'
            : phase === 'DYING'
              ? '❌ EXIT'
              : phase === 'DECLINE'
                ? '📉 REDUCE'
                : '➡️ HOLD',
    };
  }

  /**
   * ECOSYSTEM SUMMARY
   */
  getEcosystemSummary() {
    const narratives = Array.from(this.narratives.values())
      .sort((a, b) => b.strength - a.strength)
      .map((n) => ({
        name: n.name,
        strength: n.strength,
        status: this.isNarrativeExhausted(n.name) ? '❌' : n.acceleration > 10 ? '🚀' : '➡️',
      }));

    return {
      strongest: this.getStrongestNarrative()?.name || 'UNKNOWN',
      topNarratives: narratives.slice(0, 3),
      recentRotations: this.rotationHistory.slice(-3),
      lastUpdate: Date.now(),
    };
  }
}

// Export singleton
export const solanaNarrativeEngine = new SolanaNarrativeEngine();
