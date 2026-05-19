import { RawPair } from "./dexscreener";
import { heliusRpc } from "../routing/helius-rpc-service";

// src/services/scanner/fake-volume-detector.ts
// Catalyst Apex Trader v2.1 — Fake Volume Detector
//
// The Magic Formula (from playbook):
// Divide volume by market cap. Normal fees are ~1/20th of volume.
// If volume/mcap fees ratio < 1/30, volume is fabricated.
// Fake volume = coin is either bundled OR going to rug — avoid.
//
// How it works:
// On-chain fees for Solana swaps are roughly 0.25-0.30% of trade size.
// For $1M volume → expect ~$2,500-3,000 in fees → ratio ~1/333 to 1/400.
// We use vol/mcap as the proxy since we don't have direct fee data.
// When vol/mcap < threshold → fees implied by that volume are impossibly low
// → volume is wash traded / fabricated.
//
// Additionally: volume > mcap is NORMAL for high momentum tokens.
// Liquidity > mcap is a RED FLAG (playbook rule #2).

export interface FakeVolumeResult {
  isFake:        boolean;
  reason:        string;
  confidence:    number;   // 0-100
  volMcapRatio:  number;
  liqMcapRatio:  number;
  flags:         string[];
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MIN_VOL_MCAP_RATIO    = 1 / 30;   // below this = fake volume
const MAX_LIQ_MCAP_RATIO    = 1.0;      // liquidity > mcap = red flag (rule #2)
const WASH_TRADE_RATIO      = 0.001;    // vol/mcap < 0.1% with claims of activity = wash
const MIN_VOL_FOR_CHECK     = 1_000;    // ignore tokens with < $1k volume (too small to matter)

// ─── Main detector ────────────────────────────────────────────────────────────

export function detectFakeVolume(pair: any): FakeVolumeResult {
  const mcap   = pair.marketCap ?? pair.fdv ?? 0;
  const liq    = pair.liquidity?.usd ?? 0;
  const vol5m  = pair.volume?.m5  ?? 0;
  const vol1h  = pair.volume?.h1  ?? 0;
  const vol24h = pair.volume?.h24 ?? 0;

  const flags: string[] = [];
  let confidence = 0;

  // Use the most relevant volume window
  const activeVol = vol1h > 0 ? vol1h : vol5m;

  // Not enough data to check
  if (mcap === 0 || activeVol < MIN_VOL_FOR_CHECK) {
    return {
      isFake:       false,
      reason:       "Insufficient data for fake volume check",
      confidence:   0,
      volMcapRatio: 0,
      liqMcapRatio: 0,
      flags:        [],
    };
  }

  const volMcapRatio = activeVol / mcap;
  const liqMcapRatio = liq / mcap;

  // ── Rule 1: Vol/MCap ratio too low for claimed activity ───────────────────
  // If a token claims high volume but vol/mcap is near zero, it's wash trading.
  if (volMcapRatio < WASH_TRADE_RATIO && activeVol > 50_000) {
    flags.push(`Wash trade: vol $${(activeVol / 1000).toFixed(0)}k but vol/mcap only ${(volMcapRatio * 100).toFixed(3)}%`);
    confidence += 60;
  } else if (volMcapRatio < MIN_VOL_MCAP_RATIO && activeVol > 10_000) {
    flags.push(`Low vol/mcap ratio: ${(volMcapRatio * 100).toFixed(2)}% (min: ${(MIN_VOL_MCAP_RATIO * 100).toFixed(2)}%)`);
    confidence += 35;
  }

  // ── Rule 2: Liquidity > Market Cap (playbook rule #2) ────────────────────
  if (liqMcapRatio > MAX_LIQ_MCAP_RATIO && mcap > 0 && liq > 0) {
    flags.push(`Liq > MCap: $${(liq / 1000).toFixed(1)}k liq vs $${(mcap / 1000).toFixed(1)}k mcap (${(liqMcapRatio * 100).toFixed(0)}%)`);
    confidence += 40;
  }

  // ── Rule 3: Vol24h impossibly uniform ────────────────────────────────────
  // Real organic volume varies. If 1h vol = exactly 1/24 of 24h vol, it's bots.
  if (vol24h > 0 && vol1h > 0) {
    const hourlyShare = vol1h / vol24h;
    if (hourlyShare > 0.8) {
      flags.push(`Volume spike: ${(hourlyShare * 100).toFixed(0)}% of 24h vol happened in last hour — suspicious`);
      confidence += 20;
    }
  }

  // ── Rule 4: Zero buys/sells but nonzero volume ────────────────────────────
  const buys5m  = pair.txns?.m5?.buys  ?? 0;
  const sells5m = pair.txns?.m5?.sells ?? 0;
  if (vol5m > 5_000 && buys5m === 0 && sells5m === 0) {
    flags.push(`Ghost volume: $${(vol5m / 1000).toFixed(1)}k 5m vol but 0 recorded transactions`);
    confidence += 50;
  }

  // ── Rule 5: Volume massively exceeds realistic trade count ───────────────
  // If vol/trade count implies each trade is unrealistically large
  const totalTrades = buys5m + sells5m;
  if (totalTrades > 0 && vol5m > 0) {
    const avgTradeSize = vol5m / totalTrades;
    if (avgTradeSize > 100_000) {
      flags.push(`Avg trade $${(avgTradeSize / 1000).toFixed(0)}k — bot-level trade sizes`);
      confidence += 25;
    }
  }

  confidence = Math.min(100, confidence);
  const isFake = confidence >= 50;

  const reason = isFake
    ? `Fake volume detected (${confidence}% confidence): ${flags[0]}`
    : flags.length > 0
      ? `Suspicious volume: ${flags[0]}`
      : "Volume appears genuine";

  if (isFake) {
    console.log(`⚠️  FAKE VOLUME: ${pair.baseToken?.symbol} — ${reason}`);
  }

  return { isFake, reason, confidence, volMcapRatio, liqMcapRatio, flags };
}

// ─── Quick check (used in DexScreener filter) ─────────────────────────────────
// Returns true if volume looks real enough to proceed.

export function volumeIsReal(pair: any): boolean {
  const result = detectFakeVolume(pair);
  return !result.isFake;
}

// ─── Logging helper ───────────────────────────────────────────────────────────

export function fakeVolumeSummary(result: FakeVolumeResult): string {
  if (!result.isFake) return "✅ Volume real";
  return `❌ Fake vol (${result.confidence}%): ${result.flags.join(" | ")}`;
}

export interface FakeVolumePlay {
  pair: RawPair;
  result: FakeVolumeResult;
}

export function scanForFakeVolumePlays(pairs: RawPair[]): FakeVolumePlay[] {
  return pairs
    .map((pair) => ({ pair, result: detectFakeVolume(pair) }))
    .filter((entry) => entry.result.isFake && entry.result.confidence >= 50)
    .sort((a, b) => b.result.confidence - a.result.confidence);
}

// File: src/services/scanner/fake-volume-detector.ts

export interface FakeVolumeSignal {
  token: string;
  riskScore: number;           // 0-100
  volumeAnomaly: number;       // % deviation from normal
  walletCluster: boolean;      // Same wallets trading repeatedly
  liquidityWarning: boolean;   // Abnormal liquidity
  confidence: number;          // 0-100
}

type Transaction = any;

export class FakeVolumeDetector {
  async analyzeTx(txSig: string): Promise<FakeVolumeSignal | null> {
    // Fetch transaction from Helius
    const tx = await ((heliusRpc as any).getTransaction?.(txSig) ?? null);
    if (!tx || !tx.token) return null;

    // Check for wash trading patterns
    const walletCluster = await this.detectWalletCluster(tx);

    // Check volume anomaly
    const volumeAnomaly = await this.analyzeVolume(tx);

    // Calculate risk score
    const riskScore = this.calculateRisk({
      walletCluster,
      volumeAnomaly,
      liquidityChange: tx.liquidityChange,
    });

    if (riskScore > 70) {
      return {
        token: tx.token,
        riskScore,
        volumeAnomaly,
        walletCluster,
        liquidityWarning: volumeAnomaly > 200,
        confidence: 85,
      };
    }

    return null;
  }

