// File path: src/services/execution/position-heat-map.ts
/**
 * POSITION HEAT MAP
 * Visual representation of portfolio exposure
 * Identifies concentration and correlation risks
 */

import { positionManager } from './position-manager';
import { runtimeState } from '../../core/state/runtime-state';

interface HeatMapCell {
  token: string;
  exposure: number; // % of portfolio
  pnl: number;
  pnlPercent: number;
  risk: number; // 0-100
  status: 'WINNING' | 'NEUTRAL' | 'LOSING' | 'CRITICAL';
  conviction: number;
  holdTime: number;
}

interface HeatMapGrid {
  totalExposure: number;
  cellCount: number;
  cells: HeatMapCell[];
  heatIntensity: number; // 0-100 overall
  correlationScore: number;
  recommendation: string;
}

class PositionHeatMap {
  /**
   * GENERATE HEAT MAP
   * Create visual representation
   */
  generateHeatMap(walletId?: string): HeatMapGrid {
    const positions = walletId ? positionManager.getWalletPositions(walletId) : positionManager.getAllPositions();

    const totalExposure = positions.reduce((sum, p) => sum + p.positionSize, 0) || 1;

    const cells: HeatMapCell[] = positions.map((pos) => ({
      token: pos.token,
      exposure: (pos.positionSize / totalExposure) * 100,
      pnl: pos.pnl,
      pnlPercent: pos.pnlPercent,
      risk: this.calculateRiskScore(pos),
      status: this.getPositionStatus(pos),
      conviction: pos.conviction,
      holdTime: pos.holdTime,
    }));

    // Sort by exposure (largest first)
    cells.sort((a, b) => b.exposure - a.exposure);

    const heatIntensity = this.calculateHeatIntensity(cells);
    const correlationScore = this.estimateCorrelation(cells);
    const recommendation = this.generateRecommendation(cells, heatIntensity);

    return {
      totalExposure: positions.length,
      cellCount: cells.length,
      cells,
      heatIntensity,
      correlationScore,
      recommendation,
    };
  }

  /**
   * CALCULATE RISK SCORE
   * 0-100 risk for position
   */
  private calculateRiskScore(position: any): number {
    let score = 0;

    // Loss risk (30 points)
    if (position.pnlPercent < 0) {
      score += Math.min(30, Math.abs(position.pnlPercent) * 3);
    }

    // Leverage risk (30 points)
    score += (position.leverage / 10) * 30;

    // Conviction risk (20 points) - lower conviction = higher risk
    score += (100 - position.conviction) * 0.2;

    // Hold time risk (20 points) - longer hold = higher risk of reversal
    const holdDays = position.holdTime / (24 * 60 * 60 * 1000);
    score += Math.min(20, holdDays * 2);

    return Math.min(100, score);
  }

  /**
   * GET POSITION STATUS
   */
  private getPositionStatus(pos: any): 'WINNING' | 'NEUTRAL' | 'LOSING' | 'CRITICAL' {
    if (pos.pnlPercent > 10) return 'WINNING';
    if (pos.pnlPercent > 0) return 'NEUTRAL';
    if (pos.pnlPercent > -5) return 'LOSING';
    return 'CRITICAL';
  }

  /**
   * CALCULATE HEAT INTENSITY
   * Overall portfolio intensity
   */
  private calculateHeatIntensity(cells: HeatMapCell[]): number {
    if (cells.length === 0) return 0;

    const avgRisk = cells.reduce((sum, c) => sum + c.risk, 0) / cells.length;
    const concentration = Math.max(...cells.map((c) => c.exposure));
    const losingPositions = cells.filter((c) => c.status === 'CRITICAL').length;

    let intensity = 0;
    intensity += avgRisk * 0.4;
    intensity += concentration * 0.4;
    intensity += (losingPositions / cells.length) * 100 * 0.2;

    return Math.min(100, intensity);
  }

  /**
   * ESTIMATE CORRELATION
   */
  private estimateCorrelation(cells: HeatMapCell[]): number {
    // In production, would calculate actual correlation
    // For now, estimate based on concentration
    const concentration = Math.max(...cells.map((c) => c.exposure));
    return concentration > 40 ? 75 : concentration > 25 ? 50 : 25;
  }

  /**
   * GENERATE RECOMMENDATION
   */
  private generateRecommendation(cells: HeatMapCell[], intensity: number): string {
    if (intensity > 80) {
      return '🔥 CRITICAL: Portfolio is over-concentrated and at risk. Reduce exposure immediately.';
    } else if (intensity > 60) {
      return '⚠️ HIGH RISK: Consider reducing largest positions or taking profits.';
    } else if (intensity > 40) {
      return '📊 MODERATE: Portfolio is reasonably balanced. Monitor for changes.';
    } else {
      return '✅ HEALTHY: Portfolio risk is well-managed.';
    }
  }

  /**
   * ASCII HEAT MAP
   * For console display
   */
  getAsciiHeatMap(walletId?: string): string {
    const heatMap = this.generateHeatMap(walletId);
    let output = '\n╔════════════════════════════════════════════╗\n';
    output += '║        POSITION HEAT MAP                   ║\n';
    output += '╠════════════════════════════════════════════╣\n';

    for (const cell of heatMap.cells) {
      const barLength = Math.floor(cell.exposure / 5);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      const pnlColor = cell.pnlPercent >= 0 ? '📈' : '📉';
      const statusEmoji =
        cell.status === 'WINNING'
          ? '🟢'
          : cell.status === 'NEUTRAL'
            ? '🟡'
            : cell.status === 'LOSING'
              ? '🟠'
              : '🔴';

      output += `║ ${statusEmoji} ${cell.token.padEnd(6)} ${bar} ${cell.exposure.toFixed(1)}%\n`;
    }

    output += '╠════════════════════════════════════════════╣\n';
    output += `║ Heat Intensity: ${heatMap.heatIntensity.toFixed(0)}%\n`;
    output += `║ Correlation: ${heatMap.correlationScore.toFixed(0)}%\n`;
    output += `║ ${heatMap.recommendation}\n`;
    output += '╚════════════════════════════════════════════╝\n';

    return output;
  }

  /**
   * JSON EXPORT
   */
  exportToJSON(walletId?: string): any {
    const heatMap = this.generateHeatMap(walletId);
    return {
      timestamp: Date.now(),
      heatMap,
      exportFormat: 'position-heat-map-v1',
    };
  }
}

export const positionHeatMap = new PositionHeatMap();