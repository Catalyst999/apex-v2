import axios from "axios";
import {
  Connection,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { SOLANA, TRADE_AMOUNT_USD } from "../../core/config";
import { usdToSol, solToLamports } from "./parity";

const connection = new Connection(SOLANA.RPC_URL, "confirmed");
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

export async function buyToken(
  tokenMint: string,
): Promise<TradeResult> {
  try {
    // Convert USD to SOL
    const solAmount = await usdToSol(TRADE_AMOUNT_USD);
    const lamports = await solToLamports(solAmount);

    console.log(`🛒 Buying ${tokenMint}`);
    console.log(`💰 Amount: $${TRADE_AMOUNT_USD} = ${solAmount.toFixed(6)} SOL`);

    // Step 1: Get quote from Jupiter
    const quoteRes = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: SOL_MINT,
        outputMint: tokenMint,
        amount: lamports.toString(),
        slippageBps: SOLANA.maxSlippageBps,
      },
    });

    const quote = quoteRes.data;
    console.log(`📊 Quote received — out: ${quote.outAmount}`);

    // Step 2: Get swap transaction
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: SOLANA.keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: SOLANA.priorityFeeLamports,
    });

    const { swapTransaction } = swapRes.data;

    // Step 3: Deserialize and sign transaction
    const txBuf = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([SOLANA.keypair]);

    // Step 4: Send transaction
    const txSignature = await connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: false, maxRetries: 3 }
    );

    console.log(`✅ Buy tx sent: ${txSignature}`);

    // Step 5: Confirm
    await connection.confirmTransaction(txSignature, "confirmed");
    console.log(`✅ Confirmed: https://solscan.io/tx/${txSignature}`);

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
): Promise<TradeResult> {
  try {
    console.log(`💸 Selling ${tokenAmount} of ${tokenMint}`);

    // Step 1: Get quote SOL output
    const quoteRes = await axios.get(`${JUPITER_API}/quote`, {
      params: {
        inputMint: tokenMint,
        outputMint: SOL_MINT,
        amount: tokenAmount,
        slippageBps: SOLANA.maxSlippageBps,
      },
    });

    const quote = quoteRes.data;

    // Step 2: Get swap transaction
    const swapRes = await axios.post(`${JUPITER_API}/swap`, {
      quoteResponse: quote,
      userPublicKey: SOLANA.keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: SOLANA.priorityFeeLamports,
    });

    const { swapTransaction } = swapRes.data;

    // Step 3: Sign and send
    const txBuf = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([SOLANA.keypair]);

    const txSignature = await connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: false, maxRetries: 3 }
    );

    await connection.confirmTransaction(txSignature, "confirmed");
    console.log(`✅ Sell confirmed: https://solscan.io/tx/${txSignature}`);

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