// src/services/scoring/smart-wallet-tracker.ts
// Catalyst Apex Trader v2.2 — Smart Wallet Tracker
//
// Two modes:
// 1. AUTO-DETECTION — scores early buyers of every successful token.
//    Wallets with 60%+ win rate across 5+ trades become "smart money".
// 2. MANUAL TRACKING — you add specific wallets via /addwallet command.
//    These are watched 24/7 and any new buy triggers an immediate alert.
//
// Supabase tables needed:
//   smart_wallets  (address, label, win_rate, total_trades, wins, is_manual, added_at)
//   wallet_trades  (wallet, token_address, entry_price, outcome, pnl_pct, tracked_at)

import axios   from "axios";
import { HELIUS } from "../../core/config";
import { supabase } from "../../db/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartWallet {
  address:      string;
  label:        string;       // e.g. "LongzuAlpha", "Auto-detected #42"
  win_rate:     number;       // 0.0 - 1.0
  total_trades: number;
  wins:         number;
  is_manual:    boolean;
  added_at:     string;
}

export interface SmartWalletBuy {
  wallet:       SmartWallet;
  tokenAddress: string;
  amountSol:    number;
  timestamp:    number;
}

// ─── Manual wallet list (seeded from your alpha research) ─────────────────────
// Add KOL wallets from on-chain data here.
// These are watched immediately on bot start.

const SEED_WALLETS: { address: string; label: string }[] = [
  // Add known smart money wallets here as you discover their on-chain addresses
  // Example:
  // { address: "WALLET_ADDRESS_HERE", label: "LongzuAlpha" },
  // { address: "WALLET_ADDRESS_HERE", label: "NachSOL" },
  // { address: "WALLET_ADDRESS_HERE", label: "Ed_x0101" },
];

// ─── Helius RPC helpers ───────────────────────────────────────────────────────

const HELIUS_RPC      = () => `https://mainnet.helius-rpc.com/?api-key=${HELIUS.apiKey}`;
const HELIUS_ENHANCED = () => `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS.apiKey}`;

async function getRecentWalletTxs(walletAddress: string, limit = 10): Promise<any[]> {
  try {
    const sigRes = await axios.post(
      HELIUS_RPC(),
      {
        jsonrpc: "2.0", id: 1,
        method:  "getSignaturesForAddress",
        params:  [walletAddress, { limit, commitment: "confirmed" }],
      },
      { timeout: 10000 }
    );
    const sigs: string[] = (sigRes.data?.result ?? []).map((r: any) => r.signature).filter(Boolean);
    if (sigs.length === 0) return [];

    const txRes = await axios.post(
      HELIUS_ENHANCED(),
      { transactions: sigs },
      { timeout: 12000 }
    );
    return txRes.data ?? [];
  } catch {
    return [];
  }
}

// ─── Auto-detection: score early buyers of a token ────────────────────────────

