/** Stateless RCON connection construction, authentication, and command timeouts. */
import Rcon from 'rcon-srcds';
import { decryptRconSecret, RconSecretDecryptError } from '../utils/rconSecret';
import logger from '../utils/logger';
import { resolveAllowedRconAddress } from './rconProviders';
import { RCON_SOCKET_TIMEOUT_MS } from './rconConstants';
import type { ServerInfo } from './rconTypes';

export interface AuthenticatedRconConnection {
  conn: Rcon;
  resolvedHost: string;
}

/** Serialize work against a caller-owned per-server command chain. */
export function enqueueRconTask<T>(
  commandChains: Map<string, Promise<void>>,
  serverId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = commandChains.get(serverId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(task);
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  commandChains.set(serverId, tail);
  return result.finally(() => {
    if (commandChains.get(serverId) === tail) commandChains.delete(serverId);
  });
}

interface CreateConnectionOptions {
  serverId: string;
  server: ServerInfo;
  encryptedPassword: string;
  authTimeoutMs: number;
  shouldAbort: () => boolean;
  trackPendingSocket: (conn: Rcon) => void;
}

export async function createAuthenticatedRconConnection({
  serverId,
  server,
  encryptedPassword,
  authTimeoutMs,
  shouldAbort,
  trackPendingSocket,
}: CreateConnectionOptions): Promise<AuthenticatedRconConnection | null> {
  const resolvedHost = await resolveAllowedRconAddress(serverId, server);
  if (!resolvedHost || shouldAbort()) return null;

  let decryptedPassword: string;
  try {
    decryptedPassword = decryptRconSecret(encryptedPassword);
  } catch (err) {
    if (err instanceof RconSecretDecryptError) {
      logger.error(
        { server_id: serverId, kind: err.kind },
        '[rcon] stored credential decrypt failed'
      );
    }
    throw err;
  }

  let conn: Rcon | undefined;
  try {
    conn = new Rcon({
      host: resolvedHost,
      port: server.serverPort,
      timeout: RCON_SOCKET_TIMEOUT_MS,
    });
    const authentication = conn.authenticate(decryptedPassword);
    trackPendingSocket(conn);
    logger.info(
      { server_id: serverId, host: resolvedHost, port: server.serverPort },
      '[rcon] connecting'
    );
    await authenticateWithTimeout(conn, serverId, authentication, authTimeoutMs);
    if (shouldAbort()) {
      conn.connection.destroy();
      return null;
    }
    logger.info({ server_id: serverId }, '[rcon] authenticated');
    return { conn, resolvedHost };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ server_id: serverId, message }, '[rcon] Authentication failed');
    conn?.connection.destroy();
    return null;
  }
}

async function authenticateWithTimeout(
  conn: Rcon,
  serverId: string,
  authentication: Promise<unknown>,
  authTimeoutMs: number
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      authentication,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          logger.error({ server_id: serverId }, '[rcon] Authentication timed out');
          try {
            conn.connection.destroy();
          } catch {
            // Best-effort timeout cleanup.
          }
          reject(new Error('RCON authentication timed out'));
        }, authTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function executeRconCommandWithTimeout(
  conn: Rcon,
  command: string,
  timeoutMs: number,
  isManagedConnection: () => boolean
): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      conn.execute(command),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          try {
            if (isManagedConnection()) conn.connection.destroy();
          } catch {
            // Best-effort timeout cleanup.
          }
          reject(new Error('RCON command timed out'));
        }, timeoutMs);
      }),
    ]);
    return typeof response === 'string' ? response : '';
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function executeRconHeartbeatWithTimeout(
  conn: Rcon,
  timeoutMs: number
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      conn.execute('status'),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Heartbeat timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
