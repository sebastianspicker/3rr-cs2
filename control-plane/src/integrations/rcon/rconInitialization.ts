/** Startup discovery and per-server RCON initialization accounting. */
import type Database from 'better-sqlite3';
import logger from '../../infrastructure/logging';
import { emptyInitSummary, errorMessage, type RconInitSummary, type ServerInfo } from './rconTypes';

interface RconInitializationDependencies {
  db: Database.Database;
  hasConnection(serverId: string): boolean;
  rememberServer(server: ServerInfo): void;
  connect(serverId: string, server: ServerInfo): Promise<boolean>;
  concurrency: number;
}

/** Connect saved servers independently so one failed endpoint never blocks startup. */
export async function initializeRconConnections({
  db,
  hasConnection,
  rememberServer,
  connect,
  concurrency,
}: RconInitializationDependencies): Promise<RconInitSummary> {
  try {
    const servers = db
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
    // Register the complete startup inventory before any connection can finish.
    for (const server of servers) rememberServer(server);
    const results = new Array<
      | { state: 'connected' }
      | { state: 'skipped' }
      | { state: 'failed'; error: RconInitSummary['errors'][number] }
    >(servers.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < servers.length) {
        const index = nextIndex++;
        const server = servers[index];
        if (!server) continue;
        const serverId = String(server.id);
        if (hasConnection(serverId)) {
          results[index] = { state: 'skipped' };
          continue;
        }

        try {
          if (await connect(serverId, server)) {
            results[index] = { state: 'connected' };
            continue;
          }
          results[index] = {
            state: 'failed',
            error: {
              server_id: serverId,
              serverIP: server.serverIP,
              message: 'RCON initialization failed',
            },
          };
        } catch (error) {
          results[index] = {
            state: 'failed',
            error: {
              server_id: serverId,
              serverIP: server.serverIP,
              message: errorMessage(error),
            },
          };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, servers.length) }, () => worker())
    );
    for (const result of results) {
      if (!result) continue;
      if (result.state === 'connected') summary.connected += 1;
      else if (result.state === 'skipped') summary.skipped += 1;
      else {
        summary.failed += 1;
        summary.errors.push(result.error);
      }
    }
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
