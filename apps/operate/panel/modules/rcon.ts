/** Per-server RCON lifecycle manager with serialized commands and bounded teardown. */
// NOTE: rcon-srcds uses Math.random() for RCON packet IDs, which is not
// cryptographically secure. For production deployments with untrusted networks,
// consider forking the library to use crypto.randomInt() or replacing it with
// an alternative RCON client that uses a secure RNG.
import type Rcon from 'rcon-srcds';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import { positiveInt, sqlitePasswordProvider } from './rconProviders';
import * as limits from './rconConstants';
import {
  createAuthenticatedRconConnection,
  enqueueRconTask,
  executeRconCommandWithTimeout,
  executeRconHeartbeatWithTimeout,
} from './rconConnection';
import { closeManagedRconSocket, destroyPendingRconSocket } from './rconSocketClose';
import {
  emptyInitSummary,
  errorMessage,
  type RconDisconnectResult,
  type RconInitSummary,
  type RconManagerOptions,
  type RconShutdownSummary,
  type ServerDetails,
  type ServerInfo,
  type ServerRecord,
} from './rconTypes';

export type {
  RconDisconnectResult,
  RconInitError,
  RconInitSummary,
  RconShutdownSummary,
} from './rconTypes';

/**
 * Owns live RCON sockets for known servers.
 *
 * Invariants:
 * - `servers` caches address/port only; passwords are fetched from SQLite when connecting.
 * - commands for one server are serialized to protect the single RCON response stream.
 * - shutdown tears down both stored sockets and sockets still authenticating.
 */
export class RconManager {
  private rcons = new Map<string, Rcon>();
  private details = new Map<string, ServerDetails>();
  private servers = new Map<string, ServerInfo>();
  readonly commandTimeoutMs: number;
  readyPromise: Promise<void>;
  // Prevents concurrent reconnection attempts for the same server
  private reconnecting = new Map<string, Promise<boolean>>();
  private commandChains = new Map<string, Promise<void>>();
  private removedServers = new Set<string>();
  private _shuttingDown = false;
  // Track in-flight sockets until they close or are promoted into `rcons`.
  private pendingSockets = new Map<Rcon, { serverId: string; closeListener: () => void }>();
  private initSummary: RconInitSummary = emptyInitSummary();
  private readonly authTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly maxHeartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly disconnectTimeoutMs: number;
  private readonly forceDisconnectTimeoutMs: number;
  private heartbeatRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private heartbeatFailures = new Map<string, number>();

  private passwordProvider: typeof sqlitePasswordProvider;

  constructor(passwordProvider: typeof sqlitePasswordProvider, options: RconManagerOptions = {}) {
    this.authTimeoutMs = positiveInt(options.authTimeoutMs, limits.DEFAULT_AUTH_TIMEOUT_MS);
    this.heartbeatIntervalMs = positiveInt(
      options.heartbeatIntervalMs,
      limits.HEARTBEAT_INTERVAL_MS
    );
    this.maxHeartbeatIntervalMs = positiveInt(
      options.maxHeartbeatIntervalMs,
      limits.MAX_HEARTBEAT_INTERVAL_MS
    );
    this.heartbeatTimeoutMs = positiveInt(options.heartbeatTimeoutMs, limits.HEARTBEAT_TIMEOUT_MS);
    this.disconnectTimeoutMs = positiveInt(
      options.disconnectTimeoutMs,
      limits.RCON_DISCONNECT_TIMEOUT_MS
    );
    this.forceDisconnectTimeoutMs = positiveInt(
      options.forceDisconnectTimeoutMs,
      limits.RCON_FORCE_DISCONNECT_TIMEOUT_MS
    );
    this.commandTimeoutMs = positiveInt(
      options.commandTimeoutMs ?? process.env.RCON_COMMAND_TIMEOUT_MS,
      2000
    );
    this.passwordProvider = passwordProvider;
    this.readyPromise = this.init();
  }

  getInitSummary(): RconInitSummary {
    return { ...this.initSummary, errors: [...this.initSummary.errors] };
  }

