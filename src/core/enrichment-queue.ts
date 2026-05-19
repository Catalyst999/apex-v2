import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { enrichTransaction, processSignalJob } from '../services/scanner/onchain-scanner';

const useRedis = process.env.NO_REDIS !== 'true';
let redis: Redis | null = null;

if (useRedis) {
  redis = new Redis();
}

export const enrichmentQueue = useRedis
  ? new Queue('enrichment', {
      connection: redis!,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000, // ← START at 30 seconds (Cloudflare minimum)
        },
        removeOnComplete: true,
      },
    })
  : {
      add: async (_name: string, data: any) => {
        const { signature, program } = data;
        console.log(
          `[EnrichmentQueue] NO_REDIS enabled. Inline processing ${String(signature).slice(0, 8)}...`
        );
        try {
          const enriched = await enrichTransaction(signature);
          if (enriched) {
            await processSignalJob({
              signature,
              program,
              ...enriched,
            } as any);
          }
          return { success: true };
        } catch (error: any) {
          console.error(
            `[EnrichmentQueue] Error enriching ${String(signature).slice(0, 8)}...`,
            error.message
          );
          throw error;
        }
      },
    } as any;

const enrichmentWorker = useRedis
  ? new Worker(
      'enrichment',
      async (job) => {
        const { signature, program } = job.data;

        try {
          console.log(`[EnrichmentQueue] Processing ${String(signature).slice(0, 8)}...`);
          const enriched = await enrichTransaction(signature);
          if (enriched) {
            await processSignalJob({
              signature,
              program,
              ...enriched,
            } as any);
          }
          return { success: true };
        } catch (error: any) {
          console.error(`[EnrichmentQueue] Error enriching ${String(signature).slice(0, 8)}...`, error.message);
          throw error;
        }
      },
      {
        connection: redis!,
        concurrency: 1, // ← Process ONE at a time
      }
    )
  : null;

if (useRedis && enrichmentWorker) {
  enrichmentWorker.on('failed', (job, err) => {
    console.warn(`[EnrichmentQueue] Job ${job?.id} failed:`, err?.message);
  });
} else if (!useRedis) {
  console.log('[EnrichmentQueue] NO_REDIS enabled. Enrichment queue is running inline without Redis.');
}