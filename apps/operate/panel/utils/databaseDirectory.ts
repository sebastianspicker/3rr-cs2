/** Resolves and validates the directory that contains the panel database. */
import fs, { type Stats } from 'node:fs';
import path from 'node:path';
import { databaseFileIdentity, type DatabaseFileIdentity } from './databaseFileIdentity';

export interface DatabaseLocation {
  path: string;
  parentIdentity: DatabaseFileIdentity;
}

export function canonicalDatabasePath(filePath: string, nodeEnv: string): string {
  return prepareDatabaseLocation(filePath, nodeEnv).path;
}

/**
 * Resolves a database path to its real parent and records that parent before SQLite opens it.
 *
 * This protects against a different-user path replacement. A process running as the same UID
 * (or root) can always modify files it owns, so that local threat is intentionally excluded.
 */
export function prepareDatabaseLocation(filePath: string, nodeEnv: string): DatabaseLocation {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const canonicalParent = fs.realpathSync(parent);
  const stats = validateDatabaseDirectory(canonicalParent, nodeEnv);
  return {
    path: path.join(canonicalParent, path.basename(filePath)),
    parentIdentity: databaseFileIdentity(stats),
  };
}

/** Revalidates the resolved parent after an operation that may traverse the database path. */
export function validateDatabaseDirectory(directory: string, nodeEnv: string): Stats {
  const stats = fs.lstatSync(directory);
  if (!stats.isDirectory()) {
    throw new Error(`Database parent is not a directory: ${directory}`);
  }
  if (nodeEnv === 'production') validateProductionDirectory(stats, directory);
  return stats;
}

function validateProductionDirectory(stats: Stats, directory: string): void {
  if ((stats.mode & 0o022) !== 0) {
    throw new Error(`Database parent must not be group- or world-writable: ${directory}`);
  }
  const currentUid = process.getuid?.();
  if (currentUid !== undefined && stats.uid !== currentUid && stats.uid !== 0) {
    throw new Error(`Database parent must be owned by the panel user or root: ${directory}`);
  }
}
