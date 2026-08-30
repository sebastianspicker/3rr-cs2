/** The sole process composition root. */
import path from 'node:path';
import { createPanelApp } from './app/createApp';
import { parsePanelPort, registerUnhandledRejectionHandler, startPanelApp } from './app/lifecycle';
import { createPanelDatabase } from './infrastructure/sqlite';
import { createRedisClient } from './infrastructure/redis';
import { createRconManager } from './integrations/rcon/rcon';

export function composePanelRuntime(nodeEnv = process.env.NODE_ENV ?? 'development') {
  const packageRoot =
    path.basename(path.dirname(__dirname)) === 'dist'
      ? path.resolve(__dirname, '../..')
      : path.resolve(__dirname, '..');
  const db = createPanelDatabase({ nodeEnv });
  const redisClient = createRedisClient();
  const rcon = createRconManager(db);
  return {
    app: createPanelApp(nodeEnv, packageRoot, { db, rcon, redisClient }),
    db,
    rcon,
    redisClient,
  };
}

export function startPanelRuntime(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const runtime = composePanelRuntime(nodeEnv);
  registerUnhandledRejectionHandler(nodeEnv);
  startPanelApp(runtime.app, parsePanelPort(process.env.PORT ?? 3000, 3000), runtime);
}

if (require.main === module) startPanelRuntime();
