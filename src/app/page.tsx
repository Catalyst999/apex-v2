// File path: src/app/page.tsx
/**
 * CATALYST DASHBOARD PAGE
 * Next.js app router integration
 * 
 * Add this as your main dashboard page
 */

import { CatalystDashboard } from '@/components/CatalystDashboard';

export const metadata = {
  title: 'Catalyst Apex Trader - Dashboard',
  description: 'Real-time behavioral market intelligence system',
};

export default function DashboardPage() {
  return (
    <main>
      <CatalystDashboard />
    </main>
  );
}

/**
 * INTEGRATION STEPS FOR YOUR PROJECT:
 * 
 * 1. Copy components folder to your src/
 * 2. Copy this page to src/app/page.tsx (if using Next.js 13+)
 *    OR copy to src/pages/dashboard.tsx (if using Next.js 12 or Create React App)
 * 
 * 3. Install dependencies (if not already installed):
 *    npm install
 * 
 * 4. Run development server:
 *    npm run dev
 * 
 * 5. Open http://localhost:3000
 * 
 * ─────────────────────────────────────────────────────────────────────
 * 
 * FOR CREATE REACT APP:
 * 
 * 1. Copy components folder
 * 2. Create src/pages/Dashboard.tsx with:
 * 
 *    import { CatalystDashboard } from '../components';
 *    
 *    export default function Dashboard() {
 *      return <CatalystDashboard />;
 *    }
 * 
 * 3. Update src/App.tsx to route to Dashboard:
 * 
 *    import Dashboard from './pages/Dashboard';
 *    
 *    function App() {
 *      return <Dashboard />;
 *    }
 * 
 * ─────────────────────────────────────────────────────────────────────
 * 
 * FOR CONNECTING TO REAL DATA:
 * 
 * In CatalystDashboard.tsx, replace the mock data fetch with real API calls:
 * 
 * const fetchData = async () => {
 *   // Fetch wallet stats
 *   const statsRes = await fetch(`/api/wallet/${walletId}/stats`);
 *   const statsData = await statsRes.json();
 *   setStats(statsData);
 *   
 *   // Fetch open positions
 *   const posRes = await fetch(`/api/wallet/${walletId}/positions`);
 *   const posData = await posRes.json();
 *   setPositions(posData);
 *   
 *   // Fetch recent signals
 *   const sigRes = await fetch(`/api/wallet/${walletId}/signals?limit=10`);
 *   const sigData = await sigRes.json();
 *   setRecentSignals(sigData);
 *   
 *   // Fetch market regime
 *   const regimeRes = await fetch('/api/market/regime');
 *   const regimeData = await regimeRes.json();
 *   setRegime(regimeData.regime);
 *   setRegimeScore(regimeData.score);
 *   
 *   setLoading(false);
 * };
 * 
 * ─────────────────────────────────────────────────────────────────────
 * 
 * REQUIRED API ENDPOINTS:
 * 
 * GET /api/wallet/{walletId}/stats
 *   Response: {
 *     totalTrades: number,
 *     winRate: number,
 *     avgPnl: number,
 *     profitFactor: number,
 *     sharpeRatio: number,
 *     openPositions: number,
 *     totalPnL: number
 *   }
 * 
 * GET /api/wallet/{walletId}/positions
 *   Response: Position[]
 *   Position: {
 *     id: string,
 *     token: string,
 *     entryPrice: number,
 *     currentPrice: number,
 *     positionSize: number,
 *     leverage: number,
 *     conviction: number,
 *     pnl: number,
 *     pnlPercent: number,
 *     status: string,
 *     signals: string[]
 *   }
 * 
 * GET /api/wallet/{walletId}/signals?limit=10
 *   Response: Signal[]
 *   Signal: {
 *     token: string,
 *     type: string,
 *     conviction: number,
 *     timestamp: number
 *   }
 * 
 * GET /api/market/regime
 *   Response: {
 *     regime: 'HEALTHY' | 'WARMING' | 'COLD',
 *     score: number,
 *     reason: string
 *   }
 * 
 * ─────────────────────────────────────────────────────────────────────
 */
