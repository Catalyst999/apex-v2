import { supabase } from '../core/supabase';
import { Wallet, WalletAnalytics } from './wallet-types';

class WalletManager {
  async validateIsolation(walletId: string, token: string): Promise<boolean> {
    const { data } = await supabase.from('wallets').select('id, is_active').eq('id', walletId).single();
    return !!data && data.is_active;
  }

  async getActiveWalletContext(): Promise<any | null> {
    const { data: wallet } = await supabase.from('wallets').select('*').eq('is_active', true).single();
    if (!wallet) return null;
    
    const analytics = await this.getWalletAnalytics(wallet.id);
    return {
      wallet,
      win_rate: analytics?.win_rate || 0,
      pnl_usd: analytics?.total_pnl_usd || 0
    };
  }

  async getAllWallets(): Promise<Wallet[]> {
    const { data } = await supabase.from('wallets').select('*');
    return data || [];
  }

  async getWalletAnalytics(walletId: string): Promise<WalletAnalytics | null> {
    const { data } = await supabase.from('wallet_analytics').select('*').eq('wallet_id', walletId).single();
    return data || null;
  }
}

export const walletManager = new WalletManager();