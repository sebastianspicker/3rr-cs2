/** RCON connection lifecycle, removal ownership, and bounded shutdown. */
import type Rcon from 'rcon-srcds';
import type Database from 'better-sqlite3';
import logger from '../../infrastructure/logging';
import {
  createAuthenticatedRconConnection,
  type AuthenticatedRconConnection,
  waitBeforeSend,
} from './rconConnection';
import { RconCommandExecutor } from './rconCommandExecutor';
import * as limits from './rconConstants';
import { RconHeartbeatSupervisor } from './rconHeartbeat';
import { initializeRconConnections } from './rconInitialization';
import { RconObservationCache } from './rconObservationCache';
import { positiveInt, validatedManagerOption } from './rconProviders';
import { RconSocketRegistry } from './rconSocketRegistry';
import {
  emptyInitSummary,
  type RconDisconnectResult,
  type RconExecutionOptions,
  type RconInitSummary,
  type RconManagerOptions,
  type RconObservation,
  type RconObservationOptions,
  type RconObservedCommand,
  type RconShutdownSummary,
  type ServerInfo,
  type ServerRecord,
} from './rconTypes';

export class RconConnectionLifecycle {
  private readonly sockets: RconSocketRegistry;
  private readonly heartbeat: RconHeartbeatSupervisor;
  private readonly commands: RconCommandExecutor;
  private readonly observations: RconObservationCache;
  private readonly servers = new Map<string, ServerInfo>();
  private readonly reconnecting = new Map<string, Promise<boolean>>();
  private readonly removedServers = new Set<string>();
  private readonly authTimeoutMs: number;
  private readonly startupConcurrency: number;
  readonly commandTimeoutMs: number;
  readonly totalDeadlineMs: number;
  readonly readyPromise: Promise<void>;
  private initSummary: RconInitSummary = emptyInitSummary();
  private shuttingDown = false;

  constructor(
    private readonly passwordProvider: (serverId: number) => string | null,
    private readonly db: Database.Database,
    options: RconManagerOptions = {}
  ) {
    this.authTimeoutMs = positiveInt(options.authTimeoutMs, limits.DEFAULT_AUTH_TIMEOUT_MS);
    this.commandTimeoutMs = positiveInt(
      options.commandTimeoutMs ?? process.env.RCON_COMMAND_TIMEOUT_MS,
      2000
    );
    this.totalDeadlineMs = validatedManagerOption(
      'totalDeadlineMs',
      options.totalDeadlineMs,
      limits.DEFAULT_TOTAL_DEADLINE_MS
    );
    this.startupConcurrency = validatedManagerOption(
      'startupConcurrency',
      options.startupConcurrency,
      limits.DEFAULT_STARTUP_CONCURRENCY
    );
    this.sockets = new RconSocketRegistry(
      positiveInt(options.disconnectTimeoutMs, limits.RCON_DISCONNECT_TIMEOUT_MS),
      positiveInt(options.forceDisconnectTimeoutMs, limits.RCON_FORCE_DISCONNECT_TIMEOUT_MS),
      (serverId) => this.observations?.invalidateServer(serverId)
    );
    this.commands = new RconCommandExecutor({
      sockets: this.sockets,
      commandTimeoutMs: this.commandTimeoutMs,
      maxQueuedPerServer: validatedManagerOption(
        'maxQueuedPerServer',
        options.maxQueuedPerServer,
        limits.DEFAULT_MAX_QUEUED_PER_SERVER
      ),
      maxQueuedGlobal: validatedManagerOption(
        'maxQueuedGlobal',
        options.maxQueuedGlobal,
        limits.DEFAULT_MAX_QUEUED_GLOBAL
      ),
      getConnection: (serverId, executionOptions) =>
        this.getCommandConnection(serverId, executionOptions),
      invalidate: (serverId) => this.observations.invalidateServer(serverId),
    });
    this.observations = new RconObservationCache(
      (serverId, command, deadlineAt, signal, markSent) =>
        this.commands.execute(
          serverId,
          command,
          { deadlineAt, signal, classification: 'observation' },
          markSent
        ),
      () => this.createDeadline(),
      limits.OBSERVATION_CACHE_TTL_MS
    );
    this.heartbeat = new RconHeartbeatSupervisor(this.sockets, this.commands, {
      intervalMs: positiveInt(options.heartbeatIntervalMs, limits.HEARTBEAT_INTERVAL_MS),
      maxIntervalMs: positiveInt(options.maxHeartbeatIntervalMs, limits.MAX_HEARTBEAT_INTERVAL_MS),
      timeoutMs: positiveInt(options.heartbeatTimeoutMs, limits.HEARTBEAT_TIMEOUT_MS),
      isRemoved: (serverId) => this.removedServers.has(serverId),
      isShuttingDown: () => this.shuttingDown,
      createDeadline: () => this.createDeadline(),
      reconnect: (serverId, server, executionOptions) =>
        this.reconnect(serverId, server, executionOptions),
    });
    this.readyPromise = this.init();
  }

