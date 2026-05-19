// File path: src/services/wallet/wallet-manager.ts

import { supabase } from '../../db/supabase';
import { WALLETS } from '../../core/config';
import { Keypair } from '@solana/web3.js';
import { Wallet, WalletStrategy, WalletStrategyType, WalletContext, WalletAnalytics, WalletRiskProfile } from './wallet-types';
import { v4 as uuidv4 } from 'uuid';

class KeypairManager {
  encryptKeypair(secret: string | Uint8Array): string {
    const keyBytes = this.normalizeSecretKey(secret);
    return Buffer.from(JSON.stringify(Array.from(keyBytes)), 'utf8').toString('base64');
  }

  decryptKeypair(encoded: string): Uint8Array {
    const raw = Buffer.from(encoded, 'base64').toString('utf8');
    return Uint8Array.from(JSON.parse(raw));
  }

  getKeypairFromEncrypted(encoded: string): Keypair {
    const secretKey = this.decryptKeypair(encoded);
    return Keypair.fromSecretKey(secretKey);
  }

  normalizeSecretKey(secret: string | Uint8Array): Uint8Array {
    if (secret instanceof Uint8Array) return secret;

    try {
      const parsed = JSON.parse(secret);
      if (Array.isArray(parsed)) return Uint8Array.from(parsed);
    } catch (_err) {
      // ignore parse failures
    }

    try {
      return Buffer.from(secret, 'base64');
    } catch (err) {
      throw new Error(`Invalid keypair secret format: ${err}`);
    }
  }

  generateKeypair(): Keypair {
    return Keypair.generate();
  }

  importKeypair(secret: string): Keypair {
    try {
      // Support multiple formats:
      // 1. Base64 encoded secret key (32 bytes)
      // 2. Seed phrase (24 words)
      // 3. Hex string
      
      if (secret.includes(' ')) {
        // Seed phrase - TODO: implement BIP39
        throw new Error('Seed phrase import not yet implemented');
      }

      try {
        const secretKey = Buffer.from(secret, 'base64');
        if (secretKey.length === 64) {
          return Keypair.fromSecretKey(new Uint8Array(secretKey));
        }
      } catch {}

      try {
        const secretKey = Buffer.from(secret, 'hex');
        if (secretKey.length === 64) {
          return Keypair.fromSecretKey(new Uint8Array(secretKey));
        }
      } catch {}

      throw new Error('Invalid keypair format');
    } catch (err) {
      throw new Error(`Keypair import failed: ${err}`);
    }
  }
}

export class WalletManager {
  private selectedWalletId: string | null = null;
  private keypairManager = new KeypairManager();

  /**
   * Initialize a new wallet
   */
  async createWallet(
    address: string,
    strategy: WalletStrategyType,
    tag: string,
    metadata?: any,
    keypairSecret?: string | Uint8Array,
    keyType: string = 'ed25519'
  ): Promise<Wallet> {
    const walletId = uuidv4();
    const encryptedKeypair = keypairSecret ? this.keypairManager.encryptKeypair(keypairSecret) : null;
    const walletData: Record<string, any> = {
      id: walletId,
      address: address.toLowerCase(),
      strategy,
      tag,
      is_active: true,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (encryptedKeypair) {
      walletData.encrypted_keypair = encryptedKeypair;
      walletData.key_type = keyType;
    }

    const { data, error } = await supabase
      .from('wallets')
      .insert(walletData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create wallet: ${error.message}`);
    if (!data) throw new Error('No wallet data returned');

    await this.createRiskProfile(walletId, strategy);
    await this.initializeAnalytics(walletId);

    return data;
  }

  /**
   * Create wallet with keypair
   */
  async createWalletWithKeypair(
    keypair: Keypair,
    strategy: WalletStrategyType,
    tag: string
  ): Promise<Wallet> {
    const address = keypair.publicKey.toBase58();
    const encrypted = this.keypairManager.encryptKeypair(keypair.secretKey);

    const walletId = uuidv4();

    const { data, error } = await supabase
      .from('wallets')
      .insert({
        id: walletId,
        address: address.toLowerCase(),
        strategy,
        tag,
        is_active: true,
        encrypted_keypair: encrypted,
        key_type: 'ed25519',
        metadata: { keyType: 'ed25519' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create wallet: ${error.message}`);
    if (!data) throw new Error('No wallet data returned');

    await this.createRiskProfile(walletId, strategy);
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
   * Get keypair from wallet
   */
  async getWalletKeypair(walletId: string): Promise<Keypair | null> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) return null;

    const { data, error } = await supabase
      .from('wallets')
      .select('encrypted_keypair')
      .eq('id', walletId)
      .single();

    if (error || !data?.encrypted_keypair) {
      console.warn(`[WalletManager] No encrypted keypair found for ${walletId}`);
      return null;
    }

    try {
      return this.keypairManager.getKeypairFromEncrypted(data.encrypted_keypair);
    } catch (err) {
      console.error(`[WalletManager] Keypair decryption failed:`, err);
      return null;
    }
  }

