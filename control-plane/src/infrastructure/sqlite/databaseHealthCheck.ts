/** Minimal liveness probe for the panel SQLite connection. */
import type Database from 'better-sqlite3';

export function createDatabaseHealthCheck(db: Database.Database): () => boolean {
  const healthStmt = db.prepare('SELECT 1');
  return function isDatabaseHealthy(): boolean {
    try {
      healthStmt.get();
      return true;
    } catch {
      return false;
    }
  };
}
