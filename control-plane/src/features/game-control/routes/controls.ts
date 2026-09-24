/** Composes authenticated game-control routes from cohesive feature groups. */
import express from 'express';
import type { RconManager } from '../../../integrations/rcon';
import type { RequestHandler } from 'express';
import type { ServerAccess } from '../../server-access/access';
import { createGameRouteFactories } from './gameRouteFactories';
import { registerModifierControls } from './modifierControls';
import { registerPluginControls } from './pluginControls';
import { registerPracticeControls } from './practiceControls';
import { registerScrimControls } from './scrimControls';

export function createControlsRouter(
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  access: ServerAccess
): express.Router {
  const router = express.Router();
  const factories = createGameRouteFactories(rcon, access);
  registerPracticeControls(router, isAuthenticated, access, factories);
  registerScrimControls(router, isAuthenticated, access, factories);
  registerModifierControls(router, isAuthenticated, factories);
  registerPluginControls(router, isAuthenticated, access, factories);
  return router;
}