  getInitSummary(): RconInitSummary {
    return { ...this.initSummary, errors: [...this.initSummary.errors] };
  }

  async init(): Promise<void> {
    this.initSummary = emptyInitSummary();
    this.initSummary = await initializeRconConnections({
      db: this.db,
      hasConnection: (serverId) => this.sockets.has(serverId),
      rememberServer: (server) => this.rememberServer(server),
      connect: (serverId, server) => this.connect(serverId, server),
      concurrency: this.startupConcurrency,
    });
  }

  async connectServer(server: ServerRecord): Promise<boolean> {
    const serverId = String(server.id);
    const removalStillOwnsConnection =
      this.sockets.has(serverId) ||
      this.reconnecting.has(serverId) ||
      this.sockets.hasPending(serverId);
    if (this.removedServers.has(serverId) && removalStillOwnsConnection) return false;

    this.removedServers.delete(serverId);
    this.heartbeat.resetServer(serverId);
    const serverInfo = this.rememberServer(server);
    return this.reconnect(serverId, serverInfo);
  }

  async probeServer(server: ServerRecord): Promise<void> {
    const serverId = String(server.id);
    const connection = await this.createAuthenticatedConnection(
      serverId,
      server,
      server.rconPassword
    );
    if (!connection?.conn.isConnected() || !connection.conn.isAuthenticated()) {
      throw new Error('RCON authentication failed');
    }
    try {
      connection.conn.connection.end();
    } catch {
      connection.conn.connection.destroy();
    }
  }

  createDeadline(): number {
    return Date.now() + this.totalDeadlineMs;
  }

  executeCommand(
    serverId: string,
    command: string,
    options: RconExecutionOptions = {}
  ): Promise<string> {
    const classification = options.classification ?? 'mutation';
    return this.commands.execute(serverId, command, {
      deadlineAt: this.executionDeadline(options.deadlineAt),
      signal: options.signal,
      classification,
    });
  }

  observeCommand(
    serverId: string,
    command: RconObservedCommand,
    options: RconObservationOptions = {}
  ): Promise<RconObservation> {
    return this.observations.observe(serverId, command, {
      ...options,
      deadlineAt:
        options.deadlineAt === undefined ? undefined : this.executionDeadline(options.deadlineAt),
    });
  }

  sendHeartbeat(serverId: string, server: ServerInfo): Promise<void> {
    return this.heartbeat.send(serverId, server, this.createDeadline());
  }

  async connect(
    serverId: string,
    server: ServerInfo,
    options: RconExecutionOptions = {}
  ): Promise<boolean> {
    if (this.shouldAbortConnection(serverId)) return false;
    if (
      !(await waitBeforeSend(
        this.disconnectExistingConnection(serverId),
        options.deadlineAt,
        options.signal
      ))
    ) {
      return false;
    }

    // Fetch the password on every connection attempt; server state never caches secrets.
    const encryptedPassword = this.passwordProvider(server.id);
    if (!encryptedPassword) {
      logger.error({ server_id: serverId }, '[rcon] No password found in DB');
      return false;
    }
    if (this.shuttingDown) return false;

    const connection = await this.createAuthenticatedConnection(
      serverId,
      server,
      encryptedPassword,
      options
    );
    return connection ? this.storeAuthenticatedConnection(serverId, server, connection) : false;
  }

  async disconnectRcon(serverId: string): Promise<RconDisconnectResult> {
    this.heartbeat.stopServer(serverId);
    return this.sockets.disconnect(serverId);
  }

  hasConnection(serverId: string): boolean {
    return this.sockets.has(serverId);
  }

  getConnectionInfo(
    serverId: string
  ): { host: string; port: number; connected: boolean; authenticated: boolean } | null {
    return this.sockets.getConnectionInfo(serverId);
  }

  async removeServer(serverId: string): Promise<RconDisconnectResult> {
    this.removedServers.add(serverId);
    this.servers.delete(serverId);
    this.commands.cancelServer(serverId);
    this.observations.invalidateServer(serverId);
    this.heartbeat.removeServer(serverId);
    const pendingConnections = this.sockets.pendingForServer(serverId);
    const [managedResult, ...pendingResults] = await Promise.all([
      this.disconnectRcon(serverId),
      ...pendingConnections.map((connection) => this.sockets.destroyPending(serverId, connection)),
    ]);
    const failedResult = [managedResult, ...pendingResults].find((result) => !result.closed);
    if (failedResult) {
      throw new Error(
        `RCON cleanup did not confirm closure for server ${serverId}: ${failedResult.state}`
      );
    }
    if (managedResult.state === 'absent' && pendingResults.length > 0) {
      return { server_id: serverId, state: 'closed', closed: true };
    }
    return managedResult;
  }

