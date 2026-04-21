import { createClient } from 'redis';
import { RedisStore as RateLimitRedisStore } from 'rate-limit-redis';
import logger from './logger';

function parsePort(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : fallback;
}

const redisPort = parsePort(process.env.REDIS_PORT || 6379, 6379);
export const redisUrl =
  process.env.REDIS_URL ||
  (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${redisPort}` : null);

// Singleton Redis client — null when Redis is not configured.
export const redisClient = redisUrl
  ? (() => {
      const client = createClient({ url: redisUrl });
      client.on('error', (err: unknown) => {
        logger.error({ err }, '[redis] client error');
      });
      return client;
    })()
  : null;

/**
 * Create a new `RateLimitRedisStore` bound to the shared client.
 * Returns `undefined` when Redis is not configured so rate limiters
 * fall back to the default in-memory store.
 */
export function makeRateLimitStore(): RateLimitRedisStore | undefined {
  if (!redisClient) return undefined;
  return new RateLimitRedisStore({
    sendCommand: (...args: string[]) => redisClient!.sendCommand(args),
  });
}
