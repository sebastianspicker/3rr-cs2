import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import { makeRateLimitStore } from '../utils/redis';
import { parseServerId, requireServerId } from '../utils/parseServerId';
import { getMapsForMode, mapsConfig } from '../utils/mapsConfig';
import { parseHostnameResponse } from '../utils/rconResponse';
import { encryptRconSecret } from '../utils/rconSecret';
import rcon from '../modules/rcon';
import isAuthenticated from '../modules/middleware';
import { isValidServerHost, isValidServerHostResolved } from '../utils/networkValidation';

const router = express.Router();

// Pre-prepared statements for performance (avoid re-preparing per request)
const selectManageStmt = better_sqlite_client.prepare(`
  SELECT s.id, s.serverIP, s.serverPort, s.last_game_type, s.last_game_mode, s.last_map
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
  last_game_type?: string;
  last_game_mode?: string;
  last_map?: string;
}

interface ServerListRow {
  id: number;
  serverIP: string;
  serverPort: number;
  hostname?: string;
  connected?: boolean;
  authenticated?: boolean;
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

// Render "Add Server" form
router.get('/add-server', isAuthenticated, (req, res) => {
  res.render('add-server');
});

// Render "My Servers" overview page
router.get('/servers', isAuthenticated, (req, res) => {
  res.render('servers');
});

// Render the "Manage Server" page
router.get('/manage/:server_id', isAuthenticated, async (req, res) => {
  try {
    const server_id = parseServerId(req.params.server_id);
    if (!server_id) {
      return res.status(404).send('Server not found');
    }
    const ownerId = req.session.user?.id;
    const server = selectManageStmt.get(server_id, ownerId) as ServerRow | undefined;

    if (!server) {
      return res.status(404).send('Server not found');
    }

    let hostname = '–';
    try {
      const resp = await rcon.executeCommand(server_id, 'hostname');
      hostname = parseHostnameResponse(resp, '–');
    } catch {
      // Silent failure — still show the manage template
    }

    const connInfo = rcon.getConnectionInfo(server_id);
    const host = connInfo?.host || server.serverIP;
    const port = connInfo?.port || server.serverPort;

    const gameTypes = Object.keys(mapsConfig.gameTypes);
    const mapGroups = Object.entries(mapsConfig.mapGroups).map(([id, grp]) => ({
      id,
      displayName: grp.displayName,
    }));

    const lastGameType = server.last_game_type || Object.keys(mapsConfig.gameTypes)[0] || '';
    const gt = mapsConfig.gameTypes[lastGameType];
    const lastGameMode =
      server.last_game_mode || (gt ? Object.keys(gt.gameModes)[0] : undefined) || '';
    const lastMap = server.last_map || '';

    res.render('manage', {
      server_id,
      hostname,
      host,
      port,
      gameTypes,
      mapGroups,
      lastGameType,
      lastGameMode,
      lastMap,
      connected: !!connInfo?.connected,
      authenticated: !!connInfo?.authenticated,
    });
  } catch (err) {
    logger.error({ err }, '[server] manage error');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// API: Add a new CS2 server to the database
router.post('/api/add-server', isAuthenticated, addServerLimiter, async (req, res) => {
  const parseResult = AddServerBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
  }
  const { server_ip: ip, server_port: portNum, rcon_password: password } = parseResult.data;

  if (!isValidServerHost(ip)) {
    return res.status(400).json({
      error: 'server_ip must be a valid IPv4/IPv6 address or hostname',
    });
  }
  if (!(await isValidServerHostResolved(ip))) {
    return res.status(400).json({
      error: 'server_ip must not resolve to a blocked local/control IP address',
    });
  }

  try {
    const ownerId = req.session.user?.id;
    const { count: serverCount } = countServersByOwnerStmt.get(ownerId) as { count: number };
    if (serverCount >= 50) {
      return res.status(400).json({ error: 'Maximum server limit reached' });
    }

    // If the server already exists globally, verify the RCON password before granting access.
    const existing = selectServerByIpPortStmt.get(ip, portNum) as
      | { id: number; rconPassword: string }
      | undefined;
    try {
      await rcon.probeServer({
        id: existing?.id ?? 0,
        serverIP: ip,
        serverPort: portNum,
        rconPassword: password,
      });
    } catch {
      return res.status(400).json({
        error: 'Unable to authenticate to the server with the provided RCON credentials',
      });
    }

    const encryptedPassword = encryptRconSecret(password);
    if (existing) {
      updateServerPasswordStmt.run(encryptedPassword, existing.id);
      insertServerAccessStmt.run(ownerId, existing.id);
      await rcon.connectServer({
        id: existing.id,
        serverIP: ip,
        serverPort: portNum,
        rconPassword: encryptedPassword,
      });
      return res.status(201).json({ message: 'Server added successfully' });
    }

    insertServerStmt.run(ip, portNum, encryptedPassword, ownerId);
    const inserted = selectServerByIpPortStmt.get(ip, portNum) as { id: number } | undefined;

    if (inserted) {
      insertServerAccessStmt.run(ownerId, inserted.id);
      await rcon.connectServer({
        id: inserted.id,
        serverIP: ip,
        serverPort: portNum,
        rconPassword: encryptedPassword,
      });
      return res.status(201).json({ message: 'Server added successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to add the server' });
    }
  } catch (err) {
    logger.error({ err }, '[server] add-server error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: List all servers with connection & hostname status
router.get('/api/servers', isAuthenticated, async (req, res) => {
  try {
    const ownerId = req.session.user?.id;
    const servers = selectAllServersStmt.all(ownerId) as ServerListRow[];

    // Query all server hostnames in parallel with a 2-second overall timeout.
    // Build new result objects instead of mutating the SQLite rows.
    const BATCH_TIMEOUT_MS = 2000;
    const results: ServerListRow[] = servers.map((s) => ({
      ...s,
      hostname: '-',
      connected: false,
      authenticated: false,
    }));
    const hostnameProbes = results.map(async (result) => {
      const sid = result.id.toString();
      if (rcon.hasConnection(sid)) {
        try {
          const resp = await rcon.executeCommand(sid, 'hostname');
          result.hostname = parseHostnameResponse(resp, '-');
          result.connected = true;
          result.authenticated = true;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          logger.warn({ server_id: sid, message }, '[server] RCON error');
        }
      }
    });
    await Promise.race([
      Promise.allSettled(hostnameProbes),
      new Promise((resolve) => setTimeout(resolve, BATCH_TIMEOUT_MS)),
    ]);

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

    await rcon.connectServer(server);
    res.status(200).json({ message: 'Reconnected successfully' });
  } catch (err) {
    logger.error({ err }, '[server] reconnect-server error');
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
      await rcon.removeServer(server_id);
    }
    return res.status(200).json({ message: 'Server deleted successfully' });
  } catch (err) {
    logger.error({ err }, '[server] delete-server error');
    res.status(500).json({ error: 'An error occurred while deleting the server.' });
  }
});

// API: return list of game-modes for a given game-type
router.get('/api/game-types/:type/game-modes', isAuthenticated, (req, res) => {
  const type = String(req.params.type); // guaranteed by Express route pattern `:type`
  const typeCfg = mapsConfig.gameTypes[type];
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
  const typeCfg = mapsConfig.gameTypes[type];
  if (!typeCfg) {
    return res.status(404).json({ error: 'Unknown game type' });
  }
  const modeCfg = typeCfg.gameModes[mode];
  if (!modeCfg) {
    return res.status(404).json({ error: 'Unknown game mode' });
  }
  const maps = getMapsForMode(type, mode);
  res.json({ maps });
});

export default router;
