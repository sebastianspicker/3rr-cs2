import rateLimit from 'express-rate-limit';
import { rateLimitClientKey } from './clientAddress';

/**
 * Per-route backstop for authenticated API handlers, in addition to the shared
 * `/api/` limiter configured in `app/rateLimits.ts`. It uses the in-process store
 * and a ceiling above the shared limiter so it only bounds a single instance.
 */
export function createRouteRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 100000 : 120,
    message: { error: 'Too many requests; slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitClientKey,
  });
}
