import type { Express } from 'express';
import type Database from 'better-sqlite3';
import type { RconManager } from '../integrations/rcon/rcon';
import type { RedisClient } from '../infrastructure/redis';

export function registerHealthRoute(
  app: Express,
  db: Database.Database,
  rcon: RconManager,
  redisClient: RedisClient
): void {
  const dbHealthStmt = db.prepare('SELECT 1');
  const isDatabaseHealthy = (): boolean => {
    try {
      dbHealthStmt.get();
      return true;
    } catch {
      return false;
    }
  };
  app.get('/api/health', (req, res) => {
    const rconInit = rcon.getInitSummary();
    const db = isDatabaseHealthy();
    const redis = redisClient ? redisClient.isReady === true : null;
    const rconReady = rconInit.complete && rconInit.failed === 0 && rconInit.errors.length === 0;
    const ok = db && redis !== false;
    const health = {
      ok,
      ready: ok && rconReady,
      db,
      redis,
      rcon: { ...rconInit, ready: rconReady },
    };
    const statusCode = health.ok ? 200 : 503;
    const verboseHealth = process.env.HEALTHCHECK_VERBOSE === 'true' || Boolean(req.session?.user);
    if (!verboseHealth) return res.status(statusCode).json({ ok: health.ok, ready: health.ready });
    return res.status(statusCode).json(health);
  });
}
