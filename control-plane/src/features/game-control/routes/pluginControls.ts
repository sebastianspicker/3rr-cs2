/** Registers controls backed by optional server CFGs and plugins. */
import type { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ServerAccess } from '../../server-access/access';
import logger from '../../../infrastructure/logging';
import type { createGameRouteFactories } from './gameRouteFactories';
import { parseConVarValue } from '../../../integrations/rcon/rconCommandPolicy';
import { sendGameRouteError } from './gameCommandExecution';

function registerCfgToggle(
  router: Router,
  path: string,
  action: string,
  enabledCfg: string,
  disabledCfg: string,
  message: (value: number) => string,
  requireAuthorizedServerId: ServerAccess['requireAuthorizedServerId'],
  execCfg: (serverId: string, cfg: string) => Promise<void>,
  isAuthenticated: RequestHandler
): void {
  router.post(path, isAuthenticated, async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const value = parseConVarValue(req.body?.value);
      if (value === null) {
        return res.status(400).json({ error: 'value must be 0 or 1' });
      }
      logger.info(
        { user: req.session?.user?.username ?? 'unknown', action, value },
        '[game] action'
      );
      await execCfg(server_id, value === 1 ? enabledCfg : disabledCfg);
      return res.status(200).json({ message: message(value) });
    } catch (err) {
      sendGameRouteError(res, err, action);
      return;
    }
  });
}

export function registerPluginControls(
  router: Router,
  isAuthenticated: RequestHandler,
  { requireAuthorizedServerId }: ServerAccess,
  { makeSimpleCmdRoute, execCfg }: ReturnType<typeof createGameRouteFactories>
): void {
  registerCfgToggle(
    router,
    '/api/random-rounds-toggle',
    'random-rounds-toggle',
    'random_rounds_on.cfg',
    'random_rounds_off.cfg',
    (value) => `Random Rounds config command sent with value ${value}.`,
    requireAuthorizedServerId,
    execCfg,
    isAuthenticated
  );
  registerCfgToggle(
    router,
    '/api/rtd-toggle',
    'rtd-toggle',
    'rtd_on.cfg',
    'rtd_off.cfg',
    (value) => `RTD config command sent with value ${value}.`,
    requireAuthorizedServerId,
    execCfg,
    isAuthenticated
  );
  router.post(
    '/api/rtd-force-roll',
    isAuthenticated,
    makeSimpleCmdRoute('rtd-force-roll', 'css_rtd_forceroll', 'RTD force-roll command sent.')
  );
}