  private trackPendingSocket(serverId: string, conn: Rcon): void {
    const closeListener = () => {
      this.pendingSockets.delete(conn);
    };
    this.pendingSockets.set(conn, { serverId, closeListener });
    conn.connection.once('close', closeListener);
  }

  private releasePendingSocket(conn: Rcon): void {
    const pending = this.pendingSockets.get(conn);
    if (pending) conn.connection.removeListener('close', pending.closeListener);
    this.pendingSockets.delete(conn);
  }

  private trackManagedSocket(server_id: string, conn: Rcon): void {
    conn.connection.once('close', () => {
      if (this.rcons.get(server_id) === conn) this.rcons.delete(server_id);
      const details = this.details.get(server_id);
      if (details) {
        details.connected = false;
        details.authenticated = false;
      }
    });
  }

  // Serializes reconnection: if a reconnect is already in flight for this server,
  // await the existing promise instead of starting a duplicate attempt.
  private async reconnect(server_id: string, server: ServerInfo): Promise<boolean> {
    if (this.removedServers.has(server_id)) return false;
    const existing = this.reconnecting.get(server_id);
    if (existing) return existing;
    const p = (async () => {
      await this.disconnectRcon(server_id);
      return this.connect(server_id, server);
    })().finally(() => this.reconnecting.delete(server_id));
    this.reconnecting.set(server_id, p);
    return p;
  }

  async init(): Promise<void> {
    this.initSummary = emptyInitSummary();
    try {
      const stmt = better_sqlite_client.prepare('SELECT id, serverIP, serverPort FROM servers');
      const servers = stmt.all() as ServerInfo[];
      const summary: RconInitSummary = {
        complete: false,
        total: servers.length,
        connected: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };
      this.initSummary = summary;
      logger.info({ count: servers.length }, '[rcon] Initializing connections');
      await Promise.all(
        servers.map(async (server) => {
          const sid = server.id.toString();
          if (this.rcons.has(sid)) {
            summary.skipped += 1;
            return;
          }
          this.servers.set(sid, {
            id: server.id,
            serverIP: server.serverIP,
            serverPort: server.serverPort,
          });
          try {
            const connected = await this.connect(sid, server);
            if (connected) {
              summary.connected += 1;
            } else {
              summary.failed += 1;
              summary.errors.push({
                server_id: sid,
                serverIP: server.serverIP,
                message: 'RCON initialization failed',
              });
            }
          } catch (err) {
            summary.failed += 1;
            summary.errors.push({
              server_id: sid,
              serverIP: server.serverIP,
              message: errorMessage(err),
            });
          }
        })
      );
      summary.complete = true;
      logger.info(
        {
          total: summary.total,
          connected: summary.connected,
          failed: summary.failed,
          skipped: summary.skipped,
        },
        '[rcon] Initialization complete'
      );
    } catch (err) {
      this.initSummary = {
        complete: true,
        total: 0,
        connected: 0,
        failed: 0,
        skipped: 0,
        errors: [{ message: errorMessage(err) }],
      };
      logger.error({ err }, 'Error initializing RCON connections');
    }
  }

  async connectServer(server: ServerRecord): Promise<boolean> {
    const sid = server.id.toString();
    const removalStillOwnsConnection =
      this.rcons.has(sid) ||
      this.reconnecting.has(sid) ||
      [...this.pendingSockets.values()].some((pending) => pending.serverId === sid);
    if (this.removedServers.has(sid) && removalStillOwnsConnection) return false;
    this.removedServers.delete(sid);
    this.clearHeartbeatRetry(sid);
    this.heartbeatFailures.delete(sid);
    // Cache only connection info, not the password.
    const serverInfo = {
      id: server.id,
      serverIP: server.serverIP,
      serverPort: server.serverPort,
    };
    this.servers.set(sid, serverInfo);
    // Route through reconnect() so concurrent calls for the same server are serialized.
    return this.reconnect(sid, serverInfo);
  }

