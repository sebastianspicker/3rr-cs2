/** Add-server page and API, including validation, ownership capacity, and RCON setup. */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { rateLimitClientKey } from '../../shared/clientAddress';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import logger from '../../infrastructure/logging';
import {
  isValidServerHost,
  isValidServerHostResolved,
  type RconManager,
} from '../../integrations/rcon';
import { makeRateLimitStore, type RedisClient } from '../../infrastructure/redis';
import {
  encryptRconSecret,
  RconSecretDecryptError,
} from '../../infrastructure/credentials/rconCredential';
import type { ServerAccess } from '../server-access/access';
import { createServersRepository } from './repository';

export function createServerAddRouter(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  { authenticatedUserId }: ServerAccess,
  redisClient: RedisClient
): express.Router {
  const router = express.Router();
  const repository = createServersRepository(db);

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
    store: makeRateLimitStore(redisClient),
  });

  const RCON_CONNECT_FAILED_ERROR =
    'Server saved, but the panel could not establish an authenticated RCON connection';
  const RCON_CREDENTIAL_STORAGE_ERROR =
    'Stored RCON credential could not be decrypted; check RCON_SECRET_KEY or saved credential';

  type AddServerData = z.infer<typeof AddServerBodySchema>;
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
      response
        .status(400)
        .json({ error: 'server_ip must be a valid IPv4/IPv6 address or hostname' });
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

  async function persistAndConnectAuthenticatedServer(
    input: AddServerData,
    ownerId: number
  ): Promise<PersistAndConnectResult> {
    const encryptedPassword = encryptRconSecret(input.rcon_password);
    const persisted = repository.persistServerAndAccess(
      input.server_ip,
      input.server_port,
      encryptedPassword,
      ownerId
    );
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
      const existing = repository.findServerByIpPort(input.server_ip, input.server_port);
      if (repository.ownerCannotAddServer(ownerId, existing?.id)) {
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

  return router;
}
