/** Composes administrator and self-service user lifecycle routes. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RconManager } from '../../integrations/rcon';
import type { RequestHandler } from 'express';
import { createServerAccess } from '../server-access/access';
import { createUserPersistence } from './routes/persistence';
import { registerUserManagementRoutes } from './routes/managementRoutes';
import { registerPasswordRoutes } from './routes/passwordRoutes';
import { registerUserPageRoutes } from './routes/pageRoutes';

export function createUsersRouter(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  requireAdmin: RequestHandler
): express.Router {
  const router = express.Router();
  const persistence = createUserPersistence(db, rcon, createServerAccess(db));
  registerUserPageRoutes(router, isAuthenticated, requireAdmin, persistence);
  registerPasswordRoutes(router, isAuthenticated, persistence);
  registerUserManagementRoutes(router, isAuthenticated, requireAdmin, persistence);
  return router;
}