  async probeServer(server: ServerRecord): Promise<void> {
    const sid = server.id.toString();
    const connection = await this.createAuthenticatedConnection(sid, server, server.rconPassword);
    if (!connection?.conn.isConnected() || !connection.conn.isAuthenticated()) {
      throw new Error('RCON authentication failed');
    }
    try {
      connection.conn.connection.end();
    } catch {
      connection.conn.connection.destroy();
    }
  }

  private createAuthenticatedConnection(
    serverId: string,
    server: ServerInfo,
    encryptedPassword: string
  ) {
    return createAuthenticatedRconConnection({
      serverId,
      server,
      encryptedPassword,
      authTimeoutMs: this.authTimeoutMs,
      shouldAbort: () => this.shouldAbortConnection(serverId),
      trackPendingSocket: (conn) => this.trackPendingSocket(serverId, conn),
    });
  }

  async executeCommand(server_id: string, command: string): Promise<string> {
    return enqueueRconTask(this.commandChains, server_id, async () => {
      const conn = await this.getCommandConnection(server_id);
      return executeRconCommandWithTimeout(
        conn,
        command,
        this.commandTimeoutMs,
        () => this.rcons.get(server_id) === conn
      );
    });
  }

  private async getCommandConnection(server_id: string): Promise<Rcon> {
    await this.readyPromise;
    if (this.removedServers.has(server_id)) {
      throw new Error(`Server ${server_id} has been removed`);
    }
    const server = this.servers.get(server_id);
    if (!server) {
      throw new Error(`Unknown server_id: ${server_id}`);
    }
    let conn = this.rcons.get(server_id);
    if (!conn?.isConnected() || !conn.isAuthenticated() || !conn.connection.writable) {
      logger.info({ server_id }, '[rcon] Connection issue, reconnecting');
      await this.reconnect(server_id, server);
      conn = this.rcons.get(server_id);
    }
    if (this.removedServers.has(server_id)) {
      throw new Error(`Server ${server_id} has been removed`);
    }
    if (!conn?.isConnected() || !conn.isAuthenticated() || !conn.connection.writable) {
      throw new Error(`No valid connection after reconnect for server ${server_id}`);
    }
    return conn;
  }

  // Heartbeat intervals could overlap if a heartbeat takes longer than the
  // interval period. The `reconnecting` Map in `reconnect()` serializes
  // concurrent reconnection attempts, preventing duplicate connections.
  async sendHeartbeat(server_id: string, server: ServerInfo): Promise<void> {
    if (this.removedServers.has(server_id)) return;
    await enqueueRconTask(this.commandChains, server_id, () =>
      this.runHeartbeat(server_id, server)
    );
  }

  private async runHeartbeat(server_id: string, server: ServerInfo): Promise<void> {
    if (this.removedServers.has(server_id)) return;
    const connection = this.rcons.get(server_id);
    if (!connection?.connection.writable) {
      await this.handleHeartbeatError(
        server_id,
        server,
        new Error('RCON connection is not writable')
      );
      return;
    }
    try {
      await executeRconHeartbeatWithTimeout(connection, this.heartbeatTimeoutMs);
      this.markHeartbeatSuccess(server_id, server);
    } catch (error) {
      await this.handleHeartbeatError(server_id, server, error);
    }
  }

  private markHeartbeatSuccess(server_id: string, server: ServerInfo): void {
    const details = this.details.get(server_id);
    if (!details) return;
    details.connected = true;
    const recovered = (this.heartbeatFailures.get(server_id) ?? 0) > 0;
    this.heartbeatFailures.delete(server_id);
    details.heartbeatFailures = 0;
    if (recovered) this.restartHeartbeat(server_id, server, this.heartbeatIntervalMs);
  }

