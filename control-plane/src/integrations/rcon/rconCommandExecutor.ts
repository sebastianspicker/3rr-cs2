/** Serialized per-server command execution over lifecycle-owned RCON connections. */
import type Rcon from 'rcon-srcds';
import { enqueueRconTask, executeRconCommandWithTimeout } from './rconConnection';
import type { RconSocketRegistry } from './rconSocketRegistry';

interface RconCommandExecutorOptions {
  sockets: RconSocketRegistry;
  commandTimeoutMs: number;
  getConnection(serverId: string): Promise<Rcon>;
}

export class RconCommandExecutor {
  readonly chains = new Map<string, Promise<void>>();

  constructor(private readonly options: RconCommandExecutorOptions) {}

  execute(serverId: string, command: string): Promise<string> {
    return enqueueRconTask(this.chains, serverId, async () => {
      const connection = await this.options.getConnection(serverId);
      return executeRconCommandWithTimeout(connection, command, this.options.commandTimeoutMs, () =>
        this.options.sockets.isCurrent(serverId, connection)
      );
    });
  }
}
