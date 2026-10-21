import type { Express, Request } from 'express';
import type Database from 'better-sqlite3';
import type { RconManager } from '../integrations/rcon';
import type { RedisClient } from '../infrastructure/redis';
import { createDatabaseHealthCheck } from '../infrastructure/sqlite';
import { createAuthRepository } from '../features/auth/repository';
import { credentialFingerprint } from '../shared/credentialFingerprint';

export function registerHealthRoute(
  app: Express,
  db: Database.Database,
  rcon: RconManager,
  redisClient: RedisClient
): void {
  const isDatabaseHealthy = createDatabaseHealthCheck(db);
  const authRepository = createAuthRepository(db);
  // This route is public, so the session's cached admin flag is re-checked here.
  const isCurrentAdmin = (sessionUser: Request['session']['user']): boolean => {
    if (!sessionUser) return false;
    const user = authRepository.findSessionUser(sessionUser.id);
    return user?.is_admin === 1 && sessionUser.credential === credentialFingerprint(user.password);
  };
  app.get('/api/health', (req, res) => {
    const rconInit = rcon.getInitSummary();
    const db = isDatabaseHealthy();
    const redis = redisClient ? redisClient.isReady === true : null;
    const rconReady = rconInit.complete && rconInit.failed === 0 && rconInit.errors.length === 0;
    const ok = db && redis !== false;
    // Readiness covers the panel process only; unreachable game servers are reported in `rcon`.
    const health = {
      ok,
      ready: ok && rconInit.complete,
      db,
      redis,
      rcon: { ...rconInit, ready: rconReady },
    };
    const statusCode = health.ok ? 200 : 503;
    const verboseHealth =
      process.env.HEALTHCHECK_VERBOSE === 'true' || isCurrentAdmin(req.session?.user);
    if (!verboseHealth) return res.status(statusCode).json({ ok: health.ok, ready: health.ready });
    return res.status(statusCode).json(health);
  });
}