  async shutdownAll(): Promise<RconShutdownSummary> {
    logger.info('[rcon] Shutting down all connections...');
    this.shuttingDown = true;
    this.commands.shutdown();
    this.observations.clear();
    this.heartbeat.stopAll();
    const pendingClosures = this.sockets
      .pendingEntries()
      .map(([connection, pending]) => this.sockets.destroyPending(pending.serverId, connection));
    const storedClosures = this.sockets
      .managedServerIds()
      .map((serverId) => this.disconnectRcon(serverId));
    const results = await Promise.all([...pendingClosures, ...storedClosures]);
    const summary: RconShutdownSummary = {
      total: results.length,
      closed: results.filter((result) => result.closed).length,
      failed: results.filter((result) => !result.closed).length,
      results,
    };
    if (summary.failed > 0)
      logger.warn(summary, '[rcon] Shutdown completed with unconfirmed cleanup');
    else logger.info(summary, '[rcon] All connections closed.');
    return summary;
  }

  private rememberServer(server: ServerInfo): ServerInfo {
    const serverInfo = {
      id: server.id,
      serverIP: server.serverIP,
      serverPort: server.serverPort,
    };
    this.servers.set(String(server.id), serverInfo);
    return serverInfo;
  }

  private async reconnect(
    serverId: string,
    server: ServerInfo,
    options: RconExecutionOptions = {}
  ): Promise<boolean> {
    if (this.removedServers.has(serverId)) return false;
    const existing = this.reconnecting.get(serverId);
    if (existing) return waitBeforeSend(existing, options.deadlineAt, options.signal);
    const reconnecting = (async () => {
      await this.disconnectRcon(serverId);
      return this.connect(serverId, server, options);
    })().finally(() => this.reconnecting.delete(serverId));
    this.reconnecting.set(serverId, reconnecting);
    return waitBeforeSend(reconnecting, options.deadlineAt, options.signal);
  }

  private createAuthenticatedConnection(
    serverId: string,
    server: ServerInfo,
    encryptedPassword: string,
    options: RconExecutionOptions = {}
  ) {
    return createAuthenticatedRconConnection({
      serverId,
      server,
      encryptedPassword,
      authTimeoutMs: this.authTimeoutMs,
      shouldAbort: () => this.shouldAbortConnection(serverId),
      trackPendingSocket: (connection) => this.sockets.trackPending(serverId, connection),
      deadlineAt: options.deadlineAt,
      signal: options.signal,
    });
  }

  private async getCommandConnection(
    serverId: string,
    options: RconExecutionOptions
  ): Promise<Rcon> {
    await waitBeforeSend(this.readyPromise, options.deadlineAt, options.signal);
    this.throwIfRemoved(serverId);
    const server = this.getKnownServer(serverId);
    let connection = this.sockets.get(serverId);
    if (!this.isUsableConnection(connection)) {
      logger.info({ server_id: serverId }, '[rcon] Connection issue, reconnecting');
      await this.reconnect(serverId, server, options);
      connection = this.sockets.get(serverId);
    }
    this.throwIfRemoved(serverId);
    if (!this.isUsableConnection(connection)) {
      throw new Error(`No valid connection after reconnect for server ${serverId}`);
    }
    return connection;
  }

  private getKnownServer(serverId: string): ServerInfo {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Unknown server_id: ${serverId}`);
    return server;
  }

  private throwIfRemoved(serverId: string): void {
    if (this.removedServers.has(serverId)) throw new Error(`Server ${serverId} has been removed`);
  }

  private isUsableConnection(connection: Rcon | undefined): connection is Rcon {
    return Boolean(
      connection?.isConnected() && connection.isAuthenticated() && connection.connection.writable
    );
  }

  private async disconnectExistingConnection(serverId: string): Promise<boolean> {
    if (!this.sockets.has(serverId)) return true;
    return (await this.disconnectRcon(serverId)).closed;
  }

  private storeAuthenticatedConnection(
    serverId: string,
    server: ServerInfo,
    connection: AuthenticatedRconConnection
  ): boolean {
    const { conn } = connection;
    if (this.shouldAbortConnection(serverId) || !conn.isConnected() || !conn.isAuthenticated()) {
      conn.connection.destroy();
      return false;
    }
    this.sockets.store(serverId, server, connection, this.heartbeat.failureCount(serverId));
    this.heartbeat.start(serverId, server);
    return true;
  }

  private shouldAbortConnection(serverId: string): boolean {
    return this.shuttingDown || this.removedServers.has(serverId);
  }

  private executionDeadline(deadlineAt: number | undefined): number {
    if (deadlineAt === undefined) return this.createDeadline();
    if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) {
      throw new TypeError('RCON deadlineAt must be a positive finite timestamp');
    }
    return deadlineAt;
  }
}