  /**
   * Attach keypair to existing wallet
   */
  async attachKeypairToWallet(
    walletId: string,
    keypairSecret: string | Uint8Array,
    keyType: string = 'ed25519'
  ): Promise<void> {
    const encryptedKeypair = this.keypairManager.encryptKeypair(keypairSecret);

    const { error } = await supabase
      .from('wallets')
      .update({
        encrypted_keypair: encryptedKeypair,
        key_type: keyType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', walletId);

    if (error) throw new Error(`Failed to attach keypair to wallet: ${error.message}`);
  }

  /**
   * Validate wallet isolation and current wallet context
   */
  async validateIsolation(walletId: string, context: string = ''): Promise<boolean> {
    const wallet = await this.getWallet(walletId);
    if (!wallet || !wallet.is_active) return false;

    if (WALLETS.ISOLATION_STRICT) {
      if (!this.selectedWalletId) return false;
      if (this.selectedWalletId !== walletId) return false;
    }

    return true;
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
   * Update position count for wallet
   */
  async updatePositionCount(walletId: string, delta: number): Promise<void> {
    const wallet = await this.getWallet(walletId);
    if (!wallet) return;

    const currentCount = wallet.metadata?.positionCount || 0;
    const newCount = Math.max(0, currentCount + delta);

    const { error } = await supabase
      .from('wallets')
      .update({
        metadata: { ...wallet.metadata, positionCount: newCount },
        updated_at: new Date().toISOString(),
      })
      .eq('id', walletId);

    if (error) console.error(`Failed to update position count:`, error);
  }

  /**
   * Get analytics for wallet
   */
  public async getAnalytics(walletId: string): Promise<WalletAnalytics | null> {
    const { data, error } = await supabase
      .from('wallet_analytics')
      .select('*')
      .eq('wallet_id', walletId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Get risk profile for wallet
   */
  public async getRiskProfile(walletId: string): Promise<WalletRiskProfile | null> {
    const { data, error } = await supabase
      .from('wallet_risk_profiles')
      .select('*')
      .eq('wallet_id', walletId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  /**
   * Create risk profile for wallet
   */
  private async createRiskProfile(walletId: string, strategy: WalletStrategyType): Promise<void> {
    const { error } = await supabase.from('wallet_risk_profiles').insert({
      id: uuidv4(),
      wallet_id: walletId,
      strategy,
      max_positions: 5,
      max_leverage: 1,
      max_daily_loss: 500,
      correlation_threshold: 0.7,
      created_at: new Date().toISOString(),
    });

    if (error) console.error(`Failed to create risk profile:`, error);
  }

  /**
   * Initialize analytics for wallet
   */
  private async initializeAnalytics(walletId: string): Promise<void> {
    const { error } = await supabase.from('wallet_analytics').insert({
      id: uuidv4(),
      wallet_id: walletId,
      total_pnl_usd: 0,
      win_rate: 0,
      avg_win: 0,
      avg_loss: 0,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      created_at: new Date().toISOString(),
    });

    if (error) console.error(`Failed to initialize analytics:`, error);
  }
}

export const walletManager = new WalletManager();
