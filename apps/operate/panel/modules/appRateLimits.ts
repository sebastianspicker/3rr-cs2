import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { makeRateLimitStore } from '../utils/redis';

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
      store: sharedStore ? makeRateLimitStore() : undefined,
    })
  );
}
