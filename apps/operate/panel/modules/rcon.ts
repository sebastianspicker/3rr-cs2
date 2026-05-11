// NOTE: rcon-srcds uses Math.random() for RCON packet IDs, which is not
// cryptographically secure. For production deployments with untrusted networks,
// consider forking the library to use crypto.randomInt() or replacing it with
// an alternative RCON client that uses a secure RNG.
import Rcon from 'rcon-srcds';
import type Database from 'better-sqlite3';
import { decryptRconSecret } from '../utils/rconSecret';
import logger from '../utils/logger';

const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 5000;
const RCON_SOCKET_TIMEOUT_MS = 5000;
const RCON_AUTH_TIMEOUT_MS = 10000;
const RCON_DISCONNECT_TIMEOUT_MS = 3000;

interface ServerRecord {
  id: number;
  serverIP: string;
  serverPort: number;
  rconPassword: string;
}

/** Cached server info without the password — passwords are fetched from DB on demand. */
interface ServerInfo {
  id: number;
  serverIP: string;
  serverPort: number;
}

const MAX_HEARTBEAT_INTERVAL_MS = 60000;

interface ServerDetails {
  host: string;
  port: number;
  connected: boolean;
  authenticated: boolean;
  heartbeatInterval?: ReturnType<typeof setInterval>;
  heartbeatFailures: number;
}

type PasswordProvider = (serverId: number) => string | null;

/**
 * Owns live RCON sockets for known servers.
 *
 * Invariants:
 * - `servers` caches address/port only; passwords are fetched from SQLite when connecting.
 * - commands for one server are serialized to protect the single RCON response stream.
 * - shutdown tears down both stored sockets and sockets still authenticating.
 */
export class RconManager {
  private rcons: Record<string, Rcon>;
  private details: Record<string, ServerDetails>;
  private servers: Record<string, ServerInfo>;
  readonly commandTimeoutMs: number;
  readyPromise: Promise<void>;
  private passwordProvider: PasswordProvider;
  // Prevents concurrent reconnection attempts for the same server
  private reconnecting = new Map<string, Promise<void>>();
  private commandChains = new Map<string, Promise<void>>();
  private _shuttingDown = false;
  // Track in-flight sockets created during connect() so shutdownAll can destroy them
  private pendingSockets = new Set<Rcon>();

