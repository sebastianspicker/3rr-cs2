/** Opens the configured SQLite file through a private, stable filesystem path. */
import Database from 'better-sqlite3';
import path from 'node:path';
import { prepareDatabaseLocation, validateDatabaseDirectory } from './databaseDirectory';
import {
  databaseFileIdentity,
  prepareDatabaseFile,
  sameDatabaseFileIdentity,
  validateDatabaseFile,
} from './databaseFileIdentity';

export interface SecureDatabaseOpenOptions {
  /** Test seam for simulating a filesystem replacement between validation and SQLite open. */
  beforeOpen?: (databasePath: string) => void;
}

export function openSecureDatabase(
  filePath: string,
  nodeEnv: string,
  options: SecureDatabaseOpenOptions = {}
): Database.Database {
  const location = prepareDatabaseLocation(filePath, nodeEnv);
  const before = prepareDatabaseFile(location.path, nodeEnv);
  validateExistingDatabaseSidecars(location.path, nodeEnv);
  options.beforeOpen?.(location.path);
  const db = new Database(location.path);
  try {
    const parentAfter = validateDatabaseDirectory(path.dirname(location.path), nodeEnv);
    const after = validateDatabaseFile(location.path, nodeEnv);
    validateExistingDatabaseSidecars(location.path, nodeEnv);
    if (!sameDatabaseFileIdentity(location.parentIdentity, databaseFileIdentity(parentAfter))) {
      throw new Error(`Database parent identity changed while opening: ${location.path}`);
    }
    if (!sameDatabaseFileIdentity(databaseFileIdentity(before), databaseFileIdentity(after))) {
      throw new Error(`Database file identity changed while opening: ${location.path}`);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Rejects pre-existing SQLite sidecars before SQLite can follow or reuse them. */
function validateExistingDatabaseSidecars(databasePath: string, nodeEnv: string): void {
  for (const suffix of ['-journal', '-wal', '-shm']) {
    const sidecarPath = `${databasePath}${suffix}`;
    try {
      validateDatabaseFile(sidecarPath, nodeEnv);
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
