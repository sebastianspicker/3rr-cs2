/** Startup discovery and per-server RCON initialization accounting. */
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import { emptyInitSummary, errorMessage, type RconInitSummary, type ServerInfo } from './rconTypes';

interface RconInitializationDependencies {
  hasConnection(serverId: string): boolean;
  rememberServer(server: ServerInfo): void;
  connect(serverId: string, server: ServerInfo): Promise<boolean>;
}

/** Connect saved servers independently so one failed endpoint never blocks startup. */
export async function initializeRconConnections({
  hasConnection,
  rememberServer,
  connect,
}: RconInitializationDependencies): Promise<RconInitSummary> {
  try {
    const servers = better_sqlite_client
      .prepare('SELECT id, serverIP, serverPort FROM servers')
      .all() as ServerInfo[];
    const summary: RconInitSummary = {
      complete: false,
      total: servers.length,
      connected: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    logger.info({ count: servers.length }, '[rcon] Initializing connections');
    await Promise.all(
      servers.map(async (server) => {
        const serverId = String(server.id);
        if (hasConnection(serverId)) {
          summary.skipped += 1;
          return;
        }

        rememberServer(server);
        try {
          if (await connect(serverId, server)) {
            summary.connected += 1;
            return;
          }
          summary.failed += 1;
          summary.errors.push({
            server_id: serverId,
            serverIP: server.serverIP,
            message: 'RCON initialization failed',
          });
        } catch (error) {
          summary.failed += 1;
          summary.errors.push({
            server_id: serverId,
            serverIP: server.serverIP,
            message: errorMessage(error),
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
    return summary;
  } catch (error) {
    const summary = emptyInitSummary();
    summary.complete = true;
    summary.errors = [{ message: errorMessage(error) }];
    logger.error({ err: error }, 'Error initializing RCON connections');
    return summary;
  }
}
