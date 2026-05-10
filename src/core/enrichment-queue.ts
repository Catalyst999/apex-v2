import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { enrichTransaction, processSignalJob } from '../services/scanner/onchain-scanner';

const redis = new Redis();

export const enrichmentQueue = new Queue('enrichment', { 
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000, // ← START at 30 seconds (Cloudflare minimum)
    },
    removeOnComplete: true,
  },
});

// Process ONE enrichment at a time with 30+ second gaps
const enrichmentWorker = new Worker(
  'enrichment',
  async (job) => {
    const { signature, program } = job.data;

    try {
      console.log(`[EnrichmentQueue] Processing ${signature.slice(0, 8)}...`);
      
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
      console.error(`[EnrichmentQueue] Error enriching ${signature.slice(0, 8)}...`, error.message);
      throw error; // Will retry with backoff
    }
  },
  {
    connection: redis,
    concurrency: 1, // ← Process ONE at a time
  }
);

enrichmentWorker.on('failed', (job, err) => {
  console.warn(`[EnrichmentQueue] Job ${job?.id} failed:`, err?.message);
});