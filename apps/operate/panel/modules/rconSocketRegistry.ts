/** Owns managed and in-flight RCON sockets plus their observable connection state. */
import type Rcon from 'rcon-srcds';
import logger from '../utils/logger';
import { closeManagedRconSocket, destroyPendingRconSocket } from './rconSocketClose';
import type { AuthenticatedRconConnection } from './rconConnection';
import type { RconDisconnectResult, ServerDetails, ServerInfo } from './rconTypes';

export class RconSocketRegistry {
  private readonly rcons = new Map<string, Rcon>();
  private readonly details = new Map<string, ServerDetails>();
  private readonly pendingSockets = new Map<
    Rcon,
    { serverId: string; closeListener: () => void }
  >();

  constructor(
    private readonly disconnectTimeoutMs: number,
    private readonly forceDisconnectTimeoutMs: number
  ) {}

  has(serverId: string): boolean {
    return this.rcons.has(serverId);
  }

  get(serverId: string): Rcon | undefined {
    return this.rcons.get(serverId);
  }

  isCurrent(serverId: string, conn: Rcon): boolean {
    return this.rcons.get(serverId) === conn;
  }

  getDetails(serverId: string): ServerDetails | undefined {
    return this.details.get(serverId);
  }

  getConnectionInfo(
    serverId: string
  ): { host: string; port: number; connected: boolean; authenticated: boolean } | null {
    const details = this.details.get(serverId);
    if (!details) return null;
    return {
      host: details.host,
      port: details.port,
      connected: details.connected,
      authenticated: details.authenticated,
    };
  }

  trackPending(serverId: string, conn: Rcon): void {
    const closeListener = () => this.pendingSockets.delete(conn);
    this.pendingSockets.set(conn, { serverId, closeListener });
    conn.connection.once('close', closeListener);
  }

  releasePending(conn: Rcon): void {
    const pending = this.pendingSockets.get(conn);
    if (pending) conn.connection.removeListener('close', pending.closeListener);
    this.pendingSockets.delete(conn);
  }

  hasPending(serverId: string): boolean {
    return [...this.pendingSockets.values()].some((pending) => pending.serverId === serverId);
  }

  pendingForServer(serverId: string): Rcon[] {
    return [...this.pendingSockets.entries()]
      .filter(([, pending]) => pending.serverId === serverId)
      .map(([conn]) => conn);
  }

  store(
    serverId: string,
    server: ServerInfo,
    connection: AuthenticatedRconConnection,
    heartbeatFailures: number
  ): void {
    const { conn, resolvedHost } = connection;
    this.releasePending(conn);
    this.rcons.set(serverId, conn);
    conn.connection.once('close', () => {
      if (this.rcons.get(serverId) === conn) this.rcons.delete(serverId);
      const details = this.details.get(serverId);
      if (details) {
        details.connected = false;
        details.authenticated = false;
      }
    });
    this.details.set(serverId, {
      host: resolvedHost,
      port: server.serverPort,
      connected: conn.isConnected(),
      authenticated: conn.isAuthenticated(),
      heartbeatFailures,
    });
  }

  async disconnect(serverId: string): Promise<RconDisconnectResult> {
    logger.info({ server_id: serverId }, '[rcon] disconnecting');
    clearInterval(this.details.get(serverId)?.heartbeatInterval);
    const conn = this.rcons.get(serverId);
    if (!conn) {
      this.details.delete(serverId);
      return { server_id: serverId, state: 'absent', closed: true };
    }
    this.details.delete(serverId);
    const result = await closeManagedRconSocket({
      serverId,
      conn,
      gracefulTimeoutMs: this.disconnectTimeoutMs,
      forceTimeoutMs: this.forceDisconnectTimeoutMs,
    });
    if (result.closed && this.rcons.get(serverId) === conn) this.rcons.delete(serverId);
    if (!result.closed) logger.warn(result, '[rcon] disconnect cleanup not confirmed');
    return result;
  }

  async destroyPending(serverId: string, conn: Rcon): Promise<RconDisconnectResult> {
    const result = await destroyPendingRconSocket(serverId, conn, this.forceDisconnectTimeoutMs);
    if (result.closed) this.pendingSockets.delete(conn);
    return result;
  }

  stopAllHeartbeatIntervals(): void {
    for (const details of this.details.values()) clearInterval(details.heartbeatInterval);
  }

  pendingEntries(): Array<[Rcon, { serverId: string }]> {
    return [...this.pendingSockets.entries()];
  }

  managedServerIds(): string[] {
    return [...this.rcons.keys()];
  }
}
