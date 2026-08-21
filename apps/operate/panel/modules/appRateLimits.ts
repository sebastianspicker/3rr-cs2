import { isIP } from 'node:net';
import type { Express } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { makeRateLimitStore } from '../utils/redis';

const INVALID_CLIENT_IP_KEY = 'invalid-client-ip';

/**
 * Keep malformed proxy input in one bounded rate-limit bucket. Express's
 * request IP is still used unchanged for valid direct and forwarded clients.
 */
export function rateLimitClientKey(request: { ip?: string }): string {
  return typeof request.ip === 'string' && isIP(request.ip) !== 0
    ? ipKeyGenerator(request.ip)
    : INVALID_CLIENT_IP_KEY;
}

function normalizeHealthPath(value: string): string {
  const normalized = value.replace(/\/+$/, '');
  return normalized === '' ? '/' : normalized;
}

export function configureRateLimits(app: Express, nodeEnv: string): void {
  const sharedStore = makeRateLimitStore();
  app.use(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      message: { error: 'Too many login attempts; try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: rateLimitClientKey,
      store: sharedStore,
    })
  );
  app.use(
    '/api/',
    rateLimit({
      windowMs: 60 * 1000,
      max: nodeEnv === 'test' ? 1000 : 60,
      message: { error: 'Too many requests; slow down.' },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: rateLimitClientKey,
      skip: (req) => {
        const pathName = normalizeHealthPath(req.path);
        const originalUrl = normalizeHealthPath(req.originalUrl.split('?')[0] || req.originalUrl);
        return pathName === '/health' || originalUrl === '/api/health';
      },
      store: sharedStore ? makeRateLimitStore() : undefined,
    })
  );
  app.post(
    '/api/rcon',
    rateLimit({
      windowMs: 60 * 1000,
      max: nodeEnv === 'test' ? 1000 : 15,
      message: { error: 'Too many RCON commands; slow down.' },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: rateLimitClientKey,
      store: sharedStore ? makeRateLimitStore() : undefined,
    })
  );
}
