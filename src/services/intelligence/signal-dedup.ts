import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
});

export async function shouldProcessSignal(signature: string): Promise<boolean> {
  const key = `processed:${signature}`;
  const exists = await redis.exists(key);

  if (exists) {
    console.log(`[Dedup] Already processed: ${signature.slice(0, 8)}...`);
    return false;
  }

  await redis.setex(key, 600, '1');
  return true;
}
