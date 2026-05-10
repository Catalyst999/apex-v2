// src/services/rpc/public-rpc-adapter.ts
/**
 * PUBLIC RPC ADAPTER
 * Low-priority polling, fallback resilience, background scanning
 * Free tier, non-urgent, no rate limits
 */

import axios from 'axios';
import { HYBRID_RPC } from '../../core/config';

export interface PublicRpcConfig {
  rpcUrl: string;
  retries: number;
  timeout: number;
}

export interface TransactionSignature {
  signature: string;
  blockTime?: number;
  slot?: number;
}

export interface ParsedTransaction {
  signature: string;
  blockTime?: number;
  slot?: number;
  transaction: any;
  meta: any;
}

class PublicRpcAdapter {
  private rpcUrl: string;
  private retries: number;
  private timeout: number;

  constructor(config: PublicRpcConfig = { 
    rpcUrl: HYBRID_RPC.PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
    retries: HYBRID_RPC.RPC_MAX_RETRIES,
    timeout: 10000
  }) {
    this.rpcUrl = config.rpcUrl;
    this.retries = config.retries;
    this.timeout = config.timeout;
  }

  /**
   * GET SIGNATURES FOR ADDRESS
   * Low-priority background scanning
   */
  async getSignaturesForAddress(
    address: string,
    limit: number = 100,
    before?: string,
  ): Promise<TransactionSignature[]> {
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await axios.post<{
          result?: Array<{ signature: string; blockTime?: number; slot?: number }>;
          error?: { message: string };
        }>(this.rpcUrl, {
          jsonrpc: '2.0',
          id: Math.random(),
          method: 'getSignaturesForAddress',
          params: [address, { limit, commitment: 'confirmed', before }],
        }, { timeout: this.timeout });

        if (response.data?.error) {
          console.warn(`[PublicRPC] RPC Error: ${response.data.error.message}`);
          if (attempt < this.retries - 1) {
            await this.sleep(1000 * (attempt + 1));
            continue;
          }
          return [];
        }

        const sigs = response.data?.result || [];
        console.log(`[PublicRPC] ✓ Got ${sigs.length} signatures for ${address.slice(0, 8)}...`);
        return sigs;
      } catch (error: any) {
        console.warn(`[PublicRPC] Attempt ${attempt + 1}/${this.retries} failed:`, error.message);
        if (attempt < this.retries - 1) {
          await this.sleep(2000 * (attempt + 1));
        }
      }
    }
    return [];
  }

  /**
   * GET TRANSACTION
   * Parse transaction details (low-priority enrichment)
   */
  async getTransaction(signature: string): Promise<ParsedTransaction | null> {
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await axios.post<{
          result?: any;
          error?: { message: string };
        }>(this.rpcUrl, {
          jsonrpc: '2.0',
          id: Math.random(),
          method: 'getTransaction',
          params: [signature, { maxSupportedTransactionVersion: 0 }],
        }, { timeout: this.timeout });

        if (response.data?.error) {
          return null;
        }

        const tx = response.data?.result;
        if (tx) {
          console.log(`[PublicRPC] ✓ Parsed tx: ${signature.slice(0, 8)}...`);
          return {
            signature,
            blockTime: tx.blockTime,
            slot: tx.slot,
            transaction: tx.transaction,
            meta: tx.meta,
          };
        }
        return null;
      } catch (error) {
        if (attempt < this.retries - 1) {
          await this.sleep(2000 * (attempt + 1));
        }
      }
    }
    return null;
  }

  /**
   * GET ACCOUNT INFO
   * Quick metadata lookup
   */
  async getAccountInfo(account: string): Promise<any | null> {
    try {
      const response = await axios.post<{
        result?: { value: any };
        error?: { message: string };
      }>(this.rpcUrl, {
        jsonrpc: '2.0',
        id: Math.random(),
        method: 'getAccountInfo',
        params: [account, { encoding: 'jsonParsed' }],
      }, { timeout: this.timeout });

      return response.data?.result?.value || null;
    } catch (error) {
      console.warn('[PublicRPC] Failed to get account info:', error);
      return null;
    }
  }

  /**
   * BATCH GET ACCOUNT INFO
   * Efficient multi-lookup
   */
  async batchGetAccountInfo(accounts: string[]): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    
    // Batch in chunks
    const batchSize = HYBRID_RPC.RPC_BATCH_SIZE;
    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = accounts.slice(i, i + batchSize);
      
      try {
        const response = await axios.post<{
          result?: Array<{ value: any } | null>;
        }>(this.rpcUrl, {
          jsonrpc: '2.0',
          id: Math.random(),
          method: 'getMultipleAccounts',
          params: [batch, { encoding: 'jsonParsed' }],
        }, { timeout: this.timeout });

        const values = response.data?.result || [];
        batch.forEach((account, idx) => {
          if (values[idx]?.value) {
            result.set(account, values[idx].value);
          }
        });
      } catch (error) {
        console.warn('[PublicRPC] Batch lookup failed:', error);
      }

      // Respect rate limiting
      await this.sleep(HYBRID_RPC.RPC_COOLDOWN_MS);
    }

    return result;
  }

  /**
   * GET TOKEN SUPPLY
   * Mint metadata
   */
  async getTokenSupply(mint: string): Promise<any | null> {
    try {
      const response = await axios.post<{
        result?: { value: { amount: string; decimals: number; uiAmount: number } };
      }>(this.rpcUrl, {
        jsonrpc: '2.0',
        id: Math.random(),
        method: 'getTokenSupply',
        params: [mint],
      }, { timeout: this.timeout });

      return response.data?.result?.value || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * HELPER: Sleep with jitter
   */
  private sleep(ms: number): Promise<void> {
    const jitter = Math.random() * 100;
    return new Promise(resolve => setTimeout(resolve, ms + jitter));
  }

  /**
   * HEALTH CHECK
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.post<{ result?: number }>(this.rpcUrl, {
        jsonrpc: '2.0',
        id: Math.random(),
        method: 'getSlot',
        params: [],
      }, { timeout: 5000 });

      return !!response.data?.result;
    } catch {
      return false;
    }
  }

  /**
   * GET STATUS
   */
  getStatus() {
    return {
      rpcUrl: this.rpcUrl,
      retries: this.retries,
      timeout: this.timeout,
      type: 'PUBLIC_RPC_ADAPTER',
    };
  }
}

export const publicRpcAdapter = new PublicRpcAdapter();