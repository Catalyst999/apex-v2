import axios from "axios";
import { APIS } from "../../core/config";

interface GoPlusResult {
  is_honeypot: string;
  is_blacklisted: string;
  is_mintable: string;
  owner_address: string;
  creator_address: string;
  buy_tax: string;
  sell_tax: string;
  cannot_sell_all: string;
  trading_cooldown: string;
}

export interface SecurityResult {
  passed: boolean;
  reason?: string;
  details: {
    isHoneypot: boolean;
    isBlacklisted: boolean;
    isMintable: boolean;
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

    const data: GoPlusResult = res.data?.result?.[tokenAddress.toLowerCase()];

    if (!data) {
      return {
        passed: false,
        reason: "No GoPlus data found",
        details: {
          isHoneypot: false,
          isBlacklisted: false,
          isMintable: false,
          buyTax: 0,
          sellTax: 0,
        },
      };
    }

    // Hard filters
    if (data.is_honeypot === "1") {
      return {
        passed: false,
        reason: "HONEYPOT detected",
        details: {
          isHoneypot: true,
          isBlacklisted: data.is_blacklisted === "1",
          isMintable: data.is_mintable === "1",
          buyTax: parseFloat(data.buy_tax ?? "0"),
          sellTax: parseFloat(data.sell_tax ?? "0"),
        },
      };
    }

    if (data.is_blacklisted === "1") {
      return {
        passed: false,
        reason: "Token is BLACKLISTED",
        details: {
          isHoneypot: false,
          isBlacklisted: true,
          isMintable: data.is_mintable === "1",
          buyTax: parseFloat(data.buy_tax ?? "0"),
          sellTax: parseFloat(data.sell_tax ?? "0"),
        },
      };
    }

    if (data.is_mintable === "1") {
      return {
        passed: false,
        reason: "Token is MINTABLE — rug risk",
        details: {
          isHoneypot: false,
          isBlacklisted: false,
          isMintable: true,
          buyTax: parseFloat(data.buy_tax ?? "0"),
          sellTax: parseFloat(data.sell_tax ?? "0"),
        },
      };
    }

    return {
      passed: true,
      details: {
        isHoneypot: false,
        isBlacklisted: false,
        isMintable: false,
        buyTax: parseFloat(data.buy_tax ?? "0"),
        sellTax: parseFloat(data.sell_tax ?? "0"),
      },
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
        buyTax: 0,
        sellTax: 0,
      },
    };
  }
}