/** Bounded per-server command execution over lifecycle-owned RCON connections. */
import type Rcon from 'rcon-srcds';
import { executeRconCommandWithTimeout } from './rconConnection';
import { executionError } from './rconErrors';
import { RconScheduler, type RconScheduledTaskContext } from './rconScheduler';
import type { RconSocketRegistry } from './rconSocketRegistry';
import type { RconExecutionOptions, RconTaskClassification } from './rconTypes';

interface RconCommandExecutorOptions {
  sockets: RconSocketRegistry;
  commandTimeoutMs: number;
  maxQueuedPerServer: number;
  maxQueuedGlobal: number;
  getConnection(serverId: string, options: RconExecutionOptions): Promise<Rcon>;
  invalidate(serverId: string): void;
}

export class RconCommandExecutor {
  private readonly scheduler: RconScheduler;

  constructor(private readonly options: RconCommandExecutorOptions) {
    this.scheduler = new RconScheduler({
      maxQueuedPerServer: options.maxQueuedPerServer,
      maxQueuedGlobal: options.maxQueuedGlobal,
    });
  }

  execute(
    serverId: string,
    command: string,
    options: Required<Pick<RconExecutionOptions, 'deadlineAt' | 'classification'>> &
      Pick<RconExecutionOptions, 'signal'>,
    onSent?: () => void
  ): Promise<string> {
    return this.scheduler.schedule(
      serverId,
      options.classification,
      options.deadlineAt,
      options.signal,
      (context) => this.run(serverId, command, options.classification, context, onSent)
    );
  }

  heartbeat(
    serverId: string,
    deadlineAt: number,
    run: (context: RconScheduledTaskContext) => Promise<void>
  ): Promise<void> {
    return this.scheduler.schedule(serverId, 'heartbeat', deadlineAt, undefined, run);
  }

  cancelServer(serverId: string): void {
    this.scheduler.cancelServer(serverId);
  }

  shutdown(): void {
    this.scheduler.shutdown();
  }

  private async run(
    serverId: string,
    command: string,
    classification: RconTaskClassification,
    context: RconScheduledTaskContext,
    onSent?: () => void
  ): Promise<string> {
    try {
      context.throwIfUnavailable();
      const connection = await this.options.getConnection(serverId, {
        deadlineAt: context.deadlineAt,
        signal: context.signal,
        classification,
      });
      context.throwIfUnavailable();
      return await executeRconCommandWithTimeout(connection, command, {
        timeoutMs: this.options.commandTimeoutMs,
        deadlineAt: context.deadlineAt,
        signal: context.signal,
        isManagedConnection: () => this.options.sockets.isCurrent(serverId, connection),
        onSent: () => {
          context.markSent();
          if (classification === 'mutation') this.options.invalidate(serverId);
          onSent?.();
        },
      });
    } catch (error) {
      throw executionError(error, context.wasSent());
    }
  }
}
