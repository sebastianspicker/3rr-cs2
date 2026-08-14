import crypto from 'node:crypto';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import logger from '../utils/logger';
import { redisClient } from '../utils/redis';

const DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
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

const hasSingleCharacterClass = (secret: string): boolean =>
  /^[A-Za-z0-9]+$/.test(secret) && (/^[A-Za-z]+$/.test(secret) || /^\d+$/.test(secret));

const hasRepeatedCharacter = (secret: string): boolean =>
  secret.length > 0 && new Set(secret).size === 1;

const hasSequentialDigits = (secret: string): boolean =>
  /^(0123|1234|2345|3456|4567|5678|6789|7890)/.test(secret);

function isStrongSessionSecret(secret: string): boolean {
  if (secret.length < 32) return false;
  return !(
    hasSingleCharacterClass(secret) ||
    hasRepeatedCharacter(secret) ||
    hasSequentialDigits(secret)
  );
}

function resolveSessionSecret(nodeEnv: string): string {
  const configuredSecret = process.env.SESSION_SECRET;
  if (configuredSecret) return configuredSecret;
  if (nodeEnv === 'test') return 'test-session-secret';
  if (nodeEnv === 'production') throw new Error('SESSION_SECRET must be set in production');
  const generatedSecret = crypto.randomBytes(32).toString('hex');
  logger.warn('[security] SESSION_SECRET not set; generated a temporary secret for this process.');
  return generatedSecret;
}

function validateProductionSessionSecret(secret: string, nodeEnv: string): void {
  if (nodeEnv !== 'production') return;
  const normalized = secret.trim();
  if (weakSessionSecretValues.has(normalized.toLowerCase()) || !isStrongSessionSecret(normalized)) {
    throw new Error(
      'SESSION_SECRET must be a strong secret in production (32+ chars, not a placeholder, and not trivially guessable)'
    );
  }
}

function configureTrustProxy(app: Express): void {
  const raw = process.env.TRUST_PROXY;
  if (!raw) return;
  if (raw === 'true') {
    app.set('trust proxy', 1);
    return;
  }
  if (raw === 'false') {
    app.set('trust proxy', false);
    return;
  }
  const numericValue = parseInt(raw, 10);
  app.set('trust proxy', Number.isInteger(numericValue) && numericValue >= 1 ? numericValue : raw);
}

function resolveCookieSettings(app: Express, nodeEnv: string) {
  const sameSiteRaw = (process.env.SESSION_COOKIE_SAMESITE ?? 'strict').toLowerCase();
  let sameSite: 'strict' | 'lax' | 'none' = (['strict', 'lax', 'none'] as const).includes(
    sameSiteRaw as 'strict' | 'lax' | 'none'
  )
    ? (sameSiteRaw as 'strict' | 'lax' | 'none')
    : 'lax';
  const secure =
    process.env.SESSION_COOKIE_SECURE === 'true' ||
    (nodeEnv === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false');
  if (sameSite === 'none' && !secure) {
    sameSite = 'lax';
    logger.warn(
      '[security] SESSION_COOKIE_SAMESITE=none requires secure cookies; using "lax" instead.'
    );
  }
  if (secure && nodeEnv === 'production' && app.get('trust proxy') !== 1) {
    logger.warn(
      '[session] Secure cookies are enabled. Set TRUST_PROXY=1 when running behind a reverse proxy.'
    );
  }
  return { sameSite, secure };
}

function resolveSessionMaxAge(): number {
  const raw = process.env.SESSION_MAX_AGE_MS;
  if (raw == null || raw === '') return DEFAULT_SESSION_MAX_AGE_MS;
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_MAX_AGE_MS;
}

function resolveSessionCookieName(): string {
  const raw = process.env.SESSION_COOKIE_NAME ?? '3rr.sid';
  return /^[A-Za-z0-9_.-]{1,128}$/.test(raw) ? raw : '3rr.sid';
}

function createSessionStore(nodeEnv: string) {
  if (redisClient) {
    logger.info('[session] Using Redis session store.');
    return new RedisStore({ client: redisClient });
  }
  if (nodeEnv === 'production') throw new Error('REDIS_URL is required in production');
  logger.warn('[session] Using in-memory session store. Set REDIS_URL for production use.');
  return undefined;
}

function createSecurityHeadersMiddleware(nodeEnv: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    const cspHeader = [
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
  };
}

const csrfTokensEqual = (expected: unknown, supplied: unknown): boolean => {
  if (typeof expected !== 'string' || typeof supplied !== 'string') return false;
  const expectedBuf = Buffer.from(expected, 'utf8');
  const suppliedBuf = Buffer.from(supplied, 'utf8');
  if (expectedBuf.length !== suppliedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
};

const shouldEnforceCsrf = (req: Request): boolean => {
  if (req.path === '/auth/login' || req.path === '/auth/logout') return true;
  return Boolean(req.session?.user) || Boolean(req.session?.csrfToken);
};

function ensureCsrfToken(req: Request): void {
  const isPageRequest =
    req.method === 'GET' && !req.path.startsWith('/api/') && path.extname(req.path) === '';
  if (!req.session.csrfToken && (isPageRequest || req.session.user)) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
}

function isSafeHttpMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function sendCsrfError(req: Request, res: Response): Response {
  return (req.headers.accept ?? '').includes('text/html')
    ? res.status(403).send('Invalid CSRF token')
    : res.status(403).json({ error: 'Invalid CSRF token' });
}

function installCsrfMiddleware(app: Express): void {
  // The token is generated once per session for the panel's single-user threat model.
  app.use((req, res, next) => {
    if (!req.session) return next();
    ensureCsrfToken(req);
    res.locals.csrfToken = req.session.csrfToken ?? '';
    res.locals.isAdmin = req.session.user?.is_admin === 1;
    next();
  });
  app.use((req, res, next) => {
    if (isSafeHttpMethod(req.method) || !shouldEnforceCsrf(req)) return next();
    const token = req.get('x-csrf-token') || req.body?._csrf;
    if (!csrfTokensEqual(req.session?.csrfToken, token)) return sendCsrfError(req, res);
    return next();
  });
}

export function configureSecurity(app: Express, nodeEnv: string, appDirectory: string): void {
  configureTrustProxy(app);
  const sessionSecret = resolveSessionSecret(nodeEnv);
  validateProductionSessionSecret(sessionSecret, nodeEnv);
  const cookieSettings = resolveCookieSettings(app, nodeEnv);
  const sessionCookieName = resolveSessionCookieName();
  const sessionCookieConfig = {
    httpOnly: true,
    sameSite: cookieSettings.sameSite,
    secure: cookieSettings.secure,
    maxAge: resolveSessionMaxAge(),
    path: '/',
  };
  app.set('sessionCookieName', sessionCookieName);
  app.set('sessionCookieConfig', sessionCookieConfig);
  app.use(createSecurityHeadersMiddleware(nodeEnv));

  const panelRoot =
    path.basename(appDirectory) === 'dist' ? path.dirname(appDirectory) : appDirectory;
  app.use(express.static(path.join(panelRoot, 'public'), { maxAge: 0, immutable: false }));
  app.use(
    session({
      name: sessionCookieName,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: createSessionStore(nodeEnv),
      cookie: sessionCookieConfig,
    })
  );
  installCsrfMiddleware(app);
}
