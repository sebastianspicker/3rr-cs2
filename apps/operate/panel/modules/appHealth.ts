import type { Express } from 'express';
import { better_sqlite_client } from '../db';
import { redisClient } from '../utils/redis';
import rcon from './rcon';

export function registerHealthRoute(app: Express): void {
  const dbHealthStmt = better_sqlite_client.prepare('SELECT 1');
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
