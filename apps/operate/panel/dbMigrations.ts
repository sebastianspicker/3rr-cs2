/** Forward-only, transactional SQLite schema migrations and validation. */
import type Database from 'better-sqlite3';
import logger from './utils/logger';

export const SQLITE_UTC_NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

function columnNames(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function requireColumns(
  db: Database.Database,
  table: string,
  requiredColumns: readonly string[],
  version: number
): void {
  const existing = columnNames(db, table);
  const missing = requiredColumns.filter((column) => !existing.has(column));
  if (missing.length > 0) {
    throw new Error(
      `[db] Unsupported SQLite schema for user_version ${version}: ${table} is missing required column(s): ${missing.join(', ')}`
    );
  }
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  if (columnNames(db, table).has(column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[db] Failed to add required column ${table}.${column}: ${message}`);
  }
}

function validateExistingSchema(db: Database.Database, version: number): void {
  if (version >= 1) {
    requireColumns(db, 'users', ['id', 'username', 'password'], version);
    requireColumns(db, 'servers', ['id', 'serverIP', 'serverPort', 'rconPassword'], version);
    requireColumns(db, 'server_access', ['user_id', 'server_id'], version);
  }
  if (version >= 2) requireColumns(db, 'users', ['is_admin'], version);
  if (version >= 3) {
    requireColumns(
      db,
      'workshop_favorites',
      ['id', 'user_id', 'server_id', 'workshop_id', 'name', 'created_at', 'updated_at'],
      version
    );
    requireColumns(
      db,
      'rcon_command_history',
      ['id', 'user_id', 'server_id', 'command', 'use_count', 'created_at', 'last_used_at'],
      version
    );
  }
}

const MIGRATIONS = [
  (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY, serverIP TEXT NOT NULL, serverPort INTEGER NOT NULL,
        rconPassword TEXT NOT NULL, owner_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_access (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, server_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_ip_port ON servers (serverIP, serverPort);
    `);
    const legacyColumns: Array<[string, string]> = [
      ['last_map', 'TEXT'],
      ['last_game_type', 'TEXT'],
      ['last_game_mode', 'TEXT'],
      ['owner_id', 'INTEGER'],
    ];
    for (const [column, definition] of legacyColumns) {
      addColumnIfMissing(db, 'servers', column, definition);
    }
    validateExistingSchema(db, 1);
    db.prepare(
      `UPDATE servers SET owner_id = (SELECT MIN(id) FROM users) WHERE owner_id IS NULL`
    ).run();
    db.exec(`
      INSERT OR IGNORE INTO server_access (user_id, server_id)
        SELECT owner_id, id FROM servers WHERE owner_id IS NOT NULL
    `);
  },
  (db: Database.Database) => {
    validateExistingSchema(db, 1);
    addColumnIfMissing(db, 'users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
    const adminCount = (
      db.prepare(`SELECT COUNT(1) AS count FROM users WHERE is_admin = 1`).get() as {
        count: number;
      }
    ).count;
    if (adminCount === 0) {
      db.prepare(`UPDATE users SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM users)`).run();
    }
  },
  (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workshop_favorites (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        workshop_id TEXT NOT NULL, name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT ${SQLITE_UTC_NOW},
        updated_at TEXT NOT NULL DEFAULT ${SQLITE_UTC_NOW},
        UNIQUE (user_id, server_id, workshop_id)
      );
      CREATE INDEX IF NOT EXISTS idx_workshop_favorites_user_server
        ON workshop_favorites (user_id, server_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS rcon_command_history (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        command TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT ${SQLITE_UTC_NOW},
        last_used_at TEXT NOT NULL DEFAULT ${SQLITE_UTC_NOW},
        UNIQUE (user_id, server_id, command)
      );
      CREATE INDEX IF NOT EXISTS idx_rcon_history_user_server_recent
        ON rcon_command_history (user_id, server_id, last_used_at DESC);
    `);
  },
];

export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error(`[db] Unsupported SQLite schema version: ${String(currentVersion)}`);
  }
  if (currentVersion > MIGRATIONS.length) {
    throw new Error(
      `[db] Unsupported SQLite schema version ${currentVersion}; this panel supports up to ${MIGRATIONS.length}`
    );
  }
  validateExistingSchema(db, currentVersion);
  if (currentVersion >= MIGRATIONS.length) return;
  logger.info({ from: currentVersion, to: MIGRATIONS.length }, '[db] Running schema migrations');
  for (let version = currentVersion; version < MIGRATIONS.length; version += 1) {
    const migration = MIGRATIONS.at(version);
    if (!migration) throw new Error(`[db] Missing migration for schema version ${version + 1}`);
    db.transaction((step: (typeof MIGRATIONS)[number]) => {
      step(db);
      db.pragma(`user_version = ${version + 1}`);
    })(migration);
    logger.info({ version: version + 1 }, '[db] Migration applied');
  }
}
