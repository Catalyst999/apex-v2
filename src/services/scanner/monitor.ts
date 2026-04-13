import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA } from "../../core/config";

// WSS connection — saves Alchemy compute units vs polling
const connection = new Connection(SOLANA.rpcUrl, {
  wsEndpoint: SOLANA.wssUrl,
  commitment: "confirmed",
});
// Raydium AMM program — where new SOL pairs are created
const RAYDIUM_AMM = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);

export async function startWssMonitor(
  onNewPair: (signature: string, mint: string) => void
) {
  console.log("🔌 WSS monitor connected — watching Raydium...");

  connection.onLogs(
    RAYDIUM_AMM,
    async (logs) => {
      if (logs.err) return;

      // Look for new pool initialization logs
      const isNewPool = logs.logs.some(
        (log) =>
          log.includes("initialize2") ||
          log.includes("InitializeInstruction2")
      );

      if (!isNewPool) return;

      try {
        // Get transaction details to extract mint address
        const tx = await connection.getParsedTransaction(
          logs.signature,
          { maxSupportedTransactionVersion: 0 }
        );

        if (!tx) return;

        // Extract token mint from transaction accounts
        const accounts = tx.transaction.message.accountKeys;
        const mint = accounts[1]?.pubkey.toBase58();

        if (mint) {
          console.log(`⚡ New pair detected: ${mint}`);
          onNewPair(logs.signature, mint);
        }
      } catch (err) {
        console.error("WSS tx parse error:", err);
      }
    },
    "confirmed"
  );
}