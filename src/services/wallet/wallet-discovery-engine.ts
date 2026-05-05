// File path: src/services/wallet/wallet-discovery-engine.ts

import { supabase } from '../../core/db/supabase';
import { v4 as uuidv4 } from 'uuid';

export interface DiscoveredWallet {
  address: string;
  confidence: number;
  reason: string;
}

export class WalletDiscoveryEngine {
  /**
   * Discover wallets from insider momentum signals
   */
  async discoverFromInsiderMomentum(): Promise<DiscoveredWallet[]> {
    const { data, error } = await supabase
      .from('insider_momentum_signals')
      .select('wallet_address, confidence')
      .eq('signal_type', 'dormancy_compression')
      .gte('confidence', 0.7)
      .limit(10);

    if (error) throw new Error(`Failed to discover wallets: ${error.message}`);

    const discovered: DiscoveredWallet[] = [];
    for (const row of data || []) {
      discovered.push({
        address: row.wallet_address,
        confidence: row.confidence,
        reason: 'Dormant wallet reactivation detected',
      });
    }

    return discovered;
  }

  /**
   * Discover wallets from smart money patterns
   */
  async discoverFromSmartMoney(): Promise<DiscoveredWallet[]> {
    const { data, error } = await supabase
      .from('insider_momentum_analysis')
      .select('smart_wallet, beast_mode_score')
      .eq('beast_mode_detected', true)
      .gte('beast_mode_score', 0.8)
      .limit(10);

    if (error) throw new Error(`Failed to discover smart money: ${error.message}`);

    const discovered: DiscoveredWallet[] = [];
    for (const row of data || []) {
      discovered.push({
        address: row.smart_wallet,
        confidence: Math.min(row.beast_mode_score / 100, 1),
        reason: 'Smart money beast mode pattern detected',
      });
    }

    return discovered;
  }

  /**
   * Log discovered wallet for tracking
   */
  async logDiscoveredWallet(
    address: string,
    confidence: number,
    reason: string,
    linkedWalletId?: string
  ): Promise<string> {
    const discoveryId = uuidv4();

    const { error } = await supabase.from('wallet_discoveries').insert({
      id: discoveryId,
      discovered_address: address.toLowerCase(),
      confidence,
      reason,
      linked_to_wallet_id: linkedWalletId,
      discovered_at: new Date().toISOString(),
    });

    if (error) throw new Error(`Failed to log discovery: ${error.message}`);

    return discoveryId;
  }

  /**
   * Get pending discoveries
   */
  async getPendingDiscoveries(limit: number = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from('wallet_discoveries')
      .select('*')
      .is('linked_to_wallet_id', null)
      .gte('confidence', 0.7)
      .order('discovered_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch pending discoveries: ${error.message}`);
    return data || [];
  }

  /**
   * Link discovered wallet to tracked wallet
   */
  async linkDiscoveredWallet(discoveryId: string, walletId: string): Promise<void> {
    const { error } = await supabase
      .from('wallet_discoveries')
      .update({ linked_to_wallet_id: walletId })
      .eq('id', discoveryId);

    if (error) throw new Error(`Failed to link wallet: ${error.message}`);
  }

  /**
   * Run full discovery cycle
   */
  async runDiscoveryCycle(): Promise<DiscoveredWallet[]> {
    const allDiscovered: DiscoveredWallet[] = [];

    try {
      const insiderWallets = await this.discoverFromInsiderMomentum();
      allDiscovered.push(...insiderWallets);

      const smartMoneyWallets = await this.discoverFromSmartMoney();
      allDiscovered.push(...smartMoneyWallets);

      // Log all discovered wallets
      for (const discovered of allDiscovered) {
        await this.logDiscoveredWallet(
          discovered.address,
          discovered.confidence,
          discovered.reason
        );
      }

      return allDiscovered;
    } catch (error) {
      console.error('Discovery cycle error:', error);
      return [];
    }
  }
}

export const walletDiscoveryEngine = new WalletDiscoveryEngine();