  private async handleHeartbeatError(
    server_id: string,
    server: ServerInfo,
    error: unknown
  ): Promise<void> {
    logger.warn({ server_id, err: error }, '[heartbeat] Error, reconnecting');
    const current = this.details.get(server_id);
    if (current) current.connected = false;
    const failures = Math.min((this.heartbeatFailures.get(server_id) ?? 0) + 1, 30);
    this.heartbeatFailures.set(server_id, failures);
    let reconnected = false;
    try {
      reconnected = await this.reconnect(server_id, server);
    } catch (reconnectError) {
      logger.error({ server_id, err: reconnectError }, '[heartbeat] Reconnect failed');
    }
    if (this.removedServers.has(server_id) || this._shuttingDown) return;
    const backoff = Math.min(this.heartbeatIntervalMs * 2 ** failures, this.maxHeartbeatIntervalMs);
    const details = this.details.get(server_id);
    if (reconnected && details) {
      details.heartbeatFailures = failures;
      this.restartHeartbeat(server_id, server, backoff);
    } else {
      this.scheduleHeartbeatRetry(server_id, server, backoff);
    }
    logger.info({ server_id, backoff_ms: backoff }, '[heartbeat] Backoff, next check scheduled');
  }

  private scheduleHeartbeatRetry(server_id: string, server: ServerInfo, delayMs: number): void {
    this.clearHeartbeatRetry(server_id);
    if (this.removedServers.has(server_id) || this._shuttingDown) return;
    const retryTimer = setTimeout(() => {
      this.heartbeatRetryTimers.delete(server_id);
      void this.sendHeartbeat(server_id, server).catch((error) => {
        logger.error({ server_id, err: error }, '[heartbeat] Scheduled retry failed');
        this.scheduleHeartbeatRetry(server_id, server, delayMs);
      });
    }, delayMs);
    this.heartbeatRetryTimers.set(server_id, retryTimer);
  }

  private clearHeartbeatRetry(server_id: string): void {
    const retryTimer = this.heartbeatRetryTimers.get(server_id);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    this.heartbeatRetryTimers.delete(server_id);
  }

  private restartHeartbeat(server_id: string, server: ServerInfo, intervalMs: number): void {
    const details = this.details.get(server_id);
    if (!details) return;
    clearInterval(details.heartbeatInterval);
    details.heartbeatInterval = setInterval(() => {
      void this.sendHeartbeat(server_id, server).catch((error) => {
        logger.error({ server_id, err: error }, '[heartbeat] Interval check failed');
      });
    }, intervalMs);
  }

  /** Reconnects through a fresh DNS-pinned, authenticated socket; cached secrets are never reused. */
  async connect(server_id: string, server: ServerInfo): Promise<boolean> {
    if (this.removedServers.has(server_id)) return false;
    if (this.rcons.has(server_id)) {
      const result = await this.disconnectRcon(server_id);
      if (!result.closed) return false;
    }

    // Fetch the password from the database on every connect, never from cache.
    const encryptedPassword = this.passwordProvider(server.id);
    if (!encryptedPassword) {
      logger.error({ server_id }, '[rcon] No password found in DB');
      return false;
    }

    if (this._shuttingDown) return false;

    const connection = await this.createAuthenticatedConnection(
      server_id,
      server,
      encryptedPassword
    );
    if (!connection) {
      return false;
    }
    const { conn, resolvedHost } = connection;

    if (this.shouldAbortConnection(server_id)) {
      conn.connection.destroy();
      return false;
    }

    if (!conn.isConnected() || !conn.isAuthenticated()) {
      conn.connection.destroy();
      return false;
    }

    this.releasePendingSocket(conn);
    this.rcons.set(server_id, conn);
    this.trackManagedSocket(server_id, conn);
    const details: ServerDetails = {
      host: resolvedHost,
      port: server.serverPort,
      connected: conn.isConnected(),
      authenticated: conn.isAuthenticated(),
      heartbeatFailures: this.heartbeatFailures.get(server_id) ?? 0,
    };
    this.details.set(server_id, details);

    this.restartHeartbeat(server_id, server, this.heartbeatIntervalMs);
    return true;
  }

