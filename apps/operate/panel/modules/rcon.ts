// NOTE: rcon-srcds uses Math.random() for RCON packet IDs, which is not
// cryptographically secure. For production deployments with untrusted networks,
// consider forking the library to use crypto.randomInt() or replacing it with
// an alternative RCON client that uses a secure RNG.
import Rcon from 'rcon-srcds';
import { better_sqlite_client } from '../db';
import { decryptRconSecret, RconSecretDecryptError } from '../utils/rconSecret';
import logger from '../utils/logger';
import { isResolvedHostAllowed, positiveInt, sqlitePasswordProvider } from './rconProviders';
import * as limits from './rconConstants';
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
  // Track in-flight sockets created during connect() so shutdownAll can destroy them
  private pendingSockets = new Set<Rcon>();
  private initSummary: RconInitSummary = emptyInitSummary();
  private readonly authTimeoutMs: number;

  private passwordProvider: typeof sqlitePasswordProvider;

  constructor(passwordProvider: typeof sqlitePasswordProvider, options: RconManagerOptions = {}) {
    this.authTimeoutMs = positiveInt(options.authTimeoutMs, limits.DEFAULT_AUTH_TIMEOUT_MS);
    this.commandTimeoutMs = positiveInt(process.env.RCON_COMMAND_TIMEOUT_MS, 2000);
    this.passwordProvider = passwordProvider;
    this.readyPromise = this.init();
  }

  getInitSummary(): RconInitSummary {
    return { ...this.initSummary, errors: [...this.initSummary.errors] };
  }

  /** Fetch the encrypted password via the provider (never from memory cache). */
  private fetchPassword(serverId: number): string | null {
    return this.passwordProvider(serverId);
  }

  private enqueueServerTask<T>(server_id: string, task: () => Promise<T>): Promise<T> {
    // rcon-srcds exposes one socket per server. Queue same-server operations so
    // command responses cannot interleave across concurrent HTTP requests.
    const previous = this.commandChains.get(server_id) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(task);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.commandChains.set(server_id, tail);
    return result.finally(() => {
      if (this.commandChains.get(server_id) === tail) {
        this.commandChains.delete(server_id);
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
    this.removedServers.delete(sid);
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

  private async createAuthenticatedConnection(
    server_id: string,
    server: ServerInfo,
    encryptedPassword: string
  ): Promise<Rcon | null> {
    if (!(await isResolvedHostAllowed(server_id, server)) || this._shuttingDown) {
      return null;
    }

    let decryptedPassword: string;
    try {
      decryptedPassword = decryptRconSecret(encryptedPassword);
    } catch (err) {
      if (err instanceof RconSecretDecryptError) {
        logger.error({ server_id, kind: err.kind }, '[rcon] stored credential decrypt failed');
      }
      throw err;
    }

    let conn: Rcon | undefined;
    try {
      conn = new Rcon({
        host: server.serverIP,
        port: server.serverPort,
        timeout: limits.RCON_SOCKET_TIMEOUT_MS,
      });
      this.pendingSockets.add(conn);
      const authenticatingConnection = conn;
      logger.info(
        { server_id, host: server.serverIP, port: server.serverPort },
        '[rcon] connecting'
      );

      let authTimeout: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.race([
          authenticatingConnection.authenticate(decryptedPassword),
          new Promise<never>((_, reject) => {
            authTimeout = setTimeout(() => {
              logger.error({ server_id }, '[rcon] Authentication timed out');
              try {
                authenticatingConnection.connection.destroy();
              } catch {
                // ignore
              }
              reject(new Error('RCON authentication timed out'));
            }, this.authTimeoutMs);
          }),
        ]);
        if (authTimeout) clearTimeout(authTimeout);
        logger.info({ server_id }, '[rcon] authenticated');
        return conn;
      } catch (err: unknown) {
        if (authTimeout) clearTimeout(authTimeout);
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ server_id, message }, '[rcon] Authentication failed');
        conn.connection.destroy();
        return null;
      }
    } catch (err) {
      logger.error({ err }, '[rcon] connect error');
      conn?.connection.destroy();
      return null;
    } finally {
      if (conn) {
        this.pendingSockets.delete(conn);
      }
    }
  }

  async probeServer(server: ServerRecord): Promise<void> {
    const sid = server.id.toString();
    const conn = await this.createAuthenticatedConnection(sid, server, server.rconPassword);
    if (!conn?.isConnected() || !conn.isAuthenticated()) {
      throw new Error('RCON authentication failed');
    }
    try {
      conn.connection.end();
    } catch {
      conn.connection.destroy();
    }
  }

  async executeCommand(server_id: string, command: string): Promise<string> {
    return this.enqueueServerTask(server_id, async () => {
      const conn = await this.getCommandConnection(server_id);
      return this.executeWithTimeout(server_id, conn, command);
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

  private async executeWithTimeout(
    server_id: string,
    conn: Rcon,
    command: string
  ): Promise<string> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        conn.execute(command),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            try {
              if (this.rcons.get(server_id) === conn) {
                conn.connection.destroy();
                this.rcons.delete(server_id);
              }
            } catch {
              // ignore cleanup errors
            }
            reject(new Error('RCON command timed out'));
          }, this.commandTimeoutMs);
        }),
      ]);
      return typeof response === 'string' ? response : '';
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  // Heartbeat intervals could overlap if a heartbeat takes longer than the
  // interval period. The `reconnecting` Map in `reconnect()` serializes
  // concurrent reconnection attempts, preventing duplicate connections.
  async sendHeartbeat(server_id: string, server: ServerInfo): Promise<void> {
    if (this.removedServers.has(server_id)) return;
    await this.enqueueServerTask(server_id, () => this.runHeartbeat(server_id, server));
  }

  private async runHeartbeat(server_id: string, server: ServerInfo): Promise<void> {
    if (this.removedServers.has(server_id)) return;
    if (!this.rcons.get(server_id)?.connection.writable) {
      logger.info({ server_id }, '[heartbeat] Connection unwritable, reconnecting');
      await this.reconnect(server_id, server);
    }
    const connection = this.rcons.get(server_id);
    if (!connection?.connection.writable) return;
    try {
      await Promise.race([
        connection.execute('status'),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Heartbeat timed out'));
          }, limits.HEARTBEAT_TIMEOUT_MS);
        }),
      ]);
      this.markHeartbeatSuccess(server_id, server);
    } catch (error) {
      await this.handleHeartbeatError(server_id, server, error);
    }
  }

  private markHeartbeatSuccess(server_id: string, server: ServerInfo): void {
    const details = this.details.get(server_id);
    if (!details) return;
    details.connected = true;
    if (details.heartbeatFailures === 0) return;
    details.heartbeatFailures = 0;
    this.restartHeartbeat(server_id, server, limits.HEARTBEAT_INTERVAL_MS);
  }

  private async handleHeartbeatError(
    server_id: string,
    server: ServerInfo,
    error: unknown
  ): Promise<void> {
    logger.warn({ server_id, err: error }, '[heartbeat] Error, reconnecting');
    const current = this.details.get(server_id);
    if (current) current.connected = false;
    await this.reconnect(server_id, server);
    const details = this.details.get(server_id);
    if (!details) return;
    details.heartbeatFailures += 1;
    const backoff = Math.min(
      limits.HEARTBEAT_INTERVAL_MS * 2 ** details.heartbeatFailures,
      limits.MAX_HEARTBEAT_INTERVAL_MS
    );
    this.restartHeartbeat(server_id, server, backoff);
    logger.info({ server_id, backoff_ms: backoff }, '[heartbeat] Backoff, next check scheduled');
  }

  private restartHeartbeat(server_id: string, server: ServerInfo, intervalMs: number): void {
    const details = this.details.get(server_id);
    if (!details) return;
    clearInterval(details.heartbeatInterval);
    details.heartbeatInterval = setInterval(() => {
      void this.sendHeartbeat(server_id, server);
    }, intervalMs);
  }

  async connect(server_id: string, server: ServerInfo): Promise<boolean> {
    if (this.removedServers.has(server_id)) return false;
    if (this.rcons.has(server_id)) {
      await this.disconnectRcon(server_id);
    }

    // Fetch the password from the database on every connect, never from cache.
    const encryptedPassword = this.fetchPassword(server.id);
    if (!encryptedPassword) {
      logger.error({ server_id }, '[rcon] No password found in DB');
      return false;
    }

    if (this._shuttingDown) return false;

    const conn = await this.createAuthenticatedConnection(server_id, server, encryptedPassword);
    if (!conn) {
      return false;
    }

    if (this.shouldAbortConnection()) {
      conn.connection.destroy();
      return false;
    }

    if (!conn.isConnected() || !conn.isAuthenticated()) {
      conn.connection.destroy();
      return false;
    }

    this.rcons.set(server_id, conn);
    const details: ServerDetails = {
      host: server.serverIP,
      port: server.serverPort,
      connected: conn.isConnected(),
      authenticated: conn.isAuthenticated(),
      heartbeatFailures: 0,
    };
    this.details.set(server_id, details);

    details.heartbeatInterval = setInterval(() => {
      void this.sendHeartbeat(server_id, server);
    }, limits.HEARTBEAT_INTERVAL_MS);
    return true;
  }

  async disconnectRcon(server_id: string): Promise<RconDisconnectResult> {
    logger.info({ server_id }, '[rcon] disconnecting');
    // Always clear heartbeat interval first so stale setInterval closures
    // never reconnect to a server that has been deleted.
    clearInterval(this.details.get(server_id)?.heartbeatInterval);

    const conn = this.rcons.get(server_id);
    const isConnected =
      conn && (typeof conn.isConnected === 'function' ? conn.isConnected() : conn.connected);
    if (!conn || !isConnected) {
      this.rcons.delete(server_id);
      this.details.delete(server_id);
      return { server_id, state: 'absent', closed: true };
    }

    this.details.delete(server_id);

    if (typeof conn.connection.once !== 'function' || typeof conn.connection.end !== 'function') {
      this.rcons.delete(server_id);
      const result: RconDisconnectResult = {
        server_id,
        state: 'no_connection_interface',
        closed: false,
      };
      logger.warn(result, '[rcon] disconnect cleanup not confirmed');
      return result;
    }

    return new Promise<RconDisconnectResult>((resolve) => {
      let resolved = false;
      const done = (result: RconDisconnectResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        this.rcons.delete(server_id);
        if (!result.closed) {
          logger.warn(result, '[rcon] disconnect cleanup not confirmed');
        }
        resolve(result);
      };
      const timeout = setTimeout(() => {
        done({ server_id, state: 'timeout', closed: false });
      }, limits.RCON_DISCONNECT_TIMEOUT_MS);
      conn.connection.once('close', () => {
        done({ server_id, state: 'closed', closed: true });
      });
      conn.connection.once('error', (err: unknown) => {
        done({ server_id, state: 'error', closed: false, error: errorMessage(err) });
      });
      try {
        conn.connection.end();
      } catch (err) {
        done({ server_id, state: 'error', closed: false, error: errorMessage(err) });
      }
    });
  }
  hasConnection(server_id: string): boolean {
    return this.rcons.has(server_id);
  }

  private shouldAbortConnection(): boolean {
    return this._shuttingDown;
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
    const result = await this.disconnectRcon(server_id);
    if (!result.closed) {
      throw new Error(
        `RCON cleanup did not confirm closure for server ${server_id}: ${result.state}`
      );
    }
    return result;
  }

  async shutdownAll(): Promise<RconShutdownSummary> {
    logger.info('[rcon] Shutting down all connections...');
    this._shuttingDown = true;
    for (const details of this.details.values()) {
      clearInterval(details.heartbeatInterval);
    }
    // Destroy in-flight sockets that haven't been stored in this.rcons yet
    for (const conn of this.pendingSockets) {
      try {
        conn.connection?.destroy();
      } catch {
        // ignore
      }
    }
    this.pendingSockets.clear();
    const results = await Promise.all(
      [...this.rcons.keys()].map((sid) => this.disconnectRcon(sid))
    );
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
