import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import { makeRateLimitStore } from '../utils/redis';
import { parseServerId } from '../utils/parseServerId';
import { renderManageResponse, requireServerId } from '../utils/serverAccess';
import { getMapsForMode, mapsConfig } from '../utils/mapsConfig';
import { parseHostnameResponse } from '../utils/rconResponse';
import { encryptRconSecret, RconSecretDecryptError } from '../utils/rconSecret';
import rcon from '../modules/rcon';
import isAuthenticated from '../modules/middleware';
import { isValidServerHost, isValidServerHostResolved } from '../utils/networkValidation';

const router = express.Router();

// Pre-prepared statements for performance (avoid re-preparing per request)
const selectManageStmt = better_sqlite_client.prepare(`
  SELECT s.id,
         s.serverIP,
         s.serverPort,
         s.last_game_type AS requested_game_type,
         s.last_game_mode AS requested_game_mode,
         s.last_map AS requested_map
    FROM servers s
    JOIN server_access sa ON sa.server_id = s.id
   WHERE s.id = ? AND sa.user_id = ?
`);
const insertServerStmt = better_sqlite_client.prepare(`
  INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?)
`);
const insertServerAccessStmt = better_sqlite_client.prepare(`
  INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)
`);
const updateServerPasswordStmt = better_sqlite_client.prepare(
  `UPDATE servers SET rconPassword = ? WHERE id = ?`
);
const selectServerByIpPortStmt = better_sqlite_client.prepare(
  `SELECT id, rconPassword FROM servers WHERE serverIP = ? AND serverPort = ?`
);
const selectAllServersStmt = better_sqlite_client.prepare(`
  SELECT s.id, s.serverIP, s.serverPort
    FROM servers s
    JOIN server_access sa ON sa.server_id = s.id
   WHERE sa.user_id = ?
`);
const selectServerByIdStmt = better_sqlite_client.prepare(`
  SELECT s.id, s.serverIP, s.serverPort, s.rconPassword
    FROM servers s
    JOIN server_access sa ON sa.server_id = s.id
   WHERE s.id = ? AND sa.user_id = ?
`);
const deleteServerAccessStmt = better_sqlite_client.prepare(
  `DELETE FROM server_access WHERE server_id = ? AND user_id = ?`
);
const deleteOrphanServerStmt = better_sqlite_client.prepare(
  `DELETE FROM servers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM server_access WHERE server_id = ?)`
);
const countServersByOwnerStmt = better_sqlite_client.prepare(
  `SELECT COUNT(*) AS count FROM server_access WHERE user_id = ?`
);

interface ServerRow {
  id: number;
  serverIP: string;
  serverPort: number;
  requested_game_type?: string;
  requested_game_mode?: string;
  requested_map?: string;
}

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

interface ServerFullRow extends ServerRow {
  rconPassword: string;
}

const AddServerBodySchema = z.object({
  server_ip: z.string().min(1),
  server_port: z
    .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
    .pipe(
      z
        .number()
        .int('server_port must be an integer between 1 and 65535')
        .min(1, 'server_port must be an integer between 1 and 65535')
        .max(65535, 'server_port must be an integer between 1 and 65535')
    ),
  rcon_password: z.string().min(1).max(512),
});

const addServerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Too many servers added; try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRateLimitStore(),
});

const RCON_CONNECT_FAILED_ERROR =
  'Server saved, but the panel could not establish an authenticated RCON connection';
const RCON_CREDENTIAL_STORAGE_ERROR =
  'Stored RCON credential could not be decrypted; check RCON_SECRET_KEY or saved credential';

type HostnameProbeResult =
  | { kind: 'value'; value: string | boolean }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout' };

function connectionObservation(
  connection: ReturnType<typeof rcon.getConnectionInfo>
): Pick<ServerListResult, 'connected' | 'authenticated' | 'status' | 'status_source'> {
  if (!connection) {
    return {
      connected: false,
      authenticated: false,
      status: 'unknown',
      status_source: 'not_observed',
    };
  }
  const { connected, authenticated } = connection;
  return {
    connected,
    authenticated,
    status: connected && authenticated ? 'unknown' : 'disconnected',
    status_source: 'rcon_connection',
  };
}

