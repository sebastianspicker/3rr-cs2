import { createClient } from 'redis';
import { RedisStore as RateLimitRedisStore } from 'rate-limit-redis';
import logger from './logger';

export const redisUrl = process.env.REDIS_URL ?? null;

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
export function makeRateLimitStore() {
  if (!redisClient) return undefined;
  return new RateLimitRedisStore({
    sendCommand: (...args: string[]) => redisClient?.sendCommand(args),
  });
}
