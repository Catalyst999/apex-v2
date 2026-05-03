export type WalletStrategy = 'conservative' | 'aggressive' | 'experimental';
export type WalletTag = 'smart_money' | 'influencer' | 'experimental' | 'blacklist' | 'custom';

export interface Wallet {
  id: string;
  address: string;
  strategy: WalletStrategy;
  tag: WalletTag;
  is_active: boolean;
  metadata?: any;
  created_at: string;
}

export interface WalletAnalytics {
  wallet_id: string;
  total_trades: number;
  win_rate: number;
  total_pnl_usd: number;
  updated_at: string;
}