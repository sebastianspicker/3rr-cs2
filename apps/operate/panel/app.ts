import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import logger from './utils/logger';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import type { Request, Response, NextFunction } from 'express';
import { redisClient, makeRateLimitStore } from './utils/redis';
import { better_sqlite_client } from './db';

import rcon from './modules/rcon';
import gameRoutes from './routes/game';
import serverRoutes from './routes/server';
import authRoutes from './routes/auth';
import statusRoutes from './routes/status';
import userRoutes from './routes/users';

const app = express();
app.disable('x-powered-by');

const bodyLimit = '512kb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: bodyLimit, parameterLimit: 100 }));
app.set('query parser', 'simple');

const nodeEnv = process.env.NODE_ENV || 'development';
const trustProxyRaw = process.env.TRUST_PROXY;
if (trustProxyRaw) {
  if (trustProxyRaw === 'true') {
    app.set('trust proxy', 1);
  } else if (trustProxyRaw === 'false') {
    app.set('trust proxy', false);
  } else {
    const trustProxyNum = parseInt(trustProxyRaw, 10);
    app.set(
      'trust proxy',
      Number.isInteger(trustProxyNum) && trustProxyNum >= 1 ? trustProxyNum : trustProxyRaw
    );
  }
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (nodeEnv === 'test') {
    sessionSecret = 'test-session-secret';
  } else if (nodeEnv === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  } else {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    logger.warn(
      '[security] SESSION_SECRET not set; generated a temporary secret for this process.'
    );
  }
}

const weakSessionSecretValues = new Set([
  'change-me',
  'changeme',
  'default',
  'password',
  'secret',
  'session-secret',
  'prod-session-secret',
  'replace-with-a-long-random-secret',
  'do_not_use_change_me',
]);

function isStrongSessionSecret(secret: string): boolean {
  if (secret.length < 32) return false;
  if (/^[A-Za-z0-9]+$/.test(secret) && (/^[A-Za-z]+$/.test(secret) || /^\d+$/.test(secret))) {
    return false;
  }
  if (/^(.)\1+$/.test(secret)) return false;
  if (/^(0123|1234|2345|3456|4567|5678|6789|7890)/.test(secret)) return false;
  return true;
}

if (nodeEnv === 'production') {
  const normalizedSessionSecret = String(sessionSecret).trim();
  if (
    weakSessionSecretValues.has(normalizedSessionSecret.toLowerCase()) ||
    !isStrongSessionSecret(normalizedSessionSecret)
  ) {
    throw new Error(
      'SESSION_SECRET must be a strong secret in production (32+ chars, not a placeholder, and not trivially guessable)'
    );
  }
}

const sameSiteRaw = (process.env.SESSION_COOKIE_SAMESITE || 'strict').toLowerCase();
let cookieSameSite: 'strict' | 'lax' | 'none' = (['strict', 'lax', 'none'] as const).includes(
  sameSiteRaw as 'strict' | 'lax' | 'none'
)
  ? (sameSiteRaw as 'strict' | 'lax' | 'none')
  : 'lax';
