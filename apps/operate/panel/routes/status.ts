import express from 'express';
import { better_sqlite_client } from '../db';
import rcon from '../modules/rcon';
import isAuthenticated from '../modules/middleware';
import { parseServerId } from '../utils/parseServerId';
import logger from '../utils/logger';

const router = express.Router();

interface StatusRow {
  last_map: string | null;
  last_game_type: string | null;
  last_game_mode: string | null;
}

const selectStatusStmt = better_sqlite_client.prepare(`
  SELECT s.last_map, s.last_game_type, s.last_game_mode
    FROM servers s
    JOIN server_access sa ON sa.server_id = s.id
   WHERE s.id = ? AND sa.user_id = ?
`);

router.get('/api/status/:server_id', isAuthenticated, async (req, res) => {
  const serverId = parseServerId(req.params.server_id);
  if (!serverId) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    const row = selectStatusStmt.get(serverId, req.session.user?.id) as StatusRow | undefined;
    if (!row) {
      return res.status(404).json({ error: 'Server not found' });
    }

    let humanCount: number | null = null;
    let botCount: number | null = null;
    let maxPlayers: number | null = null;
    try {
      const [statusResult, cvarResult] = await Promise.allSettled([
        rcon.executeCommand(serverId, 'status'),
        rcon.executeCommand(serverId, 'sv_visiblemaxplayers'),
      ]);

      if (statusResult.status === 'fulfilled') {
        const text = typeof statusResult.value === 'string' ? statusResult.value : '';
        const m = text.match(/players\s*:\s*(\d+)\s*humans,\s*(\d+)\s*bots/i);
        if (m) {
          humanCount = parseInt(m[1]!, 10);
          botCount = parseInt(m[2]!, 10);
        }
      } else {
        logger.error({ server_id: serverId, err: statusResult.reason }, '[status] RCON status error');
      }

      // sv_visiblemaxplayers is best-effort — status reports (0 max) when no game is running
      if (cvarResult.status === 'fulfilled') {
        const cm = cvarResult.value.match(/sv_visiblemaxplayers\s*=\s*(-?\d+)/i);
        if (cm && cm[1] !== undefined) {
          const val = parseInt(cm[1], 10);
          if (val > 0) maxPlayers = val;
        }
      }
    } catch (err) {
      logger.error({ server_id: serverId, err }, '[status] RCON error');
    }

    return res.json({
      map: row.last_map || null,
      last_game_type: row.last_game_type || null,
      last_game_mode: row.last_game_mode || null,
      humans: humanCount,
      bots: botCount,
      max_players: maxPlayers,
    });
  } catch (err) {
    logger.error({ err }, '[status] Error fetching status');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