function initialServerListResult(server: ServerListRow): ServerListResult {
  const connection = rcon.getConnectionInfo(String(server.id));
  return {
    ...server,
    hostname: '-',
    ...connectionObservation(connection),
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
      timeout = setTimeout(() => {
        resolve({ kind: 'timeout' });
      }, 2000);
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
    return hostnameProbeError(result, probe.error);
  }
  return hostnameProbeValue(result, connection, probe.value);
}

function hostnameProbeError(result: ServerListResult, error: unknown): ServerListResult {
  const message = error instanceof Error ? error.message : String(error);
  logger.warn({ server_id: String(result.id), message }, '[server] RCON hostname error');
  return { ...result, status: 'error', error: 'hostname unavailable' };
}

function hostnameProbeValue(
  result: ServerListResult,
  connection: ReturnType<typeof rcon.getConnectionInfo>,
  value: string | boolean
): ServerListResult {
  const connected = connection?.connected ?? true;
  const authenticated = connection?.authenticated ?? true;
  return {
    ...result,
    hostname: parseHostnameResponse(typeof value === 'string' ? value : '', '-'),
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

async function managedHostname(
  serverId: string
): Promise<{ hostname: string; error: string | null }> {
  try {
    const response = await rcon.executeCommand(serverId, 'hostname');
    return { hostname: parseHostnameResponse(response, '–'), error: null };
  } catch (error) {
    logger.warn({ server_id: serverId, err: error }, '[server] manage hostname unavailable');
    return { hostname: '–', error: 'hostname unavailable' };
  }
}

function requestedSetup(server: ServerRow): {
  gameTypes: string[];
  mapGroups: Array<{ id: string; displayName: string }>;
  requestedGameType: string;
  requestedGameMode: string;
  requestedMap: string;
} {
  const gameTypes = Object.keys(mapsConfig.gameTypes);
  const mapGroups = Object.entries(mapsConfig.mapGroups).map(([id, group]) => ({
    id,
    displayName: group.displayName,
  }));
  const requestedGameType = requestedType(server, gameTypes);
  const config = Object.entries(mapsConfig.gameTypes).find(
    ([name]) => name === requestedGameType
  )?.[1];
  const modes = config ? Object.keys(config.gameModes) : [];
  const requestedGameMode = requestedMode(server, config, modes);
  const maps = requestedGameMode ? getMapsForMode(requestedGameType, requestedGameMode) : [];
  const requestedMap = requestedMapName(server, maps);
  return { gameTypes, mapGroups, requestedGameType, requestedGameMode, requestedMap };
}

function requestedType(server: ServerRow, gameTypes: string[]): string {
  const requested = server.requested_game_type;
  if (requested && Object.hasOwn(mapsConfig.gameTypes, requested)) return requested;
  return gameTypes[0] ?? '';
}

function requestedMode(
  server: ServerRow,
  config: (typeof mapsConfig.gameTypes)[string] | undefined,
  modes: string[]
): string {
  const requested = server.requested_game_mode;
  if (requested && config && Object.hasOwn(config.gameModes, requested)) return requested;
  return modes[0] ?? '';
}

const requestedMapName = (server: ServerRow, maps: string[]): string => {
  const requested = server.requested_map;
  if (typeof requested === 'string') {
    const allowed = maps.find((map) => map === requested);
    if (allowed !== undefined) return allowed;
  }
  return maps.at(0) ?? '';
};

async function manageView(serverId: string, ownerId: number | undefined): Promise<object | null> {
  const server = selectManageStmt.get(serverId, ownerId) as ServerRow | undefined;
  if (!server) return null;
  const managedServerId = String(server.id);
  const hostname = await managedHostname(managedServerId);
  const connection = rcon.getConnectionInfo(managedServerId);
  return {
    server_id: managedServerId,
    hostname: hostname.hostname,
    host: connection?.host ?? server.serverIP,
    port: connection?.port ?? server.serverPort,
    ...requestedSetup(server),
    connected: Boolean(connection?.connected),
    authenticated: Boolean(connection?.authenticated),
    hostname_error: hostname.error,
  };
}

type AddServerData = z.infer<typeof AddServerBodySchema>;

async function validatedServerInput(
  body: unknown,
  response: express.Response
): Promise<AddServerData | null> {
  const parsed = AddServerBodySchema.safeParse(body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return null;
  }
  if (!isValidServerHost(parsed.data.server_ip)) {
    response.status(400).json({ error: 'server_ip must be a valid IPv4/IPv6 address or hostname' });
    return null;
  }
  if (!(await isValidServerHostResolved(parsed.data.server_ip))) {
    response.status(400).json({
      error: 'server_ip must not resolve to a blocked local/control IP address',
    });
    return null;
  }
  return parsed.data;
}

function canAuthenticateServer(
  input: AddServerData,
  existingId: number | undefined
): Promise<boolean> {
  return rcon
    .probeServer({
      id: existingId ?? 0,
      serverIP: input.server_ip,
      serverPort: input.server_port,
      rconPassword: input.rcon_password,
    })
    .then(
      () => true,
      () => false
    );
}

function saveServerRecord(
  input: AddServerData,
  encryptedPassword: string,
  ownerId: number | undefined,
  existingId: number | undefined
): number | null {
  if (existingId !== undefined) {
    updateServerPasswordStmt.run(encryptedPassword, existingId);
    return existingId;
  }
  insertServerStmt.run(input.server_ip, input.server_port, encryptedPassword, ownerId);
  const inserted = selectServerByIpPortStmt.get(input.server_ip, input.server_port) as
    | { id: number }
    | undefined;
  return inserted?.id ?? null;
}

async function connectSavedServer(
  input: AddServerData,
  encryptedPassword: string,
  ownerId: number | undefined,
  serverId: number
): Promise<boolean> {
  insertServerAccessStmt.run(ownerId, serverId);
  return rcon.connectServer({
    id: serverId,
    serverIP: input.server_ip,
    serverPort: input.server_port,
    rconPassword: encryptedPassword,
  });
}

// Render "Add Server" form
router.get('/add-server', isAuthenticated, (_req, res) => {
  res.render('add-server');
});

// Render "My Servers" overview page
router.get('/servers', isAuthenticated, (_req, res) => {
  res.render('servers');
});

// Render the "Manage Server" page
router.get('/manage/:server_id', isAuthenticated, async (req, res) => {
  try {
    const server_id = parseServerId(req.params.server_id);
    if (!server_id) return res.status(404).send('Server not found');
    const view = await manageView(String(Number.parseInt(server_id, 10)), req.session.user?.id);
    if (!view) return res.status(404).send('Server not found');
    res.locals = { ...res.locals, ...view };
    renderManageResponse(res);
  } catch (err) {
    logger.error({ err }, '[server] manage error');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API: Add a new CS2 server to the database
router.post('/api/add-server', isAuthenticated, addServerLimiter, async (req, res) => {
  const input = await validatedServerInput(req.body, res);
  if (!input) return;
  try {
    const ownerId = req.session.user?.id;
    const { count: serverCount } = countServersByOwnerStmt.get(ownerId) as { count: number };
    if (serverCount >= 50) return res.status(400).json({ error: 'Maximum server limit reached' });
    const existing = selectServerByIpPortStmt.get(input.server_ip, input.server_port) as
      | { id: number; rconPassword: string }
      | undefined;
    if (!(await canAuthenticateServer(input, existing?.id))) {
      return res.status(400).json({
        error: 'Unable to authenticate to the server with the provided RCON credentials',
      });
    }
    const encryptedPassword = encryptRconSecret(input.rcon_password);
    const serverId = saveServerRecord(input, encryptedPassword, ownerId, existing?.id);
    if (serverId === null) return res.status(500).json({ error: 'Failed to add the server' });
    const connected = await connectSavedServer(input, encryptedPassword, ownerId, serverId);
    if (!connected) return res.status(502).json({ error: RCON_CONNECT_FAILED_ERROR });
    return res.status(201).json({ message: 'Server added successfully' });
  } catch (err) {
    logger.error({ err }, '[server] add-server error');
    if (err instanceof RconSecretDecryptError) {
      return res.status(500).json({
        error: RCON_CREDENTIAL_STORAGE_ERROR,
        credential_error: err.kind,
      });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: List all servers with connection & hostname status
router.get('/api/servers', isAuthenticated, async (req, res) => {
  try {
    const ownerId = req.session.user?.id;
    const servers = selectAllServersStmt.all(ownerId) as ServerListRow[];
    const results = await Promise.all(servers.map(serverListResult));

    res.json({ servers: results });
  } catch (err) {
    logger.error({ err }, '[server] list-servers error');
    res.status(500).json({ error: 'An error occurred while fetching servers.' });
  }
});

// API: Reconnect to a server's RCON session
router.post('/api/reconnect-server', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const ownerId = req.session.user?.id;
    const server = selectServerByIdStmt.get(server_id, ownerId) as ServerFullRow | undefined;

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Re-validate the stored IP/hostname at reconnect time to guard against
    // DNS rebinding: the host may have passed validation at add-server time
    // but could now resolve to a blocked local/control address.
    if (!(await isValidServerHostResolved(server.serverIP))) {
      logger.warn(
        { server_id, serverIP: server.serverIP },
        '[server] reconnect blocked: IP resolves to a blocked local/control range'
      );
      return res.status(400).json({ error: 'Server address resolves to a disallowed IP range' });
    }

    const connected = await rcon.connectServer(server);
    if (!connected) {
      return res.status(502).json({
        error: 'Unable to establish an authenticated RCON connection for this server',
      });
    }
    res.status(200).json({ message: 'Reconnected successfully' });
  } catch (err) {
    logger.error({ err }, '[server] reconnect-server error');
    if (err instanceof RconSecretDecryptError) {
      return res.status(500).json({
        error: RCON_CREDENTIAL_STORAGE_ERROR,
        credential_error: err.kind,
      });
    }
    res.status(500).json({ error: 'An error occurred while reconnecting to the server.' });
  }
});

// API: Delete a server from the database
router.post('/api/delete-server', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const ownerId = req.session.user?.id;

    // Remove this user's access. If no other user has access, delete the server row too.
    const accessResult = deleteServerAccessStmt.run(server_id, ownerId);
    if (accessResult.changes === 0) {
      return res.status(404).json({ error: 'Server not found' });
    }
    const orphanResult = deleteOrphanServerStmt.run(server_id, server_id);
    if (orphanResult.changes > 0) {
      try {
        await rcon.removeServer(server_id);
      } catch (err) {
        logger.error({ err, server_id }, '[server] delete-server RCON cleanup failed');
        return res.status(500).json({
          error: 'Server deleted, but RCON cleanup failed',
          server_deleted: true,
          rcon_cleanup: 'failed',
        });
      }
    }
    const serverDeleted = orphanResult.changes > 0;
    return res.status(200).json({
      message: serverDeleted ? 'Server deleted successfully' : 'Server access removed successfully',
      server_deleted: serverDeleted,
      rcon_cleanup: serverDeleted ? 'completed' : 'not_needed',
    });
  } catch (err) {
    logger.error({ err }, '[server] delete-server error');
    res.status(500).json({ error: 'An error occurred while deleting the server.' });
  }
});

// API: return list of game-modes for a given game-type
router.get('/api/game-types/:type/game-modes', isAuthenticated, (req, res) => {
  const type = String(req.params.type); // guaranteed by Express route pattern `:type`
  const typeCfg = Object.entries(mapsConfig.gameTypes).find(([name]) => name === type)?.[1];
  if (!typeCfg) {
    return res.status(404).json({ error: 'Unknown game type' });
  }
  const modes = Object.keys(typeCfg.gameModes);
  res.json({ gameModes: modes });
});

// API: return flattened map list for a given type/mode
router.get('/api/game-types/:type/game-modes/:mode/maps', isAuthenticated, (req, res) => {
  const type = String(req.params.type); // guaranteed by Express route pattern `:type`
  const mode = String(req.params.mode); // guaranteed by Express route pattern `:mode`
  const typeCfg = Object.entries(mapsConfig.gameTypes).find(([name]) => name === type)?.[1];
  if (!typeCfg) {
    return res.status(404).json({ error: 'Unknown game type' });
  }
  const modeCfg = Object.entries(typeCfg.gameModes).find(([name]) => name === mode)?.[1];
  if (!modeCfg) {
    return res.status(404).json({ error: 'Unknown game mode' });
  }
  const maps = getMapsForMode(type, mode);
  res.json({ maps });
});

export default router;
