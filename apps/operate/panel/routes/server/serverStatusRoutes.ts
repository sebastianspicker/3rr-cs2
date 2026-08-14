import express from 'express';
import { better_sqlite_client } from '../../db';
import isAuthenticated from '../../modules/middleware';
import rcon from '../../modules/rcon';
import logger from '../../utils/logger';
import { parseHostnameResponse } from '../../utils/rconResponse';
import { selectAccessibleServersSql } from '../../utils/serverAccess';

const router = express.Router();
const selectAllServersStmt = better_sqlite_client.prepare(
  selectAccessibleServersSql('s.id, s.serverIP, s.serverPort')
);

interface ServerListRow {
  id: number;
  serverIP: string;
  serverPort: number;
}

type ServerListStatus = 'connected' | 'disconnected' | 'unknown' | 'error';
type ServerListStatusSource = 'not_observed' | 'rcon_connection' | 'rcon_hostname';

interface ServerListResult extends ServerListRow {
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
  | { kind: 'value'; value: string | boolean }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout' };

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

function initialServerListResult(server: ServerListRow): ServerListResult {
  return {
    ...server,
    hostname: '-',
    ...connectionObservation(rcon.getConnectionInfo(String(server.id))),
    observed_at: null,
    timed_out: false,
    error: null,
  };
}

async function probeHostname(serverId: string): Promise<HostnameProbeResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    rcon.executeCommand(serverId, 'hostname').then(
      (value) => ({ kind: 'value' as const, value }),
      (error: unknown) => ({ kind: 'error' as const, error })
    ),
    new Promise<{ kind: 'timeout' }>((resolve) => {
      timeout = setTimeout(() => resolve({ kind: 'timeout' }), 2000);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  return result;
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
    observed_at: new Date().toISOString(),
  };
}

async function serverListResult(server: ServerListRow): Promise<ServerListResult> {
  const serverId = String(server.id);
  const result = initialServerListResult(server);
  if (!rcon.hasConnection(serverId)) return result;
  return applyHostnameProbe(
    result,
    rcon.getConnectionInfo(serverId),
    await probeHostname(serverId)
  );
}

router.get('/api/servers', isAuthenticated, async (req, res) => {
  try {
    const servers = selectAllServersStmt.all(req.session.user?.id) as ServerListRow[];
    res.json({ servers: await Promise.all(servers.map(serverListResult)) });
  } catch (err) {
    logger.error({ err }, '[server] list-servers error');
    res.status(500).json({ error: 'An error occurred while fetching servers.' });
  }
});

export default router;
