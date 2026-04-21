import logger from './utils/logger';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { encryptRconSecret, hasRconSecretKey, isEncryptedRconSecret } from './utils/rconSecret';

const nodeEnv = process.env.NODE_ENV || 'development';
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

better_sqlite_client.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY,
    serverIP TEXT NOT NULL,
    serverPort INTEGER NOT NULL,
    rconPassword TEXT NOT NULL,
    owner_id INTEGER
  )
`);

better_sqlite_client.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )
`);

// Many-to-many access table: one server can be shared across multiple users.
better_sqlite_client.exec(`
  CREATE TABLE IF NOT EXISTS server_access (
    user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, server_id)
  )
`);

// Migration: columns added after initial schema deployment.
{
  const cols = (
    better_sqlite_client.prepare(`PRAGMA table_info(servers)`).all() as { name: string }[]
  ).map((row) => row.name);

  if (!cols.includes('last_map')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_map TEXT;`);
  }
  if (!cols.includes('last_game_type')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_game_type TEXT;`);
  }
  if (!cols.includes('last_game_mode')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_game_mode TEXT;`);
  }
  if (!cols.includes('owner_id')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN owner_id INTEGER;`);
    better_sqlite_client
      .prepare(
        `UPDATE servers SET owner_id = (SELECT id FROM users LIMIT 1) WHERE owner_id IS NULL`
      )
      .run();
  }
}

// Migration: prevent duplicate server entries (same IP+port)
better_sqlite_client.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_ip_port ON servers (serverIP, serverPort)`
);

// Migration: backfill server_access from owner_id for pre-existing installs.
better_sqlite_client.exec(`
  INSERT OR IGNORE INTO server_access (user_id, server_id)
  SELECT owner_id, id FROM servers WHERE owner_id IS NOT NULL
`);

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
const hasEnvCredentials = Boolean(envUsername && envPassword);
const isWeakDefaultPassword = [
  'change-me',
  'changeme',
  'password',
  'admin',
  'default',
  '12345678',
  'qwerty',
  'admin123',
].includes(String(envPassword || '').toLowerCase());

const userCount = (
  better_sqlite_client.prepare(`SELECT COUNT(1) AS count FROM users`).get() as { count: number }
).count;
const allowDefaultCredentials = process.env.ALLOW_DEFAULT_CREDENTIALS === 'true';

if (userCount > 0) {
  logger.info('[db] Users already exist; skipping default user creation');
} else if (!allowDefaultCredentials) {
  logger.warn(
    '[db] No users in DB and ALLOW_DEFAULT_CREDENTIALS is not "true". Set ALLOW_DEFAULT_CREDENTIALS=true and DEFAULT_USERNAME/DEFAULT_PASSWORD to create the first admin, or add a user by other means.'
  );
} else {
  if (!hasEnvCredentials) {
    logger.error(
      '[db] ALLOW_DEFAULT_CREDENTIALS=true requires DEFAULT_USERNAME and DEFAULT_PASSWORD. Refusing to create unknown/random credentials.'
    );
    process.exit(1);
  }
  if (nodeEnv === 'production' && isWeakDefaultPassword) {
    logger.error('[db] DEFAULT_PASSWORD uses a weak placeholder value in production');
    process.exit(1);
  }
  if (String(envPassword).length < 12) {
    logger.error('[db] DEFAULT_PASSWORD must be at least 12 characters');
    process.exit(1);
  }

  const safeUsername = String(envUsername).slice(0, 255);
  const hashedPassword = bcrypt.hashSync(envPassword!, 12);
  better_sqlite_client
    .prepare(
      `
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `
    )
    .run(safeUsername, hashedPassword);
  logger.info('[db] Default user created successfully');
}

export { better_sqlite_client };
