// File path: src/services/wallet/wallet-manager.ts

import { supabase } from '../../core/db/supabase';
import { Wallet, WalletStrategy, WalletStrategyType, WalletContext, WalletAnalytics, WalletRiskProfile } from './wallet-types';
import { v4 as uuidv4 } from 'uuid';

export class WalletManager {
  private selectedWalletId: string | null = null;

  /**
   * Initialize a new wallet
   */
  async createWallet(
    address: string,
    strategy: WalletStrategyType,
    tag: string,
    metadata?: any
  ): Promise<Wallet> {
    const walletId = uuidv4();

    const { data, error } = await supabase
      .from('wallets')
      .insert({
        id: walletId,
        address: address.toLowerCase(),
        strategy,
        tag,
        is_active: true,
        metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create wallet: ${error.message}`);
    if (!data) throw new Error('No wallet data returned');

    // Create risk profile for wallet
    await this.createRiskProfile(walletId, strategy);

    // Create analytics record
    await this.initializeAnalytics(walletId);

    return data;
  }

  /**
   * Get all wallets
   */
  async getAllWallets(): Promise<Wallet[]> {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch wallets: ${error.message}`);
    return data || [];
  }

  /**
   * Get wallet by ID
   */
  async getWallet(walletId: string): Promise<Wallet | null> {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Get wallet by address
   */
  async getWalletByAddress(address: string): Promise<Wallet | null> {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('address', address.toLowerCase())
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Select active wallet for operations
   */
  async selectWallet(walletId: string): Promise<Wallet> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) throw new Error(`Wallet ${walletId} not found`);
    if (!wallet.is_active) throw new Error(`Wallet ${walletId} is not active`);

    this.selectedWalletId = walletId;
    return wallet;
  }

  /**
   * Get currently selected wallet
   */
  getSelectedWalletId(): string | null {
    return this.selectedWalletId;
  }

  /**
   * Get selected wallet context
   */
  async getWalletContext(walletId: string): Promise<WalletContext | null> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) return null;

    const analytics = await this.getAnalytics(walletId);
    const riskProfile = await this.getRiskProfile(walletId);

    return {
      wallet,
      analytics,
      riskProfile,
      pnl_usd: analytics?.total_pnl_usd || 0,
      win_rate: analytics?.win_rate || 0,
      current_positions: 0,
      max_positions: riskProfile?.max_positions || 5,
      max_leverage: riskProfile?.max_leverage || 1,
    };
  }

  /**
   * Update wallet strategy
   */
  async updateWalletStrategy(walletId: string, strategy: WalletStrategyType): Promise<Wallet> {
    const { data, error } = await supabase
      .from('wallets')
      .update({ strategy, updated_at: new Date().toISOString() })
      .eq('id', walletId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update wallet: ${error.message}`);
    if (!data) throw new Error('No wallet data returned');

    return data;
  }

  /**
   * Update wallet tags
   */
  async updateWalletTags(walletId: string, tags: string[]): Promise<Wallet> {
    const { data, error } = await supabase
      .from('wallets')
      .update({ tag: tags.join(','), updated_at: new Date().toISOString() })
      .eq('id', walletId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update wallet tags: ${error.message}`);
    if (!data) throw new Error('No wallet data returned');

    return data;
  }

  /**
   * Deactivate wallet
   */
  async deactivateWallet(walletId: string): Promise<void> {
    const { error } = await supabase
      .from('wallets')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', walletId);

    if (error) throw new Error(`Failed to deactivate wallet: ${error.message}`);

    if (this.selectedWalletId === walletId) {
      this.selectedWalletId = null;
    }
  }

  /**
   * Create risk profile for wallet based on strategy
   */
  private async createRiskProfile(walletId: string, strategy: WalletStrategyType): Promise<void> {
    const profiles = {
      [WalletStrategy.CONSERVATIVE]: {
        max_position_usd: 500,
        max_total_exposure_usd: 2000,
        max_leverage: 1,
        max_positions: 3,
        stop_loss_percent: 8,
        take_profit_percent: 40,
        max_daily_loss_usd: 200,
      },
      [WalletStrategy.AGGRESSIVE]: {
        max_position_usd: 2000,
        max_total_exposure_usd: 8000,
        max_leverage: 2,
        max_positions: 5,
        stop_loss_percent: 15,
        take_profit_percent: 100,
        max_daily_loss_usd: 1000,
      },
      [WalletStrategy.EXPERIMENTAL]: {
        max_position_usd: 5000,
        max_total_exposure_usd: 15000,
        max_leverage: 3,
        max_positions: 8,
        stop_loss_percent: 20,
        take_profit_percent: 200,
        max_daily_loss_usd: 2000,
      },
    };

    const profile = profiles[strategy];

    const { error } = await supabase.from('wallet_risk_profiles').insert({
      wallet_id: walletId,
      ...profile,
      current_daily_loss_usd: 0,
    });

    if (error) throw new Error(`Failed to create risk profile: ${error.message}`);
  }

  /**
   * Get risk profile
   */
  async getRiskProfile(walletId: string): Promise<WalletRiskProfile | null> {
    const { data, error } = await supabase
      .from('wallet_risk_profiles')
      .select('*')
      .eq('wallet_id', walletId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Initialize analytics for wallet
   */
  private async initializeAnalytics(walletId: string): Promise<void> {
    const { error } = await supabase.from('wallet_analytics').insert({
      wallet_id: walletId,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      avg_win_usd: 0,
      avg_loss_usd: 0,
      profit_factor: 0,
      total_pnl_usd: 0,
      total_pnl_percent: 0,
      current_streak: 'neutral',
      streak_count: 0,
      last_trade_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) throw new Error(`Failed to initialize analytics: ${error.message}`);
  }

  /**
   * Get analytics
   */
  async getAnalytics(walletId: string): Promise<WalletAnalytics | null> {
    const { data, error } = await supabase
      .from('wallet_analytics')
      .select('*')
      .eq('wallet_id', walletId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Update analytics after trade
   */
  async updateAnalyticsAfterTrade(
    walletId: string,
    pnl: number,
    won: boolean
  ): Promise<void> {
    const current = await this.getAnalytics(walletId);
    if (!current) return;

    const newTotal = current.total_trades + 1;
    const newWins = won ? current.winning_trades + 1 : current.winning_trades;
    const newLosses = won ? current.losing_trades : current.losing_trades + 1;

    const avgWin = newWins > 0 ? (current.avg_win_usd * (newWins - 1) + Math.max(0, pnl)) / newWins : 0;
    const avgLoss = newLosses > 0 ? (current.avg_loss_usd * (newLosses - 1) + Math.min(0, pnl)) / newLosses : 0;

    const { error } = await supabase
      .from('wallet_analytics')
      .update({
        total_trades: newTotal,
        winning_trades: newWins,
        losing_trades: newLosses,
        win_rate: newWins / newTotal,
        avg_win_usd: avgWin,
        avg_loss_usd: avgLoss,
        profit_factor: Math.abs(avgWin) > 0 ? Math.abs(avgWin / avgLoss) : 0,
        total_pnl_usd: current.total_pnl_usd + pnl,
        last_trade_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_id', walletId);

    if (error) throw new Error(`Failed to update analytics: ${error.message}`);
  }
}

export const walletManager = new WalletManager();