import axios from "axios";
import { APIS } from "../../core/config";

interface Prices {
  SOL: number;
  BNB: number;
}

let cachedPrices: Prices = { SOL: 0, BNB: 0 };
let lastFetched = 0;
const CACHE_MS = 60_000; // refresh every 60 seconds

export async function getLivePrice(): Promise<Prices> {
  const now = Date.now();
  if (now - lastFetched < CACHE_MS && cachedPrices.SOL > 0) {
    return cachedPrices;
  }

  try {
    const res = await axios.get(
      `${APIS.coingecko}/simple/price?ids=solana,binancecoin&vs_currencies=usd`
    );
    cachedPrices = {
      SOL: res.data.solana.usd,
      BNB: res.data.binancecoin.usd,
    };
    lastFetched = now;
    console.log(`💱 Prices — SOL: $${cachedPrices.SOL} | BNB: $${cachedPrices.BNB}`);
  } catch (err: any) {
    console.error("❌ Price fetch error:", err.message);
  }

  return cachedPrices;
}

export async function usdToSol(usdAmount: number): Promise<number> {
  const prices = await getLivePrice();
  if (prices.SOL === 0) throw new Error("SOL price unavailable");
  return usdAmount / prices.SOL;
}

export async function usdToBnb(usdAmount: number): Promise<number> {
  const prices = await getLivePrice();
  if (prices.BNB === 0) throw new Error("BNB price unavailable");
  return usdAmount / prices.BNB;
}

export async function solToLamports(solAmount: number): Promise<bigint> {
  const lamports = Math.floor(solAmount * 1_000_000_000);
  return BigInt(lamports);
}