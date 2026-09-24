/** The sole process composition root. */
import path from 'node:path';
import logger from './infrastructure/logging';
import { rconOptionsFromEnvironment } from './app/rconOptions';
import { createPanelApp } from './app/createApp';
import { parsePanelPort, registerUnhandledRejectionHandler, startPanelApp } from './app/lifecycle';
import { createPanelDatabase, createSqliteRconServerStore } from './infrastructure/sqlite';
import { createRedisClient } from './infrastructure/redis';
import { createRconManager } from './integrations/rcon';

export async function composePanelRuntime(nodeEnv = process.env.NODE_ENV ?? 'development') {
  const packageRoot =
    path.basename(path.dirname(__dirname)) === 'dist'
      ? path.resolve(__dirname, '../..')
      : path.resolve(__dirname, '..');
  const rconOptions = rconOptionsFromEnvironment();
  const db = createPanelDatabase({ nodeEnv });
  let redisClient: ReturnType<typeof createRedisClient> = null;
  let rcon: ReturnType<typeof createRconManager> | undefined;
  try {
    redisClient = createRedisClient();
    // Redis-backed rate-limit stores load Lua scripts during app construction.
    // Connect first so those initial commands cannot reject on a closed client.
    if (redisClient) await redisClient.connect();
    rcon = createRconManager(createSqliteRconServerStore(db), rconOptions);
    return {
      app: createPanelApp(nodeEnv, packageRoot, { db, rcon, redisClient }),
      db,
      rcon,
      redisClient,
    };
  } catch (error) {
    try {
      if (rcon) await rcon.shutdownAll();
    } finally {
      try {
        if (redisClient?.isOpen) redisClient.destroy();
      } finally {
        db.close();
      }
    }
    throw error;
  }
}

export function startPanelRuntime(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  registerUnhandledRejectionHandler(nodeEnv);
  void composePanelRuntime(nodeEnv)
    .then((runtime) => {
      startPanelApp(runtime.app, parsePanelPort(process.env.PORT ?? 3000, 3000), runtime);
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Fatal composition error');
      process.exit(1);
    });
}

if (require.main === module) startPanelRuntime();
