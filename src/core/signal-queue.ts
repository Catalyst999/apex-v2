import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { processSignalJob } from '../services/scanner/onchain-scanner';
import { checkRateLimit } from './rpc-throttle';

const useRedis = process.env.NO_REDIS !== 'true';
let redisConnection: Redis | null = null;

if (useRedis) {
  const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };

  redisConnection = new Redis(redisOptions);
}

export const signalQueue = useRedis
  ? new Queue('signals', {
      connection: redisConnection!,
    })
  : {
      add: async (_name: string, data: any) => {
        console.log(
          `[Queue] NO_REDIS enabled. Processing signal inline: ${String(
            data.signature
          ).slice(0, 8)}...`
        );
        await checkRateLimit();
        await processSignalJob(data);
      },
    } as any;

export const signalWorker = useRedis
  ? new Worker(
      'signals',
      async (job: Job) => {
        const { signature, program, timestamp } = job.data as {
          signature: string;
          program: 'raydium' | 'pumpfun' | 'pump_migration';
          timestamp: number;
        };

        await checkRateLimit();
        await processSignalJob({ signature, program, timestamp });
      },
      {
        connection: redisConnection!,
        concurrency: 1,
        lockDuration: 60000,
      }
    )
  : null;

if (signalWorker) {
  signalWorker.on('completed', (job) => {
    console.log(`[Queue] Processed ${String(job.data.signature).slice(0, 8)}...`);
  });

  signalWorker.on('failed', (job, err) => {
    console.error('[Queue] Job failed:', job?.id, err?.message || err);
  });
} else {
  console.log('[Queue] NO_REDIS enabled. Signal queue is running inline without Redis.');
}
