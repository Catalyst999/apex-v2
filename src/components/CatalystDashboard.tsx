// File path: src/components/CatalystDashboard.tsx
/**
 * CATALYST APEX TRADER DASHBOARD
 * Real-time monitoring of signals, positions, performance
 * Production-grade React component
 */

import React, { useState, useEffect } from 'react';
import './CatalystDashboard.css';

export interface Position {
  id: string;
  token: string;
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  leverage: number;
  conviction: number;
  pnl: number;
  pnlPercent: number;
  status: string;
  signals: string[];
}

export interface Signal {
  token: string;
  type: string;
  conviction: number;
  timestamp: number;
}

export interface WalletStats {
  totalTrades: number;
  winRate: number;
  avgPnl: number;
  profitFactor: number;
  sharpeRatio: number;
  openPositions: number;
  totalPnL: number;
}

export const CatalystDashboard: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [recentSignals, setRecentSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [regime, setRegime] = useState<'HEALTHY' | 'WARMING' | 'COLD'>('HEALTHY');
  const [regimeScore, setRegimeScore] = useState(75);
  const [loading, setLoading] = useState(true);

  // Simulate real-time data updates
  useEffect(() => {
    const fetchData = async () => {
      // In production, fetch from your API
      // For now, simulated data
      const mockStats: WalletStats = {
        totalTrades: 42,
        winRate: 0.57,
        avgPnl: 245.50,
        profitFactor: 1.82,
        sharpeRatio: 1.34,
        openPositions: 3,
        totalPnL: 10309.00,
      };

      const mockPositions: Position[] = [
        {
          id: '1',
          token: 'BONK',
          entryPrice: 0.000045,
          currentPrice: 0.000078,
          positionSize: 1500,
          leverage: 2,
          conviction: 78,
          pnl: 495,
          pnlPercent: 73.3,
          status: 'OPEN',
          signals: ['DORMANT_WALLET', 'WHALE_ENTRY'],
        },
        {
          id: '2',
          token: 'WIF',
          entryPrice: 0.32,
          currentPrice: 0.38,
          positionSize: 2000,
          leverage: 1.5,
          conviction: 65,
          pnl: 240,
          pnlPercent: 18.75,
          status: 'OPEN',
          signals: ['NARRATIVE_EXPANSION'],
        },
        {
          id: '3',
          token: 'SOL',
          entryPrice: 178,
          currentPrice: 172,
          positionSize: 1000,
          leverage: 1,
          conviction: 52,
          pnl: -60,
          pnlPercent: -3.4,
          status: 'OPEN',
          signals: ['REGIME_SIGNAL'],
        },
      ];

      const mockSignals: Signal[] = [
        { token: 'BONK', type: 'DORMANT_WALLET_ACTIVE', conviction: 82, timestamp: Date.now() },
        { token: 'WIF', type: 'NARRATIVE_EXPANSION', conviction: 71, timestamp: Date.now() - 120000 },
        { token: 'COPE', type: 'LIQUIDITY_SPIKE', conviction: 45, timestamp: Date.now() - 300000 },
      ];

      setStats(mockStats);
      setPositions(mockPositions);
      setRecentSignals(mockSignals);
      setLoading(false);
    };

    fetchData();

    // Simulate price updates every 2 seconds
    const interval = setInterval(() => {
      setPositions((prev) =>
        prev.map((p) => {
          const change = (Math.random() - 0.5) * 0.02;
          const newPrice = p.currentPrice * (1 + change);
          const newPnl = (newPrice - p.entryPrice) * p.positionSize;
          return {
            ...p,
            currentPrice: newPrice,
            pnl: newPnl,
            pnlPercent: ((newPrice - p.entryPrice) / p.entryPrice) * 100,
          };
        })
      );

      // Update regime score slightly
      setRegimeScore((prev) => Math.max(40, Math.min(100, prev + (Math.random() - 0.5) * 3)));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const totalPortfolioPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalCapital = positions.reduce((sum, p) => sum + p.positionSize, 0);
  const portfolioPnlPercent = totalCapital > 0 ? (totalPortfolioPnl / totalCapital) * 100 : 0;

  const regimeColor =
    regime === 'HEALTHY' ? '#00ff00' : regime === 'WARMING' ? '#ffaa00' : '#ff3333';

  if (loading) {
    return (
      <div className="catalyst-dashboard loading">
        <div className="loading-spinner"></div>
        <p>Initializing behavioral intelligence...</p>
      </div>
    );
  }

  return (
    <div className="catalyst-dashboard">
      {/* HEADER */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>⚡ CATALYST APEX TRADER</h1>
          <p className="subtitle">Behavioral Market Intelligence System</p>
        </div>
        <div className="header-right">
          <div className="status-indicator">
            <span className="pulse"></span>
            Live
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="dashboard-grid">
        {/* REGIME INDICATOR */}
        <div className="card regime-card">
          <div className="card-header">📊 Market Regime</div>
          <div className="regime-display">
            <div
              className="regime-bar"
              style={{ width: `${regimeScore}%`, backgroundColor: regimeColor }}
            ></div>
            <div className="regime-label">
              {regime} ({regimeScore.toFixed(0)})
            </div>
            <div className="regime-info">
              {regime === 'HEALTHY'
                ? '✅ Optimal trading conditions'
                : regime === 'WARMING'
                ? '⚠️ Increasing volatility'
                : '❄️ High risk - reduce positions'}
            </div>
          </div>
        </div>

        {/* PORTFOLIO SUMMARY */}
        <div className="card portfolio-card">
          <div className="card-header">💼 Portfolio</div>
          <div className="portfolio-metrics">
            <div className="metric">
              <div className="metric-label">Open Positions</div>
              <div className="metric-value">{positions.length}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Total Capital</div>
              <div className="metric-value">${totalCapital.toFixed(0)}</div>
            </div>
            <div className="metric">
              <div className={`metric-value ${totalPortfolioPnl >= 0 ? 'positive' : 'negative'}`}>
                ${totalPortfolioPnl.toFixed(2)} ({portfolioPnlPercent.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>

        {/* PERFORMANCE STATS */}
        <div className="card stats-card">
          <div className="card-header">📈 Performance</div>
          {stats && (
            <div className="stats-grid">
              <div className="stat">
                <div className="stat-label">Win Rate</div>
                <div className="stat-value">{(stats.winRate * 100).toFixed(1)}%</div>
              </div>
              <div className="stat">
                <div className="stat-label">Profit Factor</div>
                <div className="stat-value">{stats.profitFactor.toFixed(2)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Sharpe Ratio</div>
                <div className="stat-value">{stats.sharpeRatio.toFixed(2)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Avg P&L</div>
                <div className={`stat-value ${stats.avgPnl >= 0 ? 'positive' : 'negative'}`}>
                  ${stats.avgPnl.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* POSITIONS */}
        <div className="card positions-card">
          <div className="card-header">📍 Open Positions</div>
          <div className="positions-list">
            {positions.map((pos) => (
              <div key={pos.id} className="position-item">
                <div className="position-header">
                  <span className="token">{pos.token}</span>
                  <span className={`conviction conviction-${Math.floor(pos.conviction / 20)}`}>
                    {pos.conviction}%
                  </span>
                </div>
                <div className="position-details">
                  <div className="detail">
                    <span className="label">Entry:</span>
                    <span className="value">${pos.entryPrice.toFixed(8)}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Current:</span>
                    <span className="value">${pos.currentPrice.toFixed(8)}</span>
                  </div>
                  <div className="detail">
                    <span className="label">P&L:</span>
                    <span className={`value ${pos.pnl >= 0 ? 'positive' : 'negative'}`}>
                      ${pos.pnl.toFixed(2)} ({pos.pnlPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="position-signals">
                  {pos.signals.map((sig, idx) => (
                    <span key={idx} className="signal-badge">
                      {sig}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RECENT SIGNALS */}
        <div className="card signals-card">
          <div className="card-header">📡 Recent Signals</div>
          <div className="signals-list">
            {recentSignals.map((sig, idx) => (
              <div key={idx} className="signal-item">
                <div className="signal-token">{sig.token}</div>
                <div className="signal-type">{sig.type}</div>
                <div className="signal-conviction" style={{ opacity: sig.conviction / 100 }}>
                  {sig.conviction}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="dashboard-footer">
        <p>
          Catalyst Apex Trader v2.0 | Behavioral Intelligence | Last update:{' '}
          {new Date().toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default CatalystDashboard;
