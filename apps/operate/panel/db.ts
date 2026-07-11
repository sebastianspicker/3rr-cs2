import logger from './utils/logger';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { encryptRconSecret, hasRconSecretKey, isEncryptedRconSecret } from './utils/rconSecret';

const nodeEnv = process.env.NODE_ENV ?? 'development';
// The default path matches the container volume contract. Local development can
// fall back to ./data when /home/container is not writable and DB_PATH is unset.
const defaultDbPath = path.resolve('/home/container/data/cspanel.db');
const fallbackDbPath = path.resolve(process.cwd(), 'data', 'cspanel.db');
const dbPathEnv = process.env.DB_PATH?.trim();
const preferredDbPath = dbPathEnv ? path.resolve(dbPathEnv) : defaultDbPath;

function openDb(dbFilePath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  return new Database(dbFilePath);
}

let better_sqlite_client: Database.Database;
try {
  better_sqlite_client = openDb(preferredDbPath);
} catch (err: unknown) {
  const allowFallback = !dbPathEnv && nodeEnv !== 'production';
  const message = err instanceof Error ? err.message : String(err);
  if (!allowFallback) {
    logger.error({ path: preferredDbPath, message }, '[db] Failed to open DB');
    process.exit(1);
  }
  logger.warn(
    { path: preferredDbPath, fallbackPath: fallbackDbPath, message },
    '[db] Failed to open DB, falling back'
  );
  try {
    better_sqlite_client = openDb(fallbackDbPath);
  } catch (fallbackErr: unknown) {
    const fallbackMessage =
      fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    logger.error({ message: fallbackMessage }, '[db] Fallback DB also failed');
    process.exit(1);
  }
}

if (nodeEnv === 'production' && !hasRconSecretKey()) {
  throw new Error('RCON_SECRET_KEY must be set in production to protect stored RCON credentials');
}
if (!hasRconSecretKey()) {
  logger.warn('[db] RCON_SECRET_KEY is not set — stored RCON passwords will be in plaintext');
}

// Enable foreign key enforcement (must be per-connection in SQLite)
better_sqlite_client.exec(`PRAGMA foreign_keys = ON`);

