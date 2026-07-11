import express from 'express';
import rcon from '../../modules/rcon';
import isAuthenticated from '../../modules/middleware';
import { requireAuthorizedServerId } from '../../utils/serverAccess';
import logger from '../../utils/logger';
import { executeRecordedCommand, validatedRconCommand } from './matchRconService';
import {
  sanitizeString,
  MAX_RCON_COMMAND_LEN,
  MAX_SAY_MESSAGE_LEN,
  RCON_BLOCKED_COMMANDS,
  sendGameRouteError,
} from './helpers';

const router = express.Router();

// === RCON / SAY ===
//
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
    await rcon.executeCommand(server_id, `say "${text}"`);
    return res.status(200).json({ message: 'Say command sent.' });
  } catch (err) {
    sendGameRouteError(res, err, 'say-admin');
    return;
  }
});

export default router;
