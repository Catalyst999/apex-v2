import axios from "axios";
import { APIS } from "../../core/config";

interface GoPlusResult {
  is_honeypot: string;
  is_blacklisted: string;
  is_mintable: string;
  is_open_source: string;
  owner_address: string;
  creator_address: string;
  buy_tax: string;
  sell_tax: string;
  cannot_sell_all: string;
  trading_cooldown: string;
  holder_count: string;
  lp_holder_analysis: LpHolder[];
  holders: HolderInfo[];
  top_holders?: HolderInfo[];
}

interface LpHolder {
  address: string;
  balance: string;
  is_burnt: string;
  is_locked: string;
  percent: string;
  tag: string;
}

interface HolderInfo {
  address: string;
  balance: string;
  is_contract: string;
  is_locked: string;
  percent: string;
  tag: string;
}

export interface SecurityResult {
  passed: boolean;
  reason?: string;
  details: {
    isHoneypot: boolean;
    isBlacklisted: boolean;
    isMintable: boolean;
    isLiquidityLocked: boolean;
    liquidityBurnt: boolean;
    holderCount: number;
    topHolderPercent: number;
    buyTax: number;
    sellTax: number;
  };
}

export async function checkGoPlus(
  tokenAddress: string,
  chain: "solana" | "bsc"
): Promise<SecurityResult> {
  try {
    const chainId = chain === "solana" ? "solana" : "56";
    const res = await axios.get(
      `${APIS.goPlus}/token_security/${chainId}?contract_addresses=${tokenAddress}`
    );

    const data: GoPlusResult =
      res.data?.result?.[tokenAddress.toLowerCase()];

    if (!data) {
      return {
        passed: false,
        reason: "No GoPlus data found",
        details: {
          isHoneypot: false,
          isBlacklisted: false,
          isMintable: false,
          isLiquidityLocked: false,
          liquidityBurnt: false,
          holderCount: 0,
          topHolderPercent: 0,
          buyTax: 0,
          sellTax: 0,
        },
      };
    }

    // ── Honeypot ─────────────────────────────────────────
    if (data.is_honeypot === "1") {
      return {
        passed: false,
        reason: "HONEYPOT detected",
        details: buildDetails(data, false, false),
      };
    }

    // ── Blacklisted ──────────────────────────────────────
    if (data.is_blacklisted === "1") {
      return {
        passed: false,
        reason: "Token is BLACKLISTED",
        details: buildDetails(data, false, false),
      };
    }

    // ── Mintable ─────────────────────────────────────────
    if (data.is_mintable === "1") {
      return {
        passed: false,
        reason: "Token is MINTABLE — rug risk",
        details: buildDetails(data, false, false),
      };
    }

    // ── Liquidity Lock Check ─────────────────────────────
    // Guide: "Unlocked liquidity means instant zero. Never skip this."
    const lpHolders = data.lp_holder_analysis ?? [];
    const isLiquidityBurnt = lpHolders.some((lp) => lp.is_burnt === "1");
    const isLiquidityLocked = lpHolders.some(
      (lp) => lp.is_locked === "1" || lp.is_burnt === "1"
    );

    if (!isLiquidityLocked && !isLiquidityBurnt && lpHolders.length > 0) {
      return {
        passed: false,
        reason: "Liquidity NOT locked or burnt — instant rug risk",
        details: buildDetails(data, false, false),
      };
    }

    // ── Single holder > 5% (guide: be cautious above 5%) ─
    const holders = data.holders ?? [];
    const dangerousHolder = holders.find(
      (h) => parseFloat(h.percent ?? "0") > 0.05 && h.is_contract !== "1"
    );
    if (dangerousHolder) {
      return {
        passed: false,
        reason: `Single wallet holds ${(parseFloat(dangerousHolder.percent) * 100).toFixed(1)}% — whale risk`,
        details: buildDetails(data, isLiquidityLocked, isLiquidityBurnt),
      };
    }

    // ── Holder count too low ─────────────────────────────
    // Guide: "holder count above 30 in first minutes"
    const holderCount = parseInt(data.holder_count ?? "0");
    if (holderCount > 0 && holderCount < 15) {
      return {
        passed: false,
        reason: `Only ${holderCount} holders — likely farm setup`,
        details: buildDetails(data, isLiquidityLocked, isLiquidityBurnt),
      };
    }

    // ── Tax check ────────────────────────────────────────
    const buyTax = parseFloat(data.buy_tax ?? "0");
    const sellTax = parseFloat(data.sell_tax ?? "0");
    if (buyTax > 10 || sellTax > 10) {
      return {
        passed: false,
        reason: `High tax — buy: ${buyTax}% sell: ${sellTax}%`,
        details: buildDetails(data, isLiquidityLocked, isLiquidityBurnt),
      };
    }

    return {
      passed: true,
      details: buildDetails(data, isLiquidityLocked, isLiquidityBurnt),
    };
  } catch (err: any) {
    console.error("❌ GoPlus error:", err.message);
    return {
      passed: false,
      reason: "GoPlus check failed",
      details: {
        isHoneypot: false,
        isBlacklisted: false,
        isMintable: false,
        isLiquidityLocked: false,
        liquidityBurnt: false,
        holderCount: 0,
        topHolderPercent: 0,
        buyTax: 0,
        sellTax: 0,
      },
    };
  }
}

function buildDetails(
  data: GoPlusResult,
  isLiquidityLocked: boolean,
  liquidityBurnt: boolean
) {
  const holders = data.holders ?? [];
  const topHolder = holders.reduce((max, h) => {
    const pct = parseFloat(h.percent ?? "0");
    return pct > max ? pct : max;
  }, 0);

  return {
    isHoneypot: data.is_honeypot === "1",
    isBlacklisted: data.is_blacklisted === "1",
    isMintable: data.is_mintable === "1",
    isLiquidityLocked,
    liquidityBurnt,
    holderCount: parseInt(data.holder_count ?? "0"),
    topHolderPercent: topHolder * 100,
    buyTax: parseFloat(data.buy_tax ?? "0"),
    sellTax: parseFloat(data.sell_tax ?? "0"),
  };
}