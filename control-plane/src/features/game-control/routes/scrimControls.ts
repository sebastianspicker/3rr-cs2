/** Registers validated scrim-match RCON routes. */
import type { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ServerAccess } from '../../server-access/access';
import logger from '../../../infrastructure/logging';
import {
  parseConVarValue,
  parseIntBody,
  requireAllowlisted,
} from '../../../integrations/rcon/rconCommandPolicy';
import { sendGameRouteError } from './gameCommandExecution';
import type { createGameRouteFactories } from './gameRouteFactories';

const VALID_OT_ROUNDS = [3, 5, 6] as const;

export function registerScrimControls(
  router: Router,
  isAuthenticated: RequestHandler,
  { requireAuthorizedServerId }: ServerAccess,
  { makePresetRoute, runGameCmdSequence }: ReturnType<typeof createGameRouteFactories>
): void {
  router.post(
    '/api/set-maxrounds',
    isAuthenticated,
    makePresetRoute('set-maxrounds', 'mp_maxrounds', [16, 24, 30])
  );

  router.post('/api/set-overtime', isAuthenticated, async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const enable = parseConVarValue(req.body?.enable);
      if (enable === null) {
        return res.status(400).json({ error: 'enable must be 0 or 1' });
      }
      const otRounds = parseIntBody(req.body?.ot_rounds);
      if (
        !requireAllowlisted(
          res,
          otRounds,
          VALID_OT_ROUNDS,
          `ot_rounds must be one of: ${VALID_OT_ROUNDS.join(', ')}`
        )
      )
        return;
      logger.info(
        {
          user: req.session?.user?.username ?? 'unknown',
          action: 'set-overtime',
          enable,
          ot_rounds: otRounds,
        },
        '[game] action'
      );
      await runGameCmdSequence(server_id, [
        `mp_overtime_enable ${enable}`,
        `mp_overtime_maxrounds ${otRounds}`,
      ]);
      return res.status(200).json({
        message: `Overtime command sequence sent: ${enable ? 'enable' : 'disable'}, MR${otRounds}.`,
      });
    } catch (err) {
      sendGameRouteError(res, err, 'set-overtime');
      return;
    }
  });
}
