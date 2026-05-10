import { Connection, PublicKey } from "@solana/web3.js";
import { signalQueue } from "../../core/signal-queue";
import { isSignalIngestionPaused } from "../../core/rpc-throttle";
import { SOLANA } from "../../core/config";

// WSS connection — saves RPC compute units vs polling
const connection = new Connection(SOLANA.rpcUrl, {
  wsEndpoint: SOLANA.wssUrl,
  commitment: "confirmed",
});
// Raydium AMM program — where new SOL pairs are created
const RAYDIUM_AMM = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);
const PUMP_FUN = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export async function startWssMonitor(): Promise<void> {
  console.log("🔌 WSS monitor connected — watching Raydium + Pump.fun...");

  const enqueueSignal = async (signature: string, program: string) => {
    if (isSignalIngestionPaused()) {
      console.warn(
        `[WSS] ingestion paused — skipping ${program} ${signature.slice(0, 8)}...`
      );
      return;
    }

    await signalQueue.add(
      'signal',
      { signature, program, timestamp: Date.now() },
      {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );

    console.log(`[WSS] Queued ${program} tx ${signature.slice(0, 8)}...`);
  };

  connection.onLogs(
    RAYDIUM_AMM,
    async (logs) => {
      if (logs.err) return;

      const isNewPool = logs.logs.some(
        (log) =>
          log.includes("initialize2") ||
          log.includes("InitializeInstruction2")
      );

      if (!isNewPool) return;
      await enqueueSignal(logs.signature, 'raydium');
    },
    "confirmed"
  );

  connection.onLogs(
    PUMP_FUN,
    async (logs) => {
      if (logs.err) return;
      await enqueueSignal(logs.signature, 'pumpfun');
    },
    "confirmed"
  );
}
