/** Mount point for authenticated game-control route families. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RconManager } from '../../../integrations/rcon';
import type { RequestHandler } from 'express';
import { createServerAccess } from '../../server-access/access';
import { createMatchRouter } from './match';
import { createControlsRouter } from './controls';

export function createGameControlRouter(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler
): express.Router {
  const router = express.Router();
  const access = createServerAccess(db);
  router.use('/', createMatchRouter(db, rcon, isAuthenticated, access));
  router.use('/', createControlsRouter(rcon, isAuthenticated, access));
  return router;
}