const cookieSecure =
  process.env.SESSION_COOKIE_SECURE === 'true' ||
  (nodeEnv === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false');
if (cookieSameSite === 'none' && !cookieSecure) {
  cookieSameSite = 'lax';
  logger.warn(
    '[security] SESSION_COOKIE_SAMESITE=none requires secure cookies; using "lax" instead.'
  );
}
if (cookieSecure && nodeEnv === 'production' && app.get('trust proxy') !== 1) {
  logger.warn(
    '[session] Secure cookies are enabled. Set TRUST_PROXY=1 when running behind a reverse proxy.'
  );
}

function parsePort(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : fallback;
}

let sessionStore: session.Store | undefined;
if (redisClient) {
  sessionStore = new RedisStore({ client: redisClient });
  logger.info('[session] Using Redis session store.');
} else {
  if (nodeEnv === 'production') {
    throw new Error('REDIS_URL (or REDIS_HOST/REDIS_PORT) is required in production');
  }
  logger.warn('[session] Using in-memory session store. Set REDIS_URL for production use.');
}
const DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const sessionMaxAgeMs = (() => {
  const raw = process.env.SESSION_MAX_AGE_MS;
  if (raw == null || raw === '') return DEFAULT_SESSION_MAX_AGE_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SESSION_MAX_AGE_MS;
})();
const sessionCookieNameRaw = process.env.SESSION_COOKIE_NAME || 'cspanel.sid';
const sessionCookieName = /^[A-Za-z0-9_.-]{1,128}$/.test(sessionCookieNameRaw)
  ? sessionCookieNameRaw
  : 'cspanel.sid';
const sessionCookieConfig = {
  httpOnly: true,
  sameSite: cookieSameSite,
  secure: cookieSecure,
  maxAge: sessionMaxAgeMs,
  path: '/',
};

app.set('sessionCookieName', sessionCookieName);
app.set('sessionCookieConfig', sessionCookieConfig);

app.use(
  session({
    name: sessionCookieName,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset maxAge on every request — acts as an idle timeout
    store: sessionStore,
    cookie: sessionCookieConfig,
  })
);

const cspOverride = process.env.CONTENT_SECURITY_POLICY;
if (cspOverride) {
  logger.warn('[security] Custom CSP override active -- ensure it includes nonce-based script-src');
}

function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  const cspHeader =
    cspOverride ||
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self'",
      "font-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Content-Security-Policy', cspHeader);
  if (nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
}
app.use(securityHeadersMiddleware);

function csrfTokensEqual(expected: unknown, supplied: unknown): boolean {
  if (typeof expected !== 'string' || typeof supplied !== 'string') return false;
  const expectedBuf = Buffer.from(expected, 'utf8');
  const suppliedBuf = Buffer.from(supplied, 'utf8');
  if (expectedBuf.length !== suppliedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

function shouldEnforceCsrf(req: Request): boolean {
  if (req.path === '/auth/logout') return true;
  return Boolean(req.session?.user) || Boolean(req.session?.csrfToken);
}

// CSRF token is generated once per session and not rotated per request.
// This is acceptable for the current threat model (single-user panel).
// Full per-request rotation would require additional infrastructure (e.g.
// token-pair or double-submit with server-side state per form).
app.use((req, res, next) => {
  if (!req.session) return next();
  const isPageRequest =
    req.method === 'GET' && !req.path.startsWith('/api/') && path.extname(req.path) === '';
  if (!req.session.csrfToken && (isPageRequest || req.session.user)) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken || '';
  res.locals.isAdmin = req.session.user?.is_admin === 1;
  next();
});

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (!shouldEnforceCsrf(req)) return next();
  const token = req.get('x-csrf-token') || req.body?._csrf;
  if (!csrfTokensEqual(req.session?.csrfToken, token)) {
    const acceptHeader = req.headers['accept'] || '';
    if (acceptHeader.includes('text/html')) {
      return res.status(403).send('Invalid CSRF token');
    }
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  return next();
});

const port = parsePort(process.env.PORT || process.env.DEFAULT_PORT || 3000, 3000);

const rateLimitStore = makeRateLimitStore();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts; try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore,
});
app.use('/auth/login', loginLimiter);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests; slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const normalizeHealthPath = (value: string) => {
      const normalized = value.replace(/\/+$/, '');
      return normalized === '' ? '/' : normalized;
    };
    const pathName = normalizeHealthPath(req.path);
    const originalUrl = normalizeHealthPath(req.originalUrl.split('?')[0] || req.originalUrl);
    return pathName === '/health' || originalUrl === '/api/health';
  },
  store: rateLimitStore ? makeRateLimitStore() : undefined,
});
app.use('/api/', apiLimiter);

const rconConsoleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Too many RCON commands; slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore ? makeRateLimitStore() : undefined,
});
app.use('/api/rcon', rconConsoleLimiter);

const staticDir = (() => {
  const compiledDir = path.join(__dirname, 'public');
  if (fs.existsSync(compiledDir)) return compiledDir;
  return path.join(__dirname, '..', 'public');
})();

// Serve static assets before session middleware so CSS/JS/font requests
// don't create sessions and get aggressive cache headers.
app.use(
  express.static(staticDir, {
    maxAge: '7d',
    immutable: true,
  })
);

// Avoid caching authenticated/dynamic content (applied after static middleware)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.set('view engine', 'ejs');

app.use('/', authRoutes);
app.use('/', serverRoutes);
app.use('/', gameRoutes);
app.use('/', statusRoutes);
app.use('/', userRoutes);

const dbHealthStmt = better_sqlite_client.prepare('SELECT 1');

// Health check for load balancers / k8s
app.get('/api/health', (req, res) => {
  const health: { ok: boolean; db: boolean; redis: boolean | null } = {
    ok: true,
    db: false,
    redis: false,
  };
  try {
    dbHealthStmt.get();
    health.db = true;
  } catch {
    // db may not be ready or not used
  }
  if (redisClient) {
    health.redis = redisClient.isReady === true;
  } else {
    health.redis = null;
  }
  health.ok = health.db && (health.redis === null || health.redis === true);
  const statusCode = health.ok ? 200 : 503;
  const verboseHealth = process.env.HEALTHCHECK_VERBOSE === 'true' || Boolean(req.session?.user);
  if (!verboseHealth) {
    return res.status(statusCode).json({ ok: health.ok });
  }
  return res.status(statusCode).json(health);
});

app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/servers');
  } else {
    res.render('login');
  }
});

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — Express 5 forwards async errors here automatically.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, '[app] unhandled route error');
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

if (require.main === module) {
  (async function start() {
    if (redisClient) {
      try {
        await redisClient.connect();
      } catch (err) {
        logger.error({ err }, '[redis] connect failed');
        process.exit(1);
      }
    }
    const server = app.listen(port, () => {
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' && addr.port ? addr.port : port;
      logger.info({ port: actualPort }, 'Server is running');
    });

    // Graceful shutdown: clean up connections before exit
    const shutdown = async (signal: string) => {
      logger.info({ signal }, '[process] received, shutting down...');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rcon.shutdownAll();
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch {
          // ignore cleanup errors
        }
      }
      try {
        better_sqlite_client.close();
      } catch {
        // ignore cleanup errors
      }
      process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  })().catch((err) => {
    logger.error({ err }, 'Fatal startup error');
    process.exit(1);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, '[process] unhandled promise rejection');
  if (nodeEnv === 'production') {
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  }
});

export default app;