  constructor(passwordProvider?: PasswordProvider) {
    this.rcons = {};
    this.details = {};
    this.servers = {};
    const raw = Number.parseInt(process.env.RCON_COMMAND_TIMEOUT_MS || '2000', 10);
    this.commandTimeoutMs = Number.isFinite(raw) && raw > 0 ? raw : 2000;
    // Default provider lazily imports db to avoid circular dependency at require time.
    this.passwordProvider =
      passwordProvider ??
      ((serverId: number) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { better_sqlite_client } = require('../db') as {
          better_sqlite_client: Database.Database;
        };
        const row = better_sqlite_client
          .prepare(`SELECT rconPassword FROM servers WHERE id = ?`)
          .get(serverId) as { rconPassword: string } | undefined;
        return row?.rconPassword ?? null;
      });
    this.readyPromise = this.init();
  }

  /** Fetch the encrypted password via the injected provider (never from memory cache). */
  private fetchPasswordFromDb(serverId: number): string | null {
    return this.passwordProvider(serverId);
  }

  private async isResolvedHostAllowed(server_id: string, server: ServerInfo): Promise<boolean> {
    const { isValidServerHostResolved } = await import('../utils/networkValidation');
    if (await isValidServerHostResolved(server.serverIP)) {
      return true;
    }
    logger.warn(
      { server_id, serverIP: server.serverIP },
      '[rcon] connect blocked: hostname resolves to a blocked local/control IP'
    );
    return false;
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
  private async reconnect(server_id: string, server: ServerInfo): Promise<void> {
    const existing = this.reconnecting.get(server_id);
    if (existing) return existing;
    const p = (async () => {
      await this.disconnectRcon(server_id);
      await this.connect(server_id, server);
    })().finally(() => this.reconnecting.delete(server_id));
    this.reconnecting.set(server_id, p);
    return p;
  }

  async init(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { better_sqlite_client: db } = require('../db') as {
        better_sqlite_client: Database.Database;
      };
      const stmt = db.prepare('SELECT id, serverIP, serverPort FROM servers');
      const servers = stmt.all() as ServerInfo[];
      logger.info({ count: servers.length }, '[rcon] Initializing connections');
      await Promise.allSettled(
        servers.map((server) => {
          const sid = server.id.toString();
          if (this.rcons[sid]) return Promise.resolve();
          this.servers[sid] = {
            id: server.id,
            serverIP: server.serverIP,
            serverPort: server.serverPort,
          };
          return this.connect(sid, server);
        })
      );
    } catch (err) {
      logger.error({ err }, 'Error initializing RCON connections');
    }
  }

  async connectServer(server: ServerRecord): Promise<void> {
    const sid = server.id.toString();
    // Cache only connection info, not the password.
    this.servers[sid] = { id: server.id, serverIP: server.serverIP, serverPort: server.serverPort };
    // Route through reconnect() so concurrent calls for the same server are serialized.
    await this.reconnect(sid, this.servers[sid]);
  }

  private async createAuthenticatedConnection(
    server_id: string,
    server: ServerInfo,
    encryptedPassword: string
  ): Promise<Rcon | null> {
    if (!(await this.isResolvedHostAllowed(server_id, server)) || this._shuttingDown) {
      return null;
    }

    let authCompleted = false;
    let conn: Rcon | undefined;
    try {
      conn = new Rcon({
        host: server.serverIP,
        port: server.serverPort,
        timeout: RCON_SOCKET_TIMEOUT_MS,
      });
      this.pendingSockets.add(conn);
      logger.info(
        { server_id, host: server.serverIP, port: server.serverPort },
        '[rcon] connecting'
      );

      const authTimeout = setTimeout(() => {
        if (authCompleted) return;
        authCompleted = true;
        logger.error({ server_id }, '[rcon] Authentication timed out');
        try {
          conn?.connection?.destroy();
        } catch {
          // ignore
        }
      }, RCON_AUTH_TIMEOUT_MS);

      try {
        const decryptedPassword = decryptRconSecret(encryptedPassword);
        await conn.authenticate(decryptedPassword);
        authCompleted = true;
        clearTimeout(authTimeout);
        logger.info({ server_id }, '[rcon] authenticated');
        return conn;
      } catch (err: unknown) {
        authCompleted = true;
        clearTimeout(authTimeout);
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ server_id, message }, '[rcon] Authentication failed');
        conn.connection?.destroy();
        return null;
      }
    } catch (err) {
      logger.error({ err }, '[rcon] connect error');
      conn?.connection?.destroy();
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
    if (!conn || !conn.isConnected() || !conn.isAuthenticated()) {
      throw new Error('RCON authentication failed');
    }
    try {
      conn.connection?.end();
    } catch {
      conn.connection?.destroy();
    }
  }

  async executeCommand(server_id: string, command: string): Promise<string> {
    return this.enqueueServerTask(server_id, async () => {
      // Ensure initial connections are established before executing commands.
      await this.readyPromise;
      const srv = this.servers[server_id];
      if (!srv) {
        throw new Error(`Unknown server_id: ${server_id}`);
      }
      let conn = this.rcons[server_id];

      if (!conn || !conn.isConnected() || !conn.isAuthenticated() || !conn.connection?.writable) {
        logger.info({ server_id }, '[rcon] Connection issue, reconnecting');
        await this.reconnect(server_id, srv);
        conn = this.rcons[server_id];
      }

      if (!conn || !conn.isConnected() || !conn.isAuthenticated() || !conn.connection?.writable) {
        throw new Error(`No valid connection after reconnect for server ${server_id}`);
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const resp = await Promise.race([
          conn.execute(command),
          new Promise<never>((_, rej) => {
            timeoutHandle = setTimeout(() => {
              try {
                if (this.rcons[server_id] === conn) {
                  conn.connection?.destroy();
                  delete this.rcons[server_id];
                }
              } catch {
                // ignore cleanup errors
              }
              rej(new Error('RCON command timed out'));
            }, this.commandTimeoutMs);
          }),
        ]);
        return typeof resp === 'string' ? resp : '';
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      }
    });
  }

  // Heartbeat intervals could overlap if a heartbeat takes longer than the
  // interval period. The `reconnecting` Map in `reconnect()` serializes
  // concurrent reconnection attempts, preventing duplicate connections.
  async sendHeartbeat(server_id: string, server: ServerInfo): Promise<void> {
    await this.enqueueServerTask(server_id, async () => {
      if (!this.rcons[server_id]?.connection?.writable) {
        logger.info({ server_id }, '[heartbeat] Connection unwritable, reconnecting');
        await this.reconnect(server_id, server);
      }
      const conn = this.rcons[server_id];
      if (!conn || !conn.connection?.writable) return;
      try {
        await Promise.race([
          conn.execute('status'),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('Heartbeat timed out')), HEARTBEAT_TIMEOUT_MS)
          ),
        ]);
        const details = this.details[server_id];
        if (details) {
          details.connected = true;
          if (details.heartbeatFailures > 0) {
            details.heartbeatFailures = 0;
            this.restartHeartbeat(server_id, server, HEARTBEAT_INTERVAL_MS);
          }
        }
      } catch (err) {
        logger.warn({ server_id, err }, '[heartbeat] Error, reconnecting');
        if (this.details[server_id]) {
          this.details[server_id].connected = false;
        }
        await this.reconnect(server_id, server);
        if (!this.details[server_id]) return;
        const details = this.details[server_id];
        if (details) {
          details.heartbeatFailures++;
          const backoff = Math.min(
            HEARTBEAT_INTERVAL_MS * Math.pow(2, details.heartbeatFailures),
            MAX_HEARTBEAT_INTERVAL_MS
          );
          this.restartHeartbeat(server_id, server, backoff);
          logger.info(
            { server_id, backoff_ms: backoff },
            '[heartbeat] Backoff, next check scheduled'
          );
        }
      }
    });
  }

  private restartHeartbeat(server_id: string, server: ServerInfo, intervalMs: number): void {
    const details = this.details[server_id];
    if (!details) return;
    clearInterval(details.heartbeatInterval);
    details.heartbeatInterval = setInterval(
      () => this.sendHeartbeat(server_id, server),
      intervalMs
    );
  }

  async connect(server_id: string, server: ServerInfo): Promise<void> {
    if (!server) {
      logger.error('[rcon] connect called without server object');
      return;
    }
    if (this.rcons[server_id]) {
      await this.disconnectRcon(server_id);
    }

    // Fetch the password from the database on every connect, never from cache.
    const encryptedPassword = this.fetchPasswordFromDb(server.id);
    if (!encryptedPassword) {
      logger.error({ server_id }, '[rcon] No password found in DB');
      return;
    }

    if (this._shuttingDown) return;

    const conn = await this.createAuthenticatedConnection(server_id, server, encryptedPassword);
    if (!conn) {
      return;
    }

    if (this._shuttingDown) {
      conn.connection?.destroy();
      return;
    }

    this.rcons[server_id] = conn;
    this.details[server_id] = {
      host: server.serverIP,
      port: server.serverPort,
      connected: conn.isConnected(),
      authenticated: conn.isAuthenticated(),
      heartbeatFailures: 0,
    };

    if (conn.isConnected() && conn.isAuthenticated()) {
      this.details[server_id].heartbeatInterval = setInterval(
        () => this.sendHeartbeat(server_id, server),
        HEARTBEAT_INTERVAL_MS
      );
    }
  }

  async disconnectRcon(server_id: string): Promise<void> {
    logger.info({ server_id }, '[rcon] disconnecting');
    // Always clear heartbeat interval first so stale setInterval closures
    // never reconnect to a server that has been deleted.
    clearInterval(this.details[server_id]?.heartbeatInterval);

    const conn = this.rcons[server_id];
    const isConnected =
      conn && (typeof conn.isConnected === 'function' ? conn.isConnected() : conn.connected);
    if (!conn || !isConnected) {
      delete this.rcons[server_id];
      delete this.details[server_id];
      return;
    }

    delete this.details[server_id];

    if (
      !conn.connection ||
      typeof conn.connection.once !== 'function' ||
      typeof conn.connection.end !== 'function'
    ) {
      delete this.rcons[server_id];
      return;
    }

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        delete this.rcons[server_id];
        resolve();
      };
      const timeout = setTimeout(done, RCON_DISCONNECT_TIMEOUT_MS);
      conn.connection!.once('close', () => {
        clearTimeout(timeout);
        done();
      });
      conn.connection!.once('error', () => {
        clearTimeout(timeout);
        done();
      });
      conn.connection!.end();
    });
  }
  hasConnection(server_id: string): boolean {
    return server_id in this.rcons;
  }

  getConnectionInfo(
    server_id: string
  ): { host: string; port: number; connected: boolean; authenticated: boolean } | null {
    const d = this.details[server_id];
    if (!d) return null;
    return { host: d.host, port: d.port, connected: d.connected, authenticated: d.authenticated };
  }

  async removeServer(server_id: string): Promise<void> {
    await this.disconnectRcon(server_id);
    delete this.servers[server_id];
  }

  async shutdownAll(): Promise<void> {
    logger.info('[rcon] Shutting down all connections...');
    this._shuttingDown = true;
    for (const sid of Object.keys(this.details)) {
      clearInterval(this.details[sid]?.heartbeatInterval);
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
    await Promise.allSettled(Object.keys(this.rcons).map((sid) => this.disconnectRcon(sid)));
    logger.info('[rcon] All connections closed.');
  }
}

export default new RconManager();
