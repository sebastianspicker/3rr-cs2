import express from 'express';
import { parseGameBody } from './matchRouteValidation';
import rcon from '../../modules/rcon';
import isAuthenticated from '../../modules/middleware';
import { requireAuthorizedServerId } from '../../utils/serverAccess';
import logger from '../../utils/logger';
import {
  RestoreRoundBodySchema,
  isExplicitNoBackupList,
  parseLatestBackupState,
} from './matchContracts';
import { runGameCmd, sendGameRouteError } from './helpers';
import { restoreLatestBackup } from './matchBackupService';

const router = express.Router();

// === ROUND BACKUPS ===
//
router.post('/api/list-backups', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'list-backups' },
      '[game] action'
    );
    const text = await rcon.executeCommand(server_id, 'mp_backup_restore_list_files');
    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(502).json({
        error: 'Backup list response was empty; backup state unknown',
        backup_state: 'unknown',
      });
    }
    if (isExplicitNoBackupList(text)) {
      return res.status(200).json({
        message: 'No backups reported by server.',
        backup_state: 'none',
        raw_output: text,
      });
    }
    return res.status(200).json({
      message: text,
      backup_state: 'listed',
      raw_output: text,
    });
  } catch (err) {
    sendGameRouteError(res, err, 'list-backups');
    return;
  }
});

router.post('/api/restore-round', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(RestoreRoundBodySchema, req.body, res);
    if (!parsedBody) return;
    const n = parsedBody.round_number;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'restore-round', round: n },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_restore ${n}`);
    return res.status(200).json({ message: 'Round restore command sent.' });
  } catch (err) {
    sendGameRouteError(res, err, 'restore-round');
    return;
  }
});

router.post('/api/restore-latest-backup', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'restore-latest-backup' },
      '[game] action'
    );
    const text = await rcon.executeCommand(server_id, 'mp_backup_round_file_last');
    const latestBackup = parseLatestBackupState(text);
    const result = await restoreLatestBackup(server_id, latestBackup);
    return res.status(result.status).json(result.body);
  } catch (err) {
    sendGameRouteError(res, err, 'restore-latest-backup');
    return;
  }
});

//

export default router;
