/** Composes match setup, backup, advanced, and explicit-RCON route groups. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RconManager } from '../../../integrations/rcon';
import type { RequestHandler } from 'express';
import type { ServerAccess } from '../../server-access/access';
import { createRconHistoryRepository } from '../../../infrastructure/sqlite';
import { createMatchRepository } from './repository';
import { createMatchSetupRoutes } from './matchSetupRoutes';
import { createMatchBackupRoutes } from './matchBackupRoutes';
import { createMatchAdvancedRoutes } from './matchAdvancedRoutes';
import { createMatchRconRoutes } from './matchRconRoutes';

export function createMatchRouter(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  access: ServerAccess
): express.Router {
  const router = express.Router();
  router.use(createMatchSetupRoutes(rcon, isAuthenticated, access, createMatchRepository(db)));
  router.use(createMatchBackupRoutes(rcon, isAuthenticated, access));
  router.use(createMatchAdvancedRoutes(rcon, isAuthenticated, access));
  router.use(createMatchRconRoutes(rcon, isAuthenticated, access, createRconHistoryRepository(db)));
  return router;
}