export async function scoreEarlyBuyers(
  tokenAddress: string,
  poolCreatedAt: number,
): Promise<void> {
  try {
    // Only score tokens that are now > 2 hours old (enough time to see outcome)
    const ageHours = (Date.now() / 1000 - poolCreatedAt) / 3600;
    if (ageHours < 2) return;

    // Get current price to determine if early buyers won
    const priceRes = await axios.get(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`,
      { timeout: 8000 }
    );
    const pair = (priceRes.data ?? [])[0];
    if (!pair) return;

    const priceChangeH1 = pair.priceChange?.h1 ?? 0;
    const won           = priceChangeH1 >= 50; // 50%+ gain = win

    // Get the first 20 buyers
    const sigRes = await axios.post(
      HELIUS_RPC(),
      {
        jsonrpc: "2.0", id: 1,
        method:  "getSignaturesForAddress",
        params:  [tokenAddress, { limit: 20, commitment: "confirmed" }],
      },
      { timeout: 10000 }
    );
    const sigs: string[] = (sigRes.data?.result ?? []).map((r: any) => r.signature).filter(Boolean);
    if (sigs.length === 0) return;

    const txRes = await axios.post(HELIUS_ENHANCED(), { transactions: sigs }, { timeout: 12000 });
    const txs: any[] = (txRes.data ?? []).filter(
      (tx: any) => tx.type === "SWAP" || tx.description?.toLowerCase().includes("swap")
    );

    const earlyBuyers = new Set<string>();
    for (const tx of txs) {
      const buyer = tx.feePayer ?? tx.signers?.[0];
      if (buyer) earlyBuyers.add(buyer);
    }

    // Update each buyer's record in smart_wallets
    for (const wallet of earlyBuyers) {
      const { data: existing } = await supabase
        .from("smart_wallets")
        .select("*")
        .eq("address", wallet)
        .single();

      if (existing) {
        const newWins   = existing.wins + (won ? 1 : 0);
        const newTotal  = existing.total_trades + 1;
        const newRate   = newWins / newTotal;
        await supabase.from("smart_wallets").update({
          wins:         newWins,
          total_trades: newTotal,
          win_rate:     newRate,
        }).eq("address", wallet);
      } else {
        // New wallet — create record
        await supabase.from("smart_wallets").insert({
          address:      wallet,
          label:        `Auto #${wallet.slice(0, 6)}`,
          win_rate:     won ? 1.0 : 0.0,
          total_trades: 1,
          wins:         won ? 1 : 0,
          is_manual:    false,
          added_at:     new Date().toISOString(),
        });
      }
    }
  } catch (err: any) {
    // Non-critical — don't crash pipeline
    console.warn(`⚠️  Smart wallet scoring skipped: ${err.message}`);
  }
}

// ─── Check if a token was bought by known smart wallets ───────────────────────

export async function checkSmartWalletPresence(tokenAddress: string): Promise<{
  found:         boolean;
  wallets:       SmartWallet[];
  totalAmountSol: number;
}> {
  try {
    const sigRes = await axios.post(
      HELIUS_RPC(),
      {
        jsonrpc: "2.0", id: 1,
        method:  "getSignaturesForAddress",
        params:  [tokenAddress, { limit: 30, commitment: "confirmed" }],
      },
      { timeout: 10000 }
    );
    const sigs: string[] = (sigRes.data?.result ?? []).map((r: any) => r.signature).filter(Boolean);
    if (sigs.length === 0) return { found: false, wallets: [], totalAmountSol: 0 };

    const txRes = await axios.post(HELIUS_ENHANCED(), { transactions: sigs }, { timeout: 12000 });
    const txs: any[] = txRes.data ?? [];

    const buyers = txs.map((tx: any) => tx.feePayer ?? tx.signers?.[0]).filter(Boolean);
    if (buyers.length === 0) return { found: false, wallets: [], totalAmountSol: 0 };

    // Check against smart_wallets table (win_rate >= 0.6, total_trades >= 5)
    const { data: smartWallets } = await supabase
      .from("smart_wallets")
      .select("*")
      .in("address", buyers)
      .gte("win_rate", 0.6)
      .gte("total_trades", 5);

    const found = (smartWallets ?? []) as SmartWallet[];

    if (found.length === 0) return { found: false, wallets: [], totalAmountSol: 0 };

    // Calculate total SOL they put in
    let totalSol = 0;
    for (const tx of txs) {
      const buyer = tx.feePayer ?? tx.signers?.[0];
      if (found.some((w) => w.address === buyer)) {
        const nativeTransfers: any[] = tx.nativeTransfers ?? [];
        const sol = nativeTransfers
          .filter((t: any) => t.fromUserAccount === buyer)
          .reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0) / 1e9;
        totalSol += sol;
      }
    }

    console.log(`🧠 Smart money detected: ${found.length} wallet(s) in ${tokenAddress.slice(0, 8)}...`);
    return { found: true, wallets: found, totalAmountSol: totalSol };

  } catch (err: any) {
    console.warn(`⚠️  Smart wallet check error: ${err.message}`);
    return { found: false, wallets: [], totalAmountSol: 0 };
  }
}

