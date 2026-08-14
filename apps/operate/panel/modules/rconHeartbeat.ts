/** Per-server heartbeat serialization, recovery backoff, and timer ownership. */
import logger from '../utils/logger';
import { enqueueRconTask, executeRconHeartbeatWithTimeout } from './rconConnection';
import type { RconSocketRegistry } from './rconSocketRegistry';
import type { ServerInfo } from './rconTypes';

interface RconHeartbeatOptions {
  intervalMs: number;
  maxIntervalMs: number;
  timeoutMs: number;
  isRemoved: (serverId: string) => boolean;
  isShuttingDown: () => boolean;
  reconnect: (serverId: string, server: ServerInfo) => Promise<boolean>;
}

export class RconHeartbeatSupervisor {
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly sockets: RconSocketRegistry,
    private readonly commandChains: Map<string, Promise<void>>,
    private readonly options: RconHeartbeatOptions
  ) {}

  resetServer(serverId: string): void {
    this.clearRetry(serverId);
    this.failures.delete(serverId);
  }

  removeServer(serverId: string): void {
    this.resetServer(serverId);
  }

  failureCount(serverId: string): number {
    return this.failures.get(serverId) ?? 0;
  }

  stopServer(serverId: string): void {
    clearInterval(this.sockets.getDetails(serverId)?.heartbeatInterval);
    this.clearRetry(serverId);
  }

  stopAll(): void {
    this.sockets.stopAllHeartbeatIntervals();
    for (const retryTimer of this.retryTimers.values()) clearTimeout(retryTimer);
    this.retryTimers.clear();
  }

  start(serverId: string, server: ServerInfo, intervalMs = this.options.intervalMs): void {
    const details = this.sockets.getDetails(serverId);
    if (!details) return;
    clearInterval(details.heartbeatInterval);
    details.heartbeatInterval = setInterval(() => {
      void this.send(serverId, server).catch((error) => {
        logger.error({ server_id: serverId, err: error }, '[heartbeat] Interval check failed');
      });
    }, intervalMs);
  }

  send(serverId: string, server: ServerInfo): Promise<void> {
    if (this.options.isRemoved(serverId)) return Promise.resolve();
    return enqueueRconTask(this.commandChains, serverId, () => this.run(serverId, server));
  }

  private async run(serverId: string, server: ServerInfo): Promise<void> {
    if (this.options.isRemoved(serverId)) return;
    const connection = this.sockets.get(serverId);
    if (!connection?.connection.writable) {
      await this.handleError(serverId, server, new Error('RCON connection is not writable'));
      return;
    }
    try {
      await executeRconHeartbeatWithTimeout(connection, this.options.timeoutMs);
      this.markSuccess(serverId, server);
    } catch (error) {
      await this.handleError(serverId, server, error);
    }
  }

  private markSuccess(serverId: string, server: ServerInfo): void {
    const details = this.sockets.getDetails(serverId);
    if (!details) return;
    details.connected = true;
    const recovered = this.failureCount(serverId) > 0;
    this.failures.delete(serverId);
    details.heartbeatFailures = 0;
    if (recovered) this.start(serverId, server);
  }

  private async handleError(serverId: string, server: ServerInfo, error: unknown): Promise<void> {
    logger.warn({ server_id: serverId, err: error }, '[heartbeat] Error, reconnecting');
    const current = this.sockets.getDetails(serverId);
    if (current) current.connected = false;
    const failures = Math.min(this.failureCount(serverId) + 1, 30);
    this.failures.set(serverId, failures);
    let reconnected = false;
    try {
      reconnected = await this.options.reconnect(serverId, server);
    } catch (reconnectError) {
      logger.error({ server_id: serverId, err: reconnectError }, '[heartbeat] Reconnect failed');
    }
    if (this.options.isRemoved(serverId) || this.options.isShuttingDown()) return;
    const backoff = Math.min(this.options.intervalMs * 2 ** failures, this.options.maxIntervalMs);
    const details = this.sockets.getDetails(serverId);
    if (reconnected && details) {
      details.heartbeatFailures = failures;
      this.start(serverId, server, backoff);
    } else {
      this.scheduleRetry(serverId, server, backoff);
    }
    logger.info(
      { server_id: serverId, backoff_ms: backoff },
      '[heartbeat] Backoff, next check scheduled'
    );
  }

  private scheduleRetry(serverId: string, server: ServerInfo, delayMs: number): void {
    this.clearRetry(serverId);
    if (this.options.isRemoved(serverId) || this.options.isShuttingDown()) return;
    const retryTimer = setTimeout(() => {
      this.retryTimers.delete(serverId);
      void this.send(serverId, server).catch((error) => {
        logger.error({ server_id: serverId, err: error }, '[heartbeat] Scheduled retry failed');
        this.scheduleRetry(serverId, server, delayMs);
      });
    }, delayMs);
    this.retryTimers.set(serverId, retryTimer);
  }

  private clearRetry(serverId: string): void {
    const retryTimer = this.retryTimers.get(serverId);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    this.retryTimers.delete(serverId);
  }
}
