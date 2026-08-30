import type { Express } from 'express';
import type { Server as HttpServer } from 'node:http';
import type Database from 'better-sqlite3';
import logger from '../infrastructure/logging';
import type { RconManager } from '../integrations/rcon/rcon';
import type { RedisClient } from '../infrastructure/redis';

export function parsePanelPort(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 65535 ? value : fallback;
}

async function runShutdownTask(
  component: string,
  task: () => void | Promise<void>
): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (err) {
    logger.error({ err, component }, '[process] shutdown task failed');
    return false;
  }
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function closeRconConnections(rcon: RconManager): Promise<void> {
  const summary = await rcon.shutdownAll();
  if (summary.failed > 0) {
    throw new Error(`RCON shutdown left ${summary.failed} of ${summary.total} sockets unconfirmed`);
  }
}

async function connectRedis(redisClient: RedisClient): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.connect();
  } catch (err) {
    logger.error({ err }, '[redis] connect failed');
    process.exit(1);
  }
}

function listenForHttpRequests(app: Express, port: number): HttpServer {
  const server = app.listen(port, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' && address.port ? address.port : port;
    logger.info({ port: actualPort }, 'Server is running');
  });
  return server;
}

function createShutdownHandler(
  server: HttpServer,
  dependencies: { db: Database.Database; rcon: RconManager; redisClient: RedisClient }
): (signal: string) => Promise<void> {
  const shutdownTimeoutMs = 15_000;
  let shutdownStarted = false;
  return async (signal: string) => {
    if (shutdownStarted) {
      logger.error({ signal }, '[process] second shutdown signal received; forcing exit');
      server.closeAllConnections();
      process.exit(1);
    }
    shutdownStarted = true;
    logger.info({ signal }, '[process] received, shutting down...');
    const shutdownDeadline = setTimeout(() => {
      logger.error(
        { timeout_ms: shutdownTimeoutMs },
        '[process] graceful shutdown timed out; forcing exit'
      );
      server.closeAllConnections();
      process.exit(1);
    }, shutdownTimeoutMs);
    const [httpClosed, rconClosed] = await Promise.all([
      runShutdownTask('http', () => closeHttpServer(server)),
      runShutdownTask('rcon', () => closeRconConnections(dependencies.rcon)),
    ]);
    const redisClosed = await runShutdownTask('redis', async () => {
      if (dependencies.redisClient) await dependencies.redisClient.quit();
    });
    const databaseClosed = await runShutdownTask('database', () => {
      dependencies.db.close();
    });
    clearTimeout(shutdownDeadline);
    process.exit(httpClosed && rconClosed && redisClosed && databaseClosed ? 0 : 1);
  };
}

export function startPanelApp(
  app: Express,
  port: number,
  dependencies: { db: Database.Database; rcon: RconManager; redisClient: RedisClient }
): void {
  void (async () => {
    await connectRedis(dependencies.redisClient);
    const server = listenForHttpRequests(app, port);
    const shutdown = createShutdownHandler(server, dependencies);
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  })().catch((err: unknown) => {
    logger.error({ err }, 'Fatal startup error');
    process.exit(1);
  });
}

export function registerUnhandledRejectionHandler(nodeEnv: string): void {
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '[process] unhandled promise rejection');
    if (nodeEnv === 'production') {
      process.exitCode = 1;
      setImmediate(() => process.exit(1));
    }
  });
}
