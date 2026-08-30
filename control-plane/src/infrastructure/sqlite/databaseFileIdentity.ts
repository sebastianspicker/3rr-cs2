/** Creates and validates the SQLite file without following path links. */
import fs, { type Stats } from 'node:fs';

export interface DatabaseFileIdentity {
  dev: number;
  ino: number;
}

export function databaseFileIdentity(stats: Stats): DatabaseFileIdentity {
  return { dev: stats.dev, ino: stats.ino };
}

export function sameDatabaseFileIdentity(
  expected: DatabaseFileIdentity,
  actual: DatabaseFileIdentity
): boolean {
  return expected.dev === actual.dev && expected.ino === actual.ino;
}

export function prepareDatabaseFile(filePath: string, nodeEnv: string): Stats {
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  try {
    const descriptor = fs.openSync(
      filePath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR | noFollow,
      0o600
    );
    fs.closeSync(descriptor);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  return validateDatabaseFile(filePath, nodeEnv);
}

export function validateDatabaseFile(filePath: string, nodeEnv: string): Stats {
  let stats = fs.lstatSync(filePath);
  validateFileShape(stats, filePath);
  if (nodeEnv === 'production') stats = hardenProductionFile(filePath, stats);
  return stats;
}

function validateFileShape(stats: Stats, filePath: string): void {
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Database path must be a regular file, not a link: ${filePath}`);
  }
  if (stats.nlink !== 1) {
    throw new Error(`Database file must have exactly one hard link: ${filePath}`);
  }
}

function hardenProductionFile(filePath: string, initialStats: Stats): Stats {
  validateProductionOwner(initialStats, filePath);
  if ((initialStats.mode & 0o077) === 0) return initialStats;

  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const nonBlocking = fs.constants.O_NONBLOCK ?? 0;
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow | nonBlocking);
  try {
    const descriptorStats = fs.fstatSync(descriptor);
    validateFileShape(descriptorStats, filePath);
    validateProductionOwner(descriptorStats, filePath);
    fs.fchmodSync(descriptor, 0o600);
    const hardenedStats = fs.fstatSync(descriptor);
    validateFileShape(hardenedStats, filePath);
    validateProductionOwner(hardenedStats, filePath);
    if ((hardenedStats.mode & 0o077) !== 0) {
      throw new Error(`Database file must not be accessible by group or other users: ${filePath}`);
    }
    const pathStats = fs.lstatSync(filePath);
    validateFileShape(pathStats, filePath);
    if (
      !sameDatabaseFileIdentity(
        databaseFileIdentity(descriptorStats),
        databaseFileIdentity(pathStats)
      )
    ) {
      throw new Error(`Database file identity changed while hardening: ${filePath}`);
    }
    return pathStats;
  } finally {
    fs.closeSync(descriptor);
  }
}

function validateProductionOwner(stats: Stats, filePath: string): void {
  const currentUid = process.getuid?.();
  if (currentUid !== undefined && stats.uid !== currentUid && stats.uid !== 0) {
    throw new Error(`Database file must be owned by the panel user or root: ${filePath}`);
  }
}
