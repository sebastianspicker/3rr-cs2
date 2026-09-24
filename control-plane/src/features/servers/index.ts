/** Stable composition root for server views, lifecycle APIs, status, and catalog routes. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RconManager } from '../../integrations/rcon';
import type { RequestHandler } from 'express';
import type { RedisClient } from '../../infrastructure/redis';
import { createServerAccess } from '../server-access/access';
import { createServerAddRouter } from './addRouter';
import { createServerViewRoutes } from './routes/serverViewRoutes';
import { createServerStatusRoutes } from './routes/serverStatusRoutes';
import { createServerLifecycleRoutes } from './routes/serverLifecycleRoutes';
import { createServerCatalogRoutes } from './routes/serverCatalogRoutes';

export function createServersRouter(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  redisClient: RedisClient
): express.Router {
  const router = express.Router();
  const access = createServerAccess(db);
  router.use(createServerAddRouter(db, rcon, isAuthenticated, access, redisClient));
  router.use(createServerViewRoutes(db, rcon, isAuthenticated, access));
  router.use(createServerStatusRoutes(db, rcon, isAuthenticated, access));
  router.use(createServerLifecycleRoutes(db, rcon, isAuthenticated, access));
  router.use(createServerCatalogRoutes(isAuthenticated));
  return router;
}
