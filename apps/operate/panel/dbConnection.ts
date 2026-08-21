/** Opens the panel SQLite database and enforces connection-level safety prerequisites. */
import path from 'node:path';
import type Database from 'better-sqlite3';
import logger from './utils/logger';
import { openSecureDatabase } from './utils/databaseFile';
import { hasRconSecretKey } from './utils/rconSecret';

export function openPanelDatabase(): Database.Database {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const defaultPath = path.resolve('/home/container/data/3rr.db');
  const fallbackPath = path.resolve(process.cwd(), 'data', '3rr.db');
  const configuredPath = process.env.DB_PATH?.trim();
  const preferredPath = configuredPath ? path.resolve(configuredPath) : defaultPath;

  let db: Database.Database;
  try {
    db = openSecureDatabase(preferredPath, nodeEnv);
  } catch (error) {
    const allowFallback = !configuredPath && nodeEnv !== 'production';
    const message = error instanceof Error ? error.message : String(error);
    if (!allowFallback) {
      logger.error({ path: preferredPath, message }, '[db] Failed to open DB');
      process.exit(1);
    }
    logger.warn(
      { path: preferredPath, fallbackPath, message },
      '[db] Failed to open DB, falling back'
    );
    try {
      db = openSecureDatabase(fallbackPath, nodeEnv);
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      logger.error({ message: fallbackMessage }, '[db] Fallback DB also failed');
      process.exit(1);
    }
  }

  if (nodeEnv === 'production' && !hasRconSecretKey()) {
    throw new Error('RCON_SECRET_KEY must be set in production to protect stored RCON credentials');
  }
  if (!hasRconSecretKey()) {
    logger.warn('[db] RCON_SECRET_KEY is not set - stored RCON passwords will be in plaintext');
  }
  db.exec(`PRAGMA foreign_keys = ON`);
  return db;
}
