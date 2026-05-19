import axios from "axios";
import {
  VersionedTransaction,
  Keypair,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { SOLANA, TRADE_AMOUNT_USD, EXECUTION } from "../../core/config";
import { usdToSol, solToLamports } from "./parity";
import { emit } from "../events/event-bus";
import { solanaConnection } from "../rpc/solana-connection";

const JUPITER_API = "https://quote-api.jup.ag/v6";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface TradeResult {
  success: boolean;
  txSignature?: string;
  amountIn?: number;
  amountOut?: number;
  error?: string;
}

export interface QuoteResult {
  success: boolean;
  quote?: any;
  error?: string;
}

export interface SwapResult {
  success: boolean;
  tx?: VersionedTransaction;
  error?: string;
}

export async function getQuote(
  tokenMint: string,
  lamports: number,
  slippageBps: number
): Promise<QuoteResult> {
  try {
    const quoteRes = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: SOL_MINT,
        outputMint: tokenMint,
        amount: lamports.toString(),
        slippageBps,
      },
    });

    return {
      success: true,
      quote: quoteRes.data,
    };
  } catch (err: any) {
    console.error("❌ Jupiter quote error:", err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

export async function buildSwap(
  quote: any,
  walletKeypair: Keypair
): Promise<SwapResult> {
  try {
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: walletKeypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: SOLANA.priorityFeeLamports,
    });

    const { swapTransaction } = swapRes.data;

    // Deserialize transaction
    const txBuf = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([walletKeypair]);

    return {
      success: true,
      tx,
    };
  } catch (err: any) {
    console.error("❌ Jupiter swap build error:", err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

export async function buyToken(
  tokenMint: string,
  slippageBps: number,
  walletKeypair?: Keypair,
): Promise<TradeResult> {
  try {
    const signer = walletKeypair || SOLANA.keypair;
    if (!signer) {
      throw new Error('Missing Solana keypair configuration. Set wallet keypair or SOLANA_KEYPAIR_SECRET/SOLANA_KEY_PATH.');
    }

    // Convert USD to SOL
    const solAmount = await usdToSol(TRADE_AMOUNT_USD);
    const lamports = await solToLamports(solAmount);

    console.log(`🛒 Buying ${tokenMint}`);
    console.log(`💰 Amount: $${TRADE_AMOUNT_USD} = ${solAmount.toFixed(6)} SOL`);

    if (EXECUTION.MODE === 'shadow' || EXECUTION.DRY_RUN || !EXECUTION.LIVE_TRADING) {
      console.log('[Jupiter] Shadow/Dry-run mode enabled, skipping blockchain broadcast.');
      return {
        success: true,
        txSignature: 'SIMULATED',
        amountIn: Number(lamports),
        amountOut: 0,
      };
    }

    // Step 1: Get quote from Jupiter
    const quoteRes = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: SOL_MINT,
        outputMint: tokenMint,
        amount: lamports.toString(),
        slippageBps,
      },
    });

    const quote = quoteRes.data;
    console.log(`📊 Quote received — out: ${quote.outAmount}`);

    // Step 2: Get swap transaction
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: signer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: SOLANA.priorityFeeLamports,
    });

    const { swapTransaction } = swapRes.data;

    // Step 3: Deserialize and sign transaction
    const txBuf = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([signer]);

    // Step 4: Send transaction
    const connection = solanaConnection.getBestConnection();
    const txSignature = await connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: false, maxRetries: 3 }
    );

    console.log(`✅ Buy tx sent: ${txSignature}`);

    const confirmation = await connection.confirmTransaction(txSignature, 'finalized');
    if (confirmation.value?.err) {
      throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`✅ Finalized: https://solscan.io/tx/${txSignature}`);

    return {
      success: true,
      txSignature,
      amountIn: Number(lamports),
      amountOut: Number(quote.outAmount),
    };

  } catch (err: any) {
    console.error("❌ Jupiter buy error:", err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

export async function sellToken(
  tokenMint: string,
  tokenAmount: string,
  slippageBps: number,
  walletKeypair?: Keypair,
): Promise<TradeResult> {
  try {
    const signer = walletKeypair || SOLANA.keypair;
    if (!signer) {
      throw new Error('Missing Solana keypair configuration. Set wallet keypair or SOLANA_KEYPAIR_SECRET/SOLANA_KEY_PATH.');
    }

    console.log(`💸 Selling ${tokenAmount} of ${tokenMint}`);

    if (EXECUTION.MODE === 'shadow' || EXECUTION.DRY_RUN || !EXECUTION.LIVE_TRADING) {
      console.log('[Jupiter] Shadow/Dry-run mode enabled, skipping blockchain broadcast.');
      return {
        success: true,
        txSignature: 'SIMULATED',
        amountIn: Number(tokenAmount),
        amountOut: 0,
      };
    }

    // Step 1: Get quote SOL output
    const quoteRes = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: tokenMint,
        outputMint: SOL_MINT,
        amount: tokenAmount,
        slippageBps,
      },
    });

    const quote = quoteRes.data;

    // Step 2: Get swap transaction
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: signer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: SOLANA.priorityFeeLamports,
    });

    const { swapTransaction } = swapRes.data;

    // Step 3: Sign and send
    const txBuf = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([signer]);

    const connection = solanaConnection.getBestConnection();
    const txSignature = await connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: false, maxRetries: 3 }
    );

    const confirmation = await connection.confirmTransaction(txSignature, 'finalized');
    if (confirmation.value?.err) {
      throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`✅ Sell finalized: https://solscan.io/tx/${txSignature}`);

    return {
      success: true,
      txSignature,
      amountIn: Number(tokenAmount),
      amountOut: Number(quote.outAmount),
    };

  } catch (err: any) {
    console.error("❌ Jupiter sell error:", err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}