/** Per-server heartbeat serialization, recovery backoff, and timer ownership. */
import logger from '../../infrastructure/logging';
import { executeRconHeartbeatWithTimeout } from './rconConnection';
import type { RconCommandExecutor } from './rconCommandExecutor';
import type { RconScheduledTaskContext } from './rconScheduler';
import type { RconSocketRegistry } from './rconSocketRegistry';
import type { RconExecutionOptions, ServerInfo } from './rconTypes';

interface RconHeartbeatOptions {
  intervalMs: number;
  maxIntervalMs: number;
  timeoutMs: number;
  isRemoved: (serverId: string) => boolean;
  isShuttingDown: () => boolean;
  createDeadline: () => number;
  reconnect: (
    serverId: string,
    server: ServerInfo,
    options: RconExecutionOptions
  ) => Promise<boolean>;
}

export class RconHeartbeatSupervisor {
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly sockets: RconSocketRegistry,
    private readonly commands: RconCommandExecutor,
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
    this.clearRetry(serverId);
    this.clearInterval(serverId);
    details.heartbeatInterval = setInterval(() => {
      void this.send(serverId, server).catch((error) => {
        logger.error({ server_id: serverId, err: error }, '[heartbeat] Interval check failed');
      });
    }, intervalMs);
  }

  send(
    serverId: string,
    server: ServerInfo,
    deadlineAt = this.options.createDeadline()
  ): Promise<void> {
    if (this.options.isRemoved(serverId)) return Promise.resolve();
    return this.commands.heartbeat(serverId, deadlineAt, (context) =>
      this.run(serverId, server, context)
    );
  }

  private async run(
    serverId: string,
    server: ServerInfo,
    context: RconScheduledTaskContext
  ): Promise<void> {
    if (this.options.isRemoved(serverId)) return;
    context.throwIfUnavailable();
    const connection = this.sockets.get(serverId);
    if (!connection?.connection.writable) {
      await this.handleError(
        serverId,
        server,
        new Error('RCON connection is not writable'),
        context
      );
      return;
    }
    try {
      await executeRconHeartbeatWithTimeout(connection, this.options.timeoutMs, context);
      this.markSuccess(serverId, server);
    } catch (error) {
      await this.handleError(serverId, server, error, context);
    }
  }

  private markSuccess(serverId: string, server: ServerInfo): void {
    const details = this.sockets.getDetails(serverId);
    if (!details) return;
    this.clearRetry(serverId);
    details.connected = true;
    const recovered = this.failureCount(serverId) > 0;
    this.failures.delete(serverId);
    details.heartbeatFailures = 0;
    if (recovered) this.start(serverId, server);
  }

  private async handleError(
    serverId: string,
    server: ServerInfo,
    error: unknown,
    context: RconScheduledTaskContext
  ): Promise<void> {
    logger.warn({ server_id: serverId, err: error }, '[heartbeat] Error, reconnecting');
    const current = this.sockets.getDetails(serverId);
    if (current) current.connected = false;
    const failures = Math.min(this.failureCount(serverId) + 1, 30);
    this.failures.set(serverId, failures);
    const backoff = Math.min(this.options.intervalMs * 2 ** failures, this.options.maxIntervalMs);
    if (context.deadlineAt <= Date.now() || context.signal?.aborted) {
      if (!this.options.isRemoved(serverId) && !this.options.isShuttingDown()) {
        this.scheduleRetry(serverId, server, backoff);
      }
      return;
    }
    let reconnected = false;
    try {
      reconnected = await this.options.reconnect(serverId, server, {
        deadlineAt: context.deadlineAt,
        signal: context.signal,
        classification: 'heartbeat',
      });
    } catch (reconnectError) {
      logger.error({ server_id: serverId, err: reconnectError }, '[heartbeat] Reconnect failed');
    }
    if (this.options.isRemoved(serverId) || this.options.isShuttingDown()) return;
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
    this.clearInterval(serverId);
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

  private clearInterval(serverId: string): void {
    const details = this.sockets.getDetails(serverId);
    if (!details) return;
    clearInterval(details.heartbeatInterval);
    details.heartbeatInterval = undefined;
  }
}
