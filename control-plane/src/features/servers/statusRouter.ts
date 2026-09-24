import { currentExecutionOptions } from '../../shared/executionContext';
/** Authenticated status routes that expose bounded live RCON observations. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import { parseServerId } from '../server-access/parseServerId';
import logger from '../../infrastructure/logging';
import {
  parseHostnameResponse,
  parseStatusResponse,
  parseVisibleMaxPlayers,
  type RconManager,
  type RconObservation,
  type RconObservationOptions,
} from '../../integrations/rcon';
import type { ServerAccess } from '../server-access/access';
import { createServersRepository } from './repository';

interface StatusObservation {
  hostname: string | null;
  map: string | null;
  humanCount: number | null;
  botCount: number | null;
  maxPlayers: number | null;
  successful: number;
  errors: string[];
  observedAt: string | null;
}

export function createStatusRouter(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  _access: ServerAccess
): express.Router {
  const router = express.Router();
  const repository = createServersRepository(db);

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
    result: PromiseSettledResult<RconObservation>,
    serverId: string,
    data: StatusObservation
  ): void => {
    if (result.status === 'rejected') {
      unavailable(serverId, 'status', result.reason, data.errors);
      return;
    }
    const parsed = parseStatusResponse(result.value.value);
    data.map = parsed.map;
    data.humanCount = parsed.humans;
    data.botCount = parsed.bots;
    data.maxPlayers = parsed.maxPlayers;
    data.successful += 1;
    data.observedAt =
      data.observedAt && data.observedAt < result.value.observedAt
        ? data.observedAt
        : result.value.observedAt;
  };

  const applyHostnameResult = (
    result: PromiseSettledResult<RconObservation>,
    serverId: string,
    data: StatusObservation
  ): void => {
    if (result.status === 'rejected') {
      unavailable(serverId, 'hostname', result.reason, data.errors);
      return;
    }
    data.hostname = parseHostnameResponse(result.value.value, '');
    data.successful += 1;
    data.observedAt =
      data.observedAt && data.observedAt < result.value.observedAt
        ? data.observedAt
        : result.value.observedAt;
  };

  const applyMaxPlayersResult = (
    result: PromiseSettledResult<RconObservation>,
    serverId: string,
    data: StatusObservation
  ): void => {
    if (result.status === 'rejected') {
      unavailable(serverId, 'sv_visiblemaxplayers', result.reason, data.errors);
      return;
    }
    data.maxPlayers = parseVisibleMaxPlayers(result.value.value) ?? data.maxPlayers;
    data.successful += 1;
    data.observedAt =
      data.observedAt && data.observedAt < result.value.observedAt
        ? data.observedAt
        : result.value.observedAt;
  };

  async function collectStatusObservation(
    serverId: string,
    options: RconObservationOptions
  ): Promise<StatusObservation> {
    const data: StatusObservation = {
      hostname: null,
      map: null,
      humanCount: null,
      botCount: null,
      maxPlayers: null,
      successful: 0,
      errors: [],
      observedAt: null,
    };
    const [statusResult, hostnameResult, cvarResult] = await Promise.allSettled([
      rcon.observeCommand(serverId, 'status', options),
      rcon.observeCommand(serverId, 'hostname', options),
      rcon.observeCommand(serverId, 'sv_visiblemaxplayers', options),
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
    observed_at: data.observedAt,
    error: data.errors.length > 0 ? data.errors.join('; ') : null,
  });

  router.get('/api/status/:server_id', isAuthenticated, async (req, res) => {
    const serverId = parseServerId(req.params.server_id);
    if (!serverId) {
      return res.status(404).json({ error: 'Server not found' });
    }

    try {
      const row = repository.findAccessibleServerId(serverId, req.session.user?.id);
      if (!row) {
        return res.status(404).json({ error: 'Server not found' });
      }

      const data = await collectStatusObservation(serverId, {
        ...currentExecutionOptions(),
        refresh: req.query.refresh === '1',
      });

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

  return router;
}
