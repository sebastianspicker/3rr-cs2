import express from 'express';
import { better_sqlite_client } from '../db';
import rcon from '../modules/rcon';
import isAuthenticated from '../modules/middleware';
import { parseServerId } from '../utils/parseServerId';
import logger from '../utils/logger';
import { parseStatusResponse, parseVisibleMaxPlayers } from '../utils/rconParsers';
import { parseHostnameResponse } from '../utils/rconResponse';

const router = express.Router();

const selectStatusStmt = better_sqlite_client.prepare(`
  SELECT s.id
    FROM servers s
    JOIN server_access sa ON sa.server_id = s.id
   WHERE s.id = ? AND sa.user_id = ?
`);

interface StatusObservation {
  hostname: string | null;
  map: string | null;
  humanCount: number | null;
  botCount: number | null;
  maxPlayers: number | null;
  successful: number;
  errors: string[];
}

const unavailable = (
  serverId: string,
  command: string,
  reason: unknown,
  errors: string[]
): void => {
  logger.warn({ server_id: serverId, err: reason }, `[status] RCON ${command} error`);
  errors.push(`${command} unavailable`);
};

const applyStatusResult = (
  result: PromiseSettledResult<string>,
  serverId: string,
  data: StatusObservation
): void => {
  if (result.status === 'rejected') {
    unavailable(serverId, 'status', result.reason, data.errors);
    return;
  }
  const parsed = parseStatusResponse(result.value);
  data.map = parsed.map;
  data.humanCount = parsed.humans;
  data.botCount = parsed.bots;
  data.maxPlayers = parsed.maxPlayers;
  data.successful += 1;
};

const applyHostnameResult = (
  result: PromiseSettledResult<string>,
  serverId: string,
  data: StatusObservation
): void => {
  if (result.status === 'rejected') {
    unavailable(serverId, 'hostname', result.reason, data.errors);
    return;
  }
  data.hostname = parseHostnameResponse(result.value, '');
  data.successful += 1;
};

const applyMaxPlayersResult = (
  result: PromiseSettledResult<string>,
  serverId: string,
  data: StatusObservation
): void => {
  if (result.status === 'rejected') {
    unavailable(serverId, 'sv_visiblemaxplayers', result.reason, data.errors);
    return;
  }
  data.maxPlayers = parseVisibleMaxPlayers(result.value) ?? data.maxPlayers;
  data.successful += 1;
};

async function collectStatusObservation(serverId: string): Promise<StatusObservation> {
  const data: StatusObservation = {
    hostname: null,
    map: null,
    humanCount: null,
    botCount: null,
    maxPlayers: null,
    successful: 0,
    errors: [],
  };
  const [statusResult, hostnameResult, cvarResult] = await Promise.allSettled([
    rcon.executeCommand(serverId, 'status'),
    rcon.executeCommand(serverId, 'hostname'),
    rcon.executeCommand(serverId, 'sv_visiblemaxplayers'),
  ]);
  applyStatusResult(statusResult, serverId, data);
  applyHostnameResult(hostnameResult, serverId, data);
  applyMaxPlayersResult(cvarResult, serverId, data);
  return data;
}

const connectionStatus = (
  connection: ReturnType<typeof rcon.getConnectionInfo>
): { connected: boolean; authenticated: boolean } => ({
  connected: Boolean(connection?.connected),
  authenticated: Boolean(connection?.authenticated),
});

const observationStatus = (data: StatusObservation) => ({
  partial: data.successful > 0 && data.errors.length > 0,
  complete: data.successful === 3,
  observed_at: data.successful > 0 ? new Date().toISOString() : null,
  error: data.errors.length > 0 ? data.errors.join('; ') : null,
});

router.get('/api/status/:server_id', isAuthenticated, async (req, res) => {
  const serverId = parseServerId(req.params.server_id);
  if (!serverId) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    const row = selectStatusStmt.get(serverId, req.session.user?.id) as { id: number } | undefined;
    if (!row) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const data = await collectStatusObservation(serverId);

    return res.json({
      hostname: data.hostname,
      map: data.map,
      humans: data.humanCount,
      bots: data.botCount,
      max_players: data.maxPlayers,
      ...connectionStatus(rcon.getConnectionInfo(serverId)),
      ...observationStatus(data),
    });
  } catch (err) {
    logger.error({ err }, '[status] Error fetching status');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
