export const WalletStrategy = {
  CONSERVATIVE: 'conservative',
  AGGRESSIVE: 'aggressive',
  EXPERIMENTAL: 'experimental',
} as const;

export type WalletStrategyType = typeof WalletStrategy[keyof typeof WalletStrategy];

export type WalletTag = 'smart_money' | 'influencer' | 'experimental' | 'blacklist' | 'custom';

export interface Wallet {
  id: string;
  address: string;
  strategy: WalletStrategyType;
  tag: WalletTag;
  is_active: boolean;
  encrypted_keypair?: string;
  key_type?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface WalletRiskProfile {
  wallet_id: string;
  max_position_usd: number;
  max_total_exposure_usd: number;
  max_leverage: number;
  max_positions: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  max_daily_loss_usd: number;
  current_daily_loss_usd: number;
  created_at: string;
  updated_at: string;
}

export interface WalletAnalytics {
  wallet_id: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win_usd: number;
  avg_loss_usd: number;
  profit_factor: number;
  total_pnl_usd: number;
  total_pnl_percent?: number;
  sharpe_ratio?: number;
  max_drawdown?: number;
  current_streak: string;
  streak_count: number;
  last_trade_time?: string;
  created_at: string;
  updated_at: string;
}

export interface WalletContext {
  wallet: Wallet;
  analytics: WalletAnalytics | null;
  riskProfile: WalletRiskProfile | null;
  pnl_usd: number;
  win_rate: number;
  current_positions: number;
  max_positions: number;
  max_leverage: number;
}