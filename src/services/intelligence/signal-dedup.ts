import Redis from 'ioredis';

const useRedis = process.env.NO_REDIS !== 'true';
let redis: Redis | null = null;

if (useRedis) {
  redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  });
}

const localDedup = new Map<string, NodeJS.Timeout>();

export async function shouldProcessSignal(signature: string): Promise<boolean> {
  const key = `processed:${signature}`;

  if (!useRedis) {
    if (localDedup.has(key)) {
      console.log(`[Dedup] NO_REDIS enabled. Already processed: ${signature.slice(0, 8)}...`);
      return false;
    }

    localDedup.set(
      key,
      setTimeout(() => {
        localDedup.delete(key);
      }, 600000)
    );

    return true;
  }

  const exists = await redis!.exists(key);

  if (exists) {
    console.log(`[Dedup] Already processed: ${signature.slice(0, 8)}...`);
    return false;
  }

  await redis!.setex(key, 600, '1');
  return true;
}
