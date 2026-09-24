import { currentExecutionOptions } from '../../../shared/executionContext';
import express from 'express';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import logger from '../../../infrastructure/logging';
import {
  parseHostnameResponse,
  type RconManager,
  type RconObservationOptions,
} from '../../../integrations/rcon';
import type { ServerAccess } from '../../server-access/access';
import { createServersRepository, type ServerRow } from '../repository';

type ServerListStatus = 'connected' | 'disconnected' | 'unknown' | 'error';
type ServerListStatusSource = 'not_observed' | 'rcon_connection' | 'rcon_hostname';

interface ServerListResult extends ServerRow {
  hostname: string;
  connected: boolean;
  authenticated: boolean;
  status: ServerListStatus;
  observed_at: string | null;
  status_source: ServerListStatusSource;
  timed_out: boolean;
  error: string | null;
}

type HostnameProbeResult =
  | { kind: 'value'; value: string; observedAt: string }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout' };

export function createServerStatusRoutes(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  _access: ServerAccess
): express.Router {
  const router = express.Router();
  const repository = createServersRepository(db);

  function connectionObservation(connection: ReturnType<typeof rcon.getConnectionInfo>) {
    if (!connection) {
      return {
        connected: false,
        authenticated: false,
        status: 'unknown' as const,
        status_source: 'not_observed' as const,
      };
    }
    const { connected, authenticated } = connection;
    return {
      connected,
      authenticated,
      status: connected && authenticated ? ('unknown' as const) : ('disconnected' as const),
      status_source: 'rcon_connection' as const,
    };
  }

  function initialServerListResult(server: ServerRow): ServerListResult {
    return {
      ...server,
      hostname: '-',
      ...connectionObservation(rcon.getConnectionInfo(String(server.id))),
      observed_at: null,
      timed_out: false,
      error: null,
    };
  }

  async function probeHostname(
    serverId: string,
    options: RconObservationOptions
  ): Promise<HostnameProbeResult> {
    try {
      const observation = await rcon.observeCommand(serverId, 'hostname', options);
      return { kind: 'value', ...observation };
    } catch (error) {
      return error instanceof Error && error.name === 'RconDeadlineError'
        ? { kind: 'timeout' }
        : { kind: 'error', error };
    }
  }

  function applyHostnameProbe(
    result: ServerListResult,
    connection: ReturnType<typeof rcon.getConnectionInfo>,
    probe: HostnameProbeResult
  ): ServerListResult {
    result.status_source = 'rcon_hostname';
    if (probe.kind === 'timeout') {
      return { ...result, status: 'unknown', timed_out: true, error: 'hostname probe timed out' };
    }
    if (probe.kind === 'error') {
      const message = probe.error instanceof Error ? probe.error.message : String(probe.error);
      logger.warn({ server_id: String(result.id), message }, '[server] RCON hostname error');
      return { ...result, status: 'error', error: 'hostname unavailable' };
    }
    const connected = connection?.connected ?? true;
    const authenticated = connection?.authenticated ?? true;
    return {
      ...result,
      hostname: parseHostnameResponse(typeof probe.value === 'string' ? probe.value : '', '-'),
      connected,
      authenticated,
      status: connected && authenticated ? 'connected' : 'disconnected',
      observed_at: probe.observedAt,
    };
  }

  async function serverListResult(
    server: ServerRow,
    options: RconObservationOptions
  ): Promise<ServerListResult> {
    const serverId = String(server.id);
    const result = initialServerListResult(server);
    const probe = await probeHostname(serverId, options);
    return applyHostnameProbe(result, rcon.getConnectionInfo(serverId), probe);
  }

  router.get('/api/servers', isAuthenticated, async (req, res) => {
    try {
      const servers = repository.listAccessibleServers(req.session.user?.id);
      const options = { ...currentExecutionOptions(), refresh: req.query.refresh === '1' };
      res.json({
        servers:
          req.query.observe === '0'
            ? servers.map(initialServerListResult)
            : await Promise.all(servers.map((server) => serverListResult(server, options))),
      });
    } catch (err) {
      logger.error({ err }, '[server] list-servers error');
      res.status(500).json({ error: 'An error occurred while fetching servers.' });
    }
  });

  return router;
}