  /** Stops timers before closing the socket, then reports whether ownership cleanup completed. */
  async disconnectRcon(server_id: string): Promise<RconDisconnectResult> {
    logger.info({ server_id }, '[rcon] disconnecting');
    // Always clear heartbeat interval first so stale setInterval closures
    // never reconnect to a server that has been deleted.
    clearInterval(this.details.get(server_id)?.heartbeatInterval);
    this.clearHeartbeatRetry(server_id);

    const conn = this.rcons.get(server_id);
    if (!conn) {
      this.details.delete(server_id);
      return { server_id, state: 'absent', closed: true };
    }

    this.details.delete(server_id);

    const result = await closeManagedRconSocket({
      serverId: server_id,
      conn,
      gracefulTimeoutMs: this.disconnectTimeoutMs,
      forceTimeoutMs: this.forceDisconnectTimeoutMs,
    });
    if (result.closed && this.rcons.get(server_id) === conn) this.rcons.delete(server_id);
    if (!result.closed) logger.warn(result, '[rcon] disconnect cleanup not confirmed');
    return result;
  }

  private async destroyPendingSocket(server_id: string, conn: Rcon): Promise<RconDisconnectResult> {
    const result = await destroyPendingRconSocket(server_id, conn, this.forceDisconnectTimeoutMs);
    if (result.closed) this.pendingSockets.delete(conn);
    return result;
  }

  hasConnection(server_id: string): boolean {
    return this.rcons.has(server_id);
  }

  private shouldAbortConnection(server_id: string): boolean {
    return this._shuttingDown || this.removedServers.has(server_id);
  }

  getConnectionInfo(
    server_id: string
  ): { host: string; port: number; connected: boolean; authenticated: boolean } | null {
    const d = this.details.get(server_id);
    if (!d) return null;
    return { host: d.host, port: d.port, connected: d.connected, authenticated: d.authenticated };
  }

  async removeServer(server_id: string): Promise<RconDisconnectResult> {
    this.removedServers.add(server_id);
    this.servers.delete(server_id);
    this.heartbeatFailures.delete(server_id);
    const pendingConnections = [...this.pendingSockets.entries()]
      .filter(([, pending]) => pending.serverId === server_id)
      .map(([conn]) => conn);
    const [managedResult, ...pendingResults] = await Promise.all([
      this.disconnectRcon(server_id),
      ...pendingConnections.map((conn) => this.destroyPendingSocket(server_id, conn)),
    ]);
    const failedResult = [managedResult, ...pendingResults].find((result) => !result.closed);
    if (failedResult) {
      throw new Error(
        `RCON cleanup did not confirm closure for server ${server_id}: ${failedResult.state}`
      );
    }
    if (managedResult.state === 'absent' && pendingResults.length > 0) {
      return { server_id, state: 'closed', closed: true };
    }
    return managedResult;
  }

  async shutdownAll(): Promise<RconShutdownSummary> {
    logger.info('[rcon] Shutting down all connections...');
    this._shuttingDown = true;
    for (const details of this.details.values()) {
      clearInterval(details.heartbeatInterval);
    }
    for (const retryTimer of this.heartbeatRetryTimers.values()) {
      clearTimeout(retryTimer);
    }
    this.heartbeatRetryTimers.clear();
    const pendingClosures = [...this.pendingSockets.entries()].map(([conn, pending]) =>
      this.destroyPendingSocket(pending.serverId, conn)
    );
    const storedClosures = [...this.rcons.keys()].map((sid) => this.disconnectRcon(sid));
    const results = await Promise.all([...pendingClosures, ...storedClosures]);
    const summary: RconShutdownSummary = {
      total: results.length,
      closed: results.filter((result) => result.closed).length,
      failed: results.filter((result) => !result.closed).length,
      results,
    };
    if (summary.failed > 0) {
      logger.warn(summary, '[rcon] Shutdown completed with unconfirmed cleanup');
    } else {
      logger.info(summary, '[rcon] All connections closed.');
    }
    return summary;
  }
}

export default new RconManager(sqlitePasswordProvider);