// ---------------------------------------------------------------------------
// Versioned migrations
// Each entry runs exactly once, identified by its 1-based index (user_version).
// The current user_version is advanced inside a transaction after each step.
// ---------------------------------------------------------------------------
function columnNames(db: Database.Database, table: string): Set<string> {
  const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

const requireColumns = (
  db: Database.Database,
  table: string,
  requiredColumns: readonly string[],
  version: number
): void => {
  const existing = columnNames(db, table);
  const missing = requiredColumns.filter((column) => !existing.has(column));
  if (missing.length > 0) {
    throw new Error(
      `[db] Unsupported SQLite schema for user_version ${version}: ${table} is missing required column(s): ${missing.join(', ')}`
    );
  }
};

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  if (columnNames(db, table).has(column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[db] Failed to add required column ${table}.${column}: ${message}`);
  }
}

function validateExistingSchema(db: Database.Database, version: number): void {
  if (version >= 1) {
    requireColumns(db, 'users', ['id', 'username', 'password'], version);
    requireColumns(db, 'servers', ['id', 'serverIP', 'serverPort', 'rconPassword'], version);
    requireColumns(db, 'server_access', ['user_id', 'server_id'], version);
  }
  if (version >= 2) {
    requireColumns(db, 'users', ['is_admin'], version);
  }
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
  // 1 — full baseline schema as of v1.0.0.
  //     Uses IF NOT EXISTS / try-catch so it is safe to run on a database that
  //     was already bootstrapped by the pre-migration inline code.
  (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id           INTEGER PRIMARY KEY,
        serverIP     TEXT    NOT NULL,
        serverPort   INTEGER NOT NULL,
        rconPassword TEXT    NOT NULL,
        owner_id     INTEGER
      );
      CREATE TABLE IF NOT EXISTS users (
        id       INTEGER PRIMARY KEY,
        username TEXT    NOT NULL UNIQUE,
        password TEXT    NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_access (
        user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
        server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, server_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_ip_port ON servers (serverIP, serverPort);
    `);

    // Columns that were added incrementally in pre-migration deployments.
    // ALTER TABLE ADD COLUMN is idempotent in practice but SQLite will throw if
    // the column already exists, so wrap each in a try/catch.
    const legacyColumns: Array<[string, string]> = [
      ['last_map', 'TEXT'],
      ['last_game_type', 'TEXT'],
      ['last_game_mode', 'TEXT'],
      ['owner_id', 'INTEGER'],
    ];
    for (const [col, def] of legacyColumns) {
      addColumnIfMissing(db, 'servers', col, def);
    }

    validateExistingSchema(db, 1);

    // Backfill owner_id for rows that were inserted before the column existed.
    db.prepare(
      `UPDATE servers SET owner_id = (SELECT id FROM users LIMIT 1) WHERE owner_id IS NULL`
    ).run();

    // Backfill server_access from owner_id for pre-existing installs (idempotent).
    db.exec(`
      INSERT OR IGNORE INTO server_access (user_id, server_id)
        SELECT owner_id, id FROM servers WHERE owner_id IS NOT NULL
    `);
  },

  // 2 — add is_admin flag to users.
  //     The oldest user (lowest id) is designated admin automatically, matching
  //     the behaviour of the DEFAULT_USERNAME bootstrap path.
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

  // 3 — per-user/per-server operator UX state.
  (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workshop_favorites (
        id          INTEGER PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
        server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        workshop_id TEXT    NOT NULL,
        name        TEXT    NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (user_id, server_id, workshop_id)
      );
      CREATE INDEX IF NOT EXISTS idx_workshop_favorites_user_server
        ON workshop_favorites (user_id, server_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS rcon_command_history (
        id           INTEGER PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
        server_id    INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        command      TEXT    NOT NULL,
        use_count    INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_used_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (user_id, server_id, command)
      );
      CREATE INDEX IF NOT EXISTS idx_rcon_history_user_server_recent
        ON rcon_command_history (user_id, server_id, last_used_at DESC);
    `);
  },
];

const CURRENT_VERSION = MIGRATIONS.length;

function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error(`[db] Unsupported SQLite schema version: ${String(currentVersion)}`);
  }
  if (currentVersion > CURRENT_VERSION) {
    throw new Error(
      `[db] Unsupported SQLite schema version ${currentVersion}; this panel supports up to ${CURRENT_VERSION}`
    );
  }
  validateExistingSchema(db, currentVersion);

  if (currentVersion >= CURRENT_VERSION) return;

  logger.info({ from: currentVersion, to: CURRENT_VERSION }, '[db] Running schema migrations');

  for (let v = currentVersion; v < CURRENT_VERSION; v++) {
    const migration = MIGRATIONS.at(v);
    if (!migration) {
      throw new Error(`[db] Missing migration for schema version ${v + 1}`);
    }
    const migrate = db.transaction((migration: (typeof MIGRATIONS)[number]) => {
      migration(db);
      db.pragma(`user_version = ${v + 1}`);
    });
    migrate(migration);
    logger.info({ version: v + 1 }, '[db] Migration applied');
  }
}

runMigrations(better_sqlite_client);

// Encrypt any existing plaintext RCON passwords when a key is configured.
if (hasRconSecretKey()) {
  const rows = better_sqlite_client.prepare(`SELECT id, rconPassword FROM servers`).all() as {
    id: number;
    rconPassword: string;
  }[];
  const update = better_sqlite_client.prepare(`UPDATE servers SET rconPassword = ? WHERE id = ?`);
  for (const row of rows) {
    if (typeof row.rconPassword !== 'string' || isEncryptedRconSecret(row.rconPassword)) continue;
    const encrypted = encryptRconSecret(row.rconPassword);
    update.run(encrypted, row.id);
  }
}

const envUsername = process.env.DEFAULT_USERNAME;
const envPassword = process.env.DEFAULT_PASSWORD;
const normalizedEnvUsername = typeof envUsername === 'string' ? envUsername.trim() : '';
const envPasswordValue = typeof envPassword === 'string' ? envPassword : '';
const hasEnvCredentials = normalizedEnvUsername.length > 0 && envPasswordValue.length > 0;
const isWeakDefaultPassword = [
  'change-me',
  'changeme',
  'password',
  'admin',
  'default',
  '12345678',
  'qwerty',
  'admin123',
].includes(String(envPassword ?? '').toLowerCase());

const userCount = (
  better_sqlite_client.prepare(`SELECT COUNT(1) AS count FROM users`).get() as { count: number }
).count;
const allowDefaultCredentials = process.env.ALLOW_DEFAULT_CREDENTIALS === 'true';

// First-admin bootstrap is opt-in so redeploying an existing DB never resets
// credentials or creates surprise users from environment variables.
if (userCount > 0) {
  logger.info('[db] Users already exist; skipping default user creation');
} else if (!allowDefaultCredentials) {
  logger.warn(
    '[db] No users in DB and ALLOW_DEFAULT_CREDENTIALS is not "true". Set ALLOW_DEFAULT_CREDENTIALS=true and DEFAULT_USERNAME/DEFAULT_PASSWORD to create the first admin, or add a user by other means.'
  );
} else {
  if (!hasEnvCredentials) {
    logger.error(
      '[db] ALLOW_DEFAULT_CREDENTIALS=true requires non-empty DEFAULT_USERNAME and DEFAULT_PASSWORD. DEFAULT_USERNAME must not be empty after trimming whitespace.'
    );
    process.exit(1);
  }
  if (normalizedEnvUsername.length > 255) {
    logger.error('[db] DEFAULT_USERNAME must be at most 255 characters after trimming whitespace');
    process.exit(1);
  }
  if (nodeEnv === 'production' && isWeakDefaultPassword) {
    logger.error('[db] DEFAULT_PASSWORD uses a weak placeholder value in production');
    process.exit(1);
  }
  if (envPasswordValue.length < 12) {
    logger.error('[db] DEFAULT_PASSWORD must be at least 12 characters');
    process.exit(1);
  }

  const hashedPassword = bcrypt.hashSync(envPasswordValue, 12);
  // First user created is always an admin.
  better_sqlite_client
    .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)`)
    .run(normalizedEnvUsername, hashedPassword);
  logger.info('[db] Default user created successfully');
}

export { better_sqlite_client };
