/** Stateless RCON connection construction, authentication, and command timeouts. */
import Rcon from 'rcon-srcds';
import {
  decryptRconSecret,
  RconSecretDecryptError,
} from '../../infrastructure/credentials/rconCredential';
import logger from '../../infrastructure/logging';
import { resolveAllowedRconAddress } from './rconProviders';
import { RCON_SOCKET_TIMEOUT_MS } from './rconConstants';
import { RconCancelledError, RconDeadlineError, RconExecutionError } from './rconErrors';
import type { RconScheduledTaskContext } from './rconScheduler';
import type { ServerInfo } from './rconTypes';

export interface AuthenticatedRconConnection {
  conn: Rcon;
  resolvedHost: string;
}

interface CreateConnectionOptions {
  serverId: string;
  server: ServerInfo;
  encryptedPassword: string;
  authTimeoutMs: number;
  shouldAbort: () => boolean;
  trackPendingSocket: (conn: Rcon) => void;
  deadlineAt?: number;
  signal?: AbortSignal;
}

export async function createAuthenticatedRconConnection({
  serverId,
  server,
  encryptedPassword,
  authTimeoutMs,
  shouldAbort,
  trackPendingSocket,
  deadlineAt,
  signal,
}: CreateConnectionOptions): Promise<AuthenticatedRconConnection | null> {
  const resolvedHost = await waitBeforeSend(
    resolveAllowedRconAddress(serverId, server),
    deadlineAt,
    signal
  );
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
    await authenticateWithTimeout(
      conn,
      serverId,
      authentication,
      authTimeoutMs,
      deadlineAt,
      signal
    );
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
    if (err instanceof RconExecutionError) throw err;
    return null;
  }
}

async function authenticateWithTimeout(
  conn: Rcon,
  serverId: string,
  authentication: Promise<unknown>,
  authTimeoutMs: number,
  deadlineAt?: number,
  signal?: AbortSignal
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await waitBeforeSend(
      Promise.race([
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
      ]),
      deadlineAt,
      signal,
      () => conn.connection.destroy()
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function executeRconCommandWithTimeout(
  conn: Rcon,
  command: string,
  options: {
    timeoutMs: number;
    deadlineAt: number;
    signal?: AbortSignal;
    isManagedConnection: () => boolean;
    onSent: () => void;
  }
): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    if (options.signal?.aborted) throw new RconCancelledError();
    const remaining = options.deadlineAt - Date.now();
    if (remaining <= 0) throw new RconDeadlineError();
    options.onSent();
    const execution = conn.execute(command);
    const deadlineWins = remaining <= options.timeoutMs;
    const effectiveTimeoutMs = Math.min(options.timeoutMs, remaining);
    const response = await Promise.race([
      execution,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          destroyCurrentConnection(conn, options.isManagedConnection);
          reject(
            deadlineWins ? new RconDeadlineError('unknown') : new Error('RCON command timed out')
          );
        }, effectiveTimeoutMs);
      }),
      ...(options.signal
        ? [
            new Promise<never>((_, reject) => {
              abortListener = () => {
                destroyCurrentConnection(conn, options.isManagedConnection);
                reject(new RconCancelledError('unknown'));
              };
              options.signal?.addEventListener('abort', abortListener, { once: true });
            }),
          ]
        : []),
    ]);
    return typeof response === 'string' ? response : '';
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (options.signal && abortListener) {
      options.signal.removeEventListener('abort', abortListener);
    }
  }
}

export async function executeRconHeartbeatWithTimeout(
  conn: Rcon,
  timeoutMs: number,
  context: RconScheduledTaskContext
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    context.throwIfUnavailable();
    const remaining = context.deadlineAt - Date.now();
    context.markSent();
    const deadlineWins = remaining <= timeoutMs;
    await Promise.race([
      conn.execute('status'),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              deadlineWins ? new RconDeadlineError('unknown') : new Error('Heartbeat timed out')
            ),
          Math.max(0, Math.min(timeoutMs, remaining))
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export function waitBeforeSend<T>(
  promise: Promise<T>,
  deadlineAt?: number,
  signal?: AbortSignal,
  cancel?: () => void
): Promise<T> {
  if (signal?.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(new RconCancelledError());
  }
  if (deadlineAt === undefined && !signal) return promise;
  const remaining = deadlineAt === undefined ? undefined : deadlineAt - Date.now();
  if (remaining !== undefined && remaining <= 0) {
    void promise.catch(() => undefined);
    return Promise.reject(new RconDeadlineError());
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer =
      remaining === undefined
        ? undefined
        : setTimeout(() => {
            finish(() => {
              cancel?.();
              reject(new RconDeadlineError());
            });
          }, remaining);
    const onAbort = () =>
      finish(() => {
        cancel?.();
        reject(new RconCancelledError());
      });
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
  });
}

function destroyCurrentConnection(conn: Rcon, isManagedConnection: () => boolean): void {
  try {
    if (isManagedConnection()) conn.connection.destroy();
  } catch {
    // Best-effort timeout cleanup.
  }
}
