// src/services/rpc/helius-rpc-enrichment.ts
/**
 * HELIUS RPC ENRICHMENT
 * Deep enrichment ONLY after signal gateway passes
 * Selective API usage to control costs
 */

import axios from 'axios';
import { HELIUS } from '../../core/config';

export interface EnrichmentResult {
  token: string;
  holders?: { count: number; distribution: any };
  transactions?: any[];
  metadata?: any;
  security?: any;
}

class HeliusRpcEnrichment {
  private apiKey: string;
  private baseUrl: string = 'https://api.helius.xyz/v0';

  constructor() {
    this.apiKey = HELIUS.API_KEY;
  }

  /**
   * GET TOKEN METADATA
   * Only for high-conviction tokens
   */
  async getTokenMetadata(mint: string): Promise<any | null> {
    if (!this.apiKey) {
      console.warn('[HeliusEnrich] No API key, skipping metadata');
      return null;
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/token?address=${mint}&api-key=${this.apiKey}`,
        { timeout: 10000 }
      );

      return response.data;
    } catch (error: any) {
      console.warn(`[HeliusEnrich] Metadata fetch failed: ${error.message}`);
      return null;
    }
  }

  /**
   * GET HOLDERS ANALYSIS
   * Deep holder investigation
   */
  async getHoldersAnalysis(mint: string): Promise<any | null> {
    if (!this.apiKey) return null;

    try {
      const response = await axios.post(
        `${this.baseUrl}/addresses/`,
        {
          addresses: [mint],
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: 10000,
        }
      );

      return response.data?.[0] || null;
    } catch (error) {
      console.warn('[HeliusEnrich] Holders analysis failed');
      return null;
    }
  }

  /**
   * PARSE TRANSACTION
   * Decode transaction details
   */
  async parseTransaction(signature: string): Promise<any | null> {
    if (!this.apiKey) return null;

    try {
      const response = await axios.post(
        `${this.baseUrl}/parsed-transactions/`,
        {
          transactions: [signature],
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: 10000,
        }
      );

      return response.data?.[0] || null;
    } catch (error) {
      console.warn('[HeliusEnrich] Parse tx failed');
      return null;
    }
  }

  /**
   * SMART CONTRACT ANALYSIS
   * Security check
   */
  async analyzeContract(mint: string): Promise<any | null> {
    if (!this.apiKey) return null;

    try {
      const response = await axios.post(
        `${this.baseUrl}/contract/`,
        {
          address: mint,
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: 10000,
        }
      );

      return response.data;
    } catch (error) {
      console.warn('[HeliusEnrich] Contract analysis failed');
      return null;
    }
  }

  /**
   * FULL ENRICHMENT (Only for conviction > 75)
   */
  async enrichToken(mint: string, conviction: number): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      token: mint,
    };

    // Only enrich high-conviction tokens
    if (conviction < 75) {
      console.log(`[HeliusEnrich] Conviction ${conviction} too low, skipping enrichment`);
      return result;
    }

    console.log(`[HeliusEnrich] Enriching ${mint.slice(0, 8)}... (conviction: ${conviction})`);

    // Fetch in parallel
    const [metadata, holders, contract] = await Promise.all([
      this.getTokenMetadata(mint),
      this.getHoldersAnalysis(mint),
      this.analyzeContract(mint),
    ]);

    result.metadata = metadata;
    result.holders = holders;
    result.security = contract;

    return result;
  }

  /**
   * GET STATUS
   */
  getStatus() {
    return {
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl,
      type: 'HELIUS_RPC_ENRICHMENT',
    };
  }
}

export const heliusRpcEnrichment = new HeliusRpcEnrichment();