  private calculateRisk(params: {
    walletCluster: boolean;
    volumeAnomaly: number;
    liquidityChange?: number;
  }): number {
    let score = 0;

    if (params.walletCluster) score += 40;
    if (params.volumeAnomaly > 50) score += 30;
    if (params.volumeAnomaly > 100) score += 20;
    if (params.liquidityChange && Math.abs(params.liquidityChange) > 0.25) {
      score += 10;
    }

    return Math.min(100, score);
  }

  private async detectWalletCluster(tx: Transaction): Promise<boolean> {
    const getTokenTxFn = (heliusRpc as any).getTokenTransactions;
    const recentTxs = Array.isArray(getTokenTxFn)
      ? []
      : await (typeof getTokenTxFn === 'function'
        ? getTokenTxFn.call(heliusRpc, tx.token, { limit: 20 })
        : []);

    if (!Array.isArray(recentTxs) || recentTxs.length === 0) return false;

    const uniqueWallets = new Set(recentTxs.map((t: any) => t.from)).size;
    const walletRatio = uniqueWallets / recentTxs.length;
    return walletRatio < 0.6;
  }

  private async analyzeVolume(tx: Transaction): Promise<number> {
    const recent5min = await getVolume(tx.token, 5);
    const hourAverage = await getVolume(tx.token, 60);

    if (hourAverage === 0) return 0;
    return ((recent5min - hourAverage) / hourAverage) * 100;
  }
}

async function getVolume(token: string, minutes: number): Promise<number> {
  // Placeholder volume retrieval. Replace with real exchange/RPC volume lookup if available.
  return 0;
}
