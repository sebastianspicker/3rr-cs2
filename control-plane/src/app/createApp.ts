/** Constructs the Express application while preserving middleware and route order. */
import path from 'node:path';
import { executionLifetime } from './executionLifetime';
import express, { type NextFunction, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import logger from '../infrastructure/logging';
import { createGameControlRouter } from '../features/game-control/routes/index';
import { createServersRouter } from '../features/servers/index';
import { createAuthRouter } from '../features/auth/router';
import { createStatusRouter } from '../features/servers/statusRouter';
import { createUsersRouter } from '../features/users/index';
import { createConsoleRouter } from '../features/console/router';
import { createWorkshopRouter } from '../features/workshop/router';
import { createServerAccess } from '../features/server-access/access';
import { createAuthentication } from './authentication';
import type { RconManager } from '../integrations/rcon';
import type { RedisClient } from '../infrastructure/redis';
import { configureSecurity } from './security';
import { configureRateLimits } from './rateLimits';
import { registerHealthRoute } from './health';

function bodyParserClientError(error: unknown): { type: string; status: number } | null {
  if (typeof error !== 'object' || error === null) return null;
  const { type, status } = error as { type?: unknown; status?: unknown };
  if (
    typeof type !== 'string' ||
    !/^(entity|request|encoding|charset|parameters|stream|querystring)\./.test(type)
  )
    return null;
  return {
    type,
    status: typeof status === 'number' && status >= 400 && status < 500 ? status : 400,
  };
}

export function createPanelApp(
  nodeEnv: string,
  packageRoot: string,
  dependencies: { db: Database.Database; rcon: RconManager; redisClient: RedisClient }
): express.Express {
  const app = express();
  app.disable('x-powered-by');
  const bodyLimit = '512kb';
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit, parameterLimit: 100 }));
  app.set('query parser', 'simple');
  configureSecurity(app, nodeEnv, packageRoot, dependencies.redisClient);
  configureRateLimits(app, nodeEnv, dependencies.redisClient);
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.set('view engine', 'ejs');
  app.set('views', path.join(packageRoot, 'web', 'views'));
  const { isAuthenticated, requireAdmin } = createAuthentication(dependencies.db);
  app.use(executionLifetime(dependencies.rcon));
  app.use('/', createAuthRouter(dependencies.db));
  app.use(
    '/',
    createServersRouter(
      dependencies.db,
      dependencies.rcon,
      isAuthenticated,
      dependencies.redisClient
    )
  );
  app.use('/', createGameControlRouter(dependencies.db, dependencies.rcon, isAuthenticated));
  app.use(
    '/',
    createStatusRouter(
      dependencies.db,
      dependencies.rcon,
      isAuthenticated,
      createServerAccess(dependencies.db)
    )
  );
  app.use(
    '/',
    createConsoleRouter(
      dependencies.db,
      dependencies.rcon,
      isAuthenticated,
      createServerAccess(dependencies.db)
    )
  );
  app.use(
    '/',
    createWorkshopRouter(dependencies.db, isAuthenticated, createServerAccess(dependencies.db))
  );
  app.use(
    '/',
    createUsersRouter(dependencies.db, dependencies.rcon, isAuthenticated, requireAdmin)
  );
  registerHealthRoute(app, dependencies.db, dependencies.rcon, dependencies.redisClient);
  app.get('/', (req, res) => {
    if (req.session.user) return void res.redirect('/servers');
    res.render('login', { sessionExpired: req.query.expired === '1' });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next;
    const clientError = bodyParserClientError(error);
    if (clientError) {
      // Parser errors carry the raw body, which may hold a password: log the type only.
      logger.warn({ type: clientError.type, status: clientError.status }, '[app] rejected body');
      if (!res.headersSent) res.status(clientError.status).json({ error: 'Invalid request body' });
      return;
    }
    logger.error({ err: error }, '[app] unhandled route error');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