// ─── Monitor manual wallets for new buys ─────────────────────────────────────

export async function scanManualWallets(): Promise<SmartWalletBuy[]> {
  const buys: SmartWalletBuy[] = [];

  try {
    const { data: manualWallets } = await supabase
      .from("smart_wallets")
      .select("*")
      .eq("is_manual", true);

    if (!manualWallets || manualWallets.length === 0) return buys;

    const cutoff = Math.floor(Date.now() / 1000) - 5 * 60; // last 5 minutes

    for (const wallet of manualWallets as SmartWallet[]) {
      const txs = await getRecentWalletTxs(wallet.address, 5);

      for (const tx of txs) {
        if ((tx.timestamp ?? 0) < cutoff) continue;
        if (tx.type !== "SWAP" && !tx.description?.toLowerCase().includes("swap")) continue;

        const SOL_MINT     = "So11111111111111111111111111111111111111112";
        const tokenTransfer = (tx.tokenTransfers ?? []).find(
          (t: any) => t.mint && t.mint !== SOL_MINT && t.toUserAccount === wallet.address
        );
        if (!tokenTransfer) continue;

        const nativeTransfers: any[] = tx.nativeTransfers ?? [];
        const amountSol = nativeTransfers
          .filter((t: any) => t.fromUserAccount === wallet.address)
          .reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0) / 1e9;

        if (amountSol < 0.1) continue; // ignore dust

        // Check we haven't already alerted this tx
        const { data: existing } = await supabase
          .from("wallet_trades")
          .select("id")
          .eq("wallet", wallet.address)
          .eq("token_address", tokenTransfer.mint)
          .single();

        if (existing) continue;

        // Log the trade
        await supabase.from("wallet_trades").insert({
          wallet:        wallet.address,
          token_address: tokenTransfer.mint,
          entry_price:   0,
          outcome:       "pending",
          pnl_pct:       0,
          tracked_at:    new Date().toISOString(),
        });

        buys.push({
          wallet,
          tokenAddress: tokenTransfer.mint as string,
          amountSol,
          timestamp:    tx.timestamp,
        });

        console.log(`🧠 Manual wallet buy: ${wallet.label} → ${tokenTransfer.mint} (${amountSol.toFixed(2)} SOL)`);
      }
    }
  } catch (err: any) {
    console.error("❌ Manual wallet scan error:", err.message);
  }

  return buys;
}

// ─── Add a wallet manually (called from Telegram /addwallet command) ──────────

export async function addManualWallet(address: string, label: string): Promise<boolean> {
  try {
    await supabase.from("smart_wallets").upsert({
      address,
      label,
      win_rate:     0,
      total_trades: 0,
      wins:         0,
      is_manual:    true,
      added_at:     new Date().toISOString(),
    });
    console.log(`✅ Manual wallet added: ${label} (${address})`);
    return true;
  } catch (err: any) {
    console.error("❌ Add wallet error:", err.message);
    return false;
  }
}

// ─── Remove a manual wallet ───────────────────────────────────────────────────

export async function removeManualWallet(address: string): Promise<void> {
  await supabase.from("smart_wallets").delete().eq("address", address).eq("is_manual", true);
  console.log(`🗑️  Manual wallet removed: ${address}`);
}

// ─── List all tracked wallets ─────────────────────────────────────────────────

export async function listTrackedWallets(): Promise<SmartWallet[]> {
  const { data } = await supabase
    .from("smart_wallets")
    .select("*")
    .order("win_rate", { ascending: false });
  return (data ?? []) as SmartWallet[];
}

// ─── Seed manual wallets on startup ──────────────────────────────────────────

export async function seedManualWallets(): Promise<void> {
  if (SEED_WALLETS.length === 0) return;
  for (const w of SEED_WALLETS) {
    await addManualWallet(w.address, w.label);
  }
  console.log(`✅ Seeded ${SEED_WALLETS.length} manual wallets`);
}