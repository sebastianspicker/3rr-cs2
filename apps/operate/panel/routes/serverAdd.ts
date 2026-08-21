/** Add-server page and API, including validation, ownership capacity, and RCON setup. */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { better_sqlite_client } from '../db';
import { rateLimitClientKey } from '../modules/appRateLimits';
import isAuthenticated from '../modules/middleware';
import rcon from '../modules/rcon';
import logger from '../utils/logger';
import { isValidServerHost, isValidServerHostResolved } from '../utils/networkValidation';
import { makeRateLimitStore } from '../utils/redis';
import { encryptRconSecret, RconSecretDecryptError } from '../utils/rconSecret';
import { authenticatedUserId } from '../utils/serverAccess';

const router = express.Router();

const insertServerStmt = better_sqlite_client.prepare(
  `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?)`
);
const insertServerAccessStmt = better_sqlite_client.prepare(
  `INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)`
);
const updateServerPasswordStmt = better_sqlite_client.prepare(
  `UPDATE servers SET rconPassword = ? WHERE id = ?`
);
const selectServerByIpPortStmt = better_sqlite_client.prepare(
  `SELECT id, rconPassword FROM servers WHERE serverIP = ? AND serverPort = ?`
);
const countServersByOwnerStmt = better_sqlite_client.prepare(
  `SELECT COUNT(*) AS count FROM server_access WHERE user_id = ?`
);
const selectServerAccessStmt = better_sqlite_client.prepare(
  `SELECT 1 FROM server_access WHERE user_id = ? AND server_id = ?`
);

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
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many servers added; try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitClientKey,
  store: makeRateLimitStore(),
});

const RCON_CONNECT_FAILED_ERROR =
  'Server saved, but the panel could not establish an authenticated RCON connection';
const RCON_CREDENTIAL_STORAGE_ERROR =
  'Stored RCON credential could not be decrypted; check RCON_SECRET_KEY or saved credential';

type AddServerData = z.infer<typeof AddServerBodySchema>;
type PersistServerResult = { serverId: number } | { serverId: null; maximumReached: true };
type PersistAndConnectResult = 'connected' | 'connection_failed' | 'maximum_reached';

function sendAddServerError(response: express.Response, error: unknown): express.Response {
  logger.error({ err: error }, '[server] add-server error');
  if (error instanceof RconSecretDecryptError) {
    return response.status(500).json({
      error: RCON_CREDENTIAL_STORAGE_ERROR,
      credential_error: error.kind,
    });
  }
  return response.status(500).json({ error: 'Internal server error' });
}

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

async function canAuthenticateServer(
  input: AddServerData,
  existingId: number | undefined
): Promise<boolean> {
  try {
    await rcon.probeServer({
      id: existingId ?? 0,
      serverIP: input.server_ip,
      serverPort: input.server_port,
      rconPassword: input.rcon_password,
    });
    return true;
  } catch {
    return false;
  }
}

function saveServerRecord(
  input: AddServerData,
  encryptedPassword: string,
  ownerId: number,
  existingId: number | undefined
): number | null {
  if (existingId !== undefined) {
    updateServerPasswordStmt.run(encryptedPassword, existingId);
    return existingId;
  }
  const insertResult = insertServerStmt.run(
    input.server_ip,
    input.server_port,
    encryptedPassword,
    ownerId
  );
  const inserted = selectServerByIpPortStmt.get(input.server_ip, input.server_port) as
    | { id: number }
    | undefined;
  if (insertResult.changes === 0 && inserted) {
    updateServerPasswordStmt.run(encryptedPassword, inserted.id);
  }
  return inserted?.id ?? null;
}

function ownerCannotAddServer(ownerId: number, existingId: number | undefined): boolean {
  if (existingId !== undefined && selectServerAccessStmt.get(ownerId, existingId)) return false;
  const { count } = countServersByOwnerStmt.get(ownerId) as { count: number };
  return count >= 50;
}

const persistServerAndAccess = better_sqlite_client.transaction(
  (input: AddServerData, encryptedPassword: string, ownerId: number): PersistServerResult => {
    const existing = selectServerByIpPortStmt.get(input.server_ip, input.server_port) as
      | { id: number }
      | undefined;
    if (ownerCannotAddServer(ownerId, existing?.id))
      return { serverId: null, maximumReached: true };
    const serverId = saveServerRecord(input, encryptedPassword, ownerId, existing?.id);
    if (serverId === null) throw new Error('Failed to add the server');
    insertServerAccessStmt.run(ownerId, serverId);
    return { serverId };
  }
);

async function persistAndConnectAuthenticatedServer(
  input: AddServerData,
  ownerId: number
): Promise<PersistAndConnectResult> {
  const encryptedPassword = encryptRconSecret(input.rcon_password);
  const persisted = persistServerAndAccess(input, encryptedPassword, ownerId);
  if (persisted.serverId === null) return 'maximum_reached';
  const connected = await rcon.connectServer({
    id: persisted.serverId,
    serverIP: input.server_ip,
    serverPort: input.server_port,
    rconPassword: encryptedPassword,
  });
  return connected ? 'connected' : 'connection_failed';
}

router.get('/add-server', isAuthenticated, (_req, res) => {
  res.render('add-server');
});

router.post('/api/add-server', isAuthenticated, addServerLimiter, async (req, res) => {
  const input = await validatedServerInput(req.body, res);
  if (!input) return;
  try {
    const ownerId = authenticatedUserId(req);
    if (ownerId === null) return res.status(401).json({ error: 'Unauthorized' });
    const existing = selectServerByIpPortStmt.get(input.server_ip, input.server_port) as
      | { id: number; rconPassword: string }
      | undefined;
    if (ownerCannotAddServer(ownerId, existing?.id)) {
      return res.status(400).json({ error: 'Maximum server limit reached' });
    }
    if (!(await canAuthenticateServer(input, existing?.id))) {
      return res.status(400).json({
        error: 'Unable to authenticate to the server with the provided RCON credentials',
      });
    }
    const outcome = await persistAndConnectAuthenticatedServer(input, ownerId);
    if (outcome === 'maximum_reached') {
      return res.status(400).json({ error: 'Maximum server limit reached' });
    }
    if (outcome === 'connection_failed') {
      return res.status(502).json({ error: RCON_CONNECT_FAILED_ERROR });
    }
    return res.status(201).json({ message: 'Server added successfully' });
  } catch (error) {
    return sendAddServerError(res, error);
  }
});

export default router;
