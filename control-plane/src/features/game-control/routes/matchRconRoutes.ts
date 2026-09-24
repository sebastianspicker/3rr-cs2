import { currentExecutionOptions } from '../../../shared/executionContext';
/** Explicit RCON endpoints that retain audit history only for sent commands. */
import express from 'express';
import type { RequestHandler } from 'express';
import type { ServerAccess } from '../../server-access/access';
import logger from '../../../infrastructure/logging';
import type { createRconHistoryRepository } from '../../../infrastructure/sqlite';
import { createRecordedCommandExecutor, validatedRconCommand } from './matchRconService';
import {
  sanitizeString,
  MAX_RCON_COMMAND_LEN,
  MAX_SAY_MESSAGE_LEN,
  RCON_BLOCKED_COMMANDS,
  type RconManager,
} from '../../../integrations/rcon';
import { sendGameRouteError } from './gameCommandExecution';

export function createMatchRconRoutes(
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  { requireAuthorizedServerId }: ServerAccess,
  history: ReturnType<typeof createRconHistoryRepository>
): express.Router {
  const router = express.Router();
  const { executeRecordedCommand } = createRecordedCommandExecutor(rcon, history);

  router.post('/api/rcon', isAuthenticated, async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const userId = req.session.user?.id;
      if (userId === undefined) return res.status(401).json({ error: 'Authentication required' });
      const command = validatedRconCommand(req.body?.command);
      if (!command) {
        return res.status(400).json({
          error: `Command not allowed (single command only, max ${MAX_RCON_COMMAND_LEN} chars, blocked: ${RCON_BLOCKED_COMMANDS.join(', ')})`,
        });
      }
      const [cmdVerb = ''] = command.split(/\s+/);
      logger.info(
        { user: req.session?.user?.username ?? 'unknown', cmd: cmdVerb },
        '[rcon] user command'
      );
      return res.status(200).json(await executeRecordedCommand(server_id, userId, command));
    } catch (err) {
      sendGameRouteError(res, err, 'rcon');
      return;
    }
  });

  router.post('/api/say-admin', isAuthenticated, async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const text = sanitizeString(req.body?.message, MAX_SAY_MESSAGE_LEN);
      if (!text) {
        return res.status(400).json({
          error: 'message is required and must be non-empty after sanitization',
        });
      }
      logger.info(
        { user: req.session?.user?.username ?? 'unknown', text },
        '[rcon] say-admin command'
      );
      await rcon.executeCommand(server_id, `say "${text}"`, currentExecutionOptions());
      return res.status(200).json({ message: 'Say command sent.' });
    } catch (err) {
      sendGameRouteError(res, err, 'say-admin');
      return;
    }
  });

  return router;
}
