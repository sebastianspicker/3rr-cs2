/** One-time credential migration and opt-in first-admin bootstrap. */
import type Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import logger from './utils/logger';
import { encryptRconSecret, hasRconSecretKey, isEncryptedRconSecret } from './utils/rconSecret';

export function bootstrapDatabase(db: Database.Database): void {
  encryptStoredRconPasswords(db);
  createInitialAdmin(db);
}

function encryptStoredRconPasswords(db: Database.Database): void {
  if (!hasRconSecretKey()) return;
  const rows = db.prepare(`SELECT id, rconPassword FROM servers`).all() as Array<{
    id: number;
    rconPassword: string;
  }>;
  const update = db.prepare(`UPDATE servers SET rconPassword = ? WHERE id = ?`);
  for (const row of rows) {
    if (typeof row.rconPassword !== 'string' || isEncryptedRconSecret(row.rconPassword)) continue;
    update.run(encryptRconSecret(row.rconPassword), row.id);
  }
}

function createInitialAdmin(db: Database.Database): void {
  const userCount = (db.prepare(`SELECT COUNT(1) AS count FROM users`).get() as { count: number })
    .count;
  if (userCount > 0) {
    logger.info('[db] Users already exist; skipping default user creation');
    return;
  }
  if (process.env.ALLOW_DEFAULT_CREDENTIALS !== 'true') {
    logger.warn(
      '[db] No users in DB and ALLOW_DEFAULT_CREDENTIALS is not "true". Set ALLOW_DEFAULT_CREDENTIALS=true and DEFAULT_USERNAME/DEFAULT_PASSWORD to create the first admin, or add a user by other means.'
    );
    return;
  }

  const username = process.env.DEFAULT_USERNAME?.trim() ?? '';
  const password = process.env.DEFAULT_PASSWORD ?? '';
  if (!username || !password)
    exitWithError(
      '[db] ALLOW_DEFAULT_CREDENTIALS=true requires non-empty DEFAULT_USERNAME and DEFAULT_PASSWORD. DEFAULT_USERNAME must not be empty after trimming whitespace.'
    );
  if (username.length > 255) {
    exitWithError('[db] DEFAULT_USERNAME must be at most 255 characters after trimming whitespace');
  }
  const weakPasswords = new Set([
    'change-me',
    'changeme',
    'password',
    'admin',
    'default',
    '12345678',
    'qwerty',
    'admin123',
  ]);
  if (
    (process.env.NODE_ENV ?? 'development') === 'production' &&
    weakPasswords.has(password.toLowerCase())
  ) {
    exitWithError('[db] DEFAULT_PASSWORD uses a weak placeholder value in production');
  }
  if (password.length < 12) exitWithError('[db] DEFAULT_PASSWORD must be at least 12 characters');

  db.prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)`).run(
    username,
    bcrypt.hashSync(password, 12)
  );
  logger.info('[db] Default user created successfully');
}

function exitWithError(message: string): never {
  logger.error(message);
  process.exit(1);
}
