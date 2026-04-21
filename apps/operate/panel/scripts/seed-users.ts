/**
 * One-shot script to seed panel users and grant them access to the shared server.
 * Run with: npx tsx scripts/seed-users.ts
 *
 * Required env var:
 *   RCON_PASSWORD=<rcon password for dellbronx.noobs.army:25070>
 *
 * Safe to rerun — existing users and access grants are skipped (INSERT OR IGNORE).
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

const SERVER_IP = 'dellbronx.noobs.army';
const SERVER_PORT = 25070;

const RCON_PASSWORD = process.env.RCON_PASSWORD;
if (!RCON_PASSWORD) {
  console.error('Error: RCON_PASSWORD env var is required.');
  console.error('Usage: RCON_PASSWORD=<password> npx tsx scripts/seed-users.ts');
  process.exit(1);
}

// Usernames to seed — each user gets a random one-time password printed to stdout.
// NEVER hardcode real passwords in source control.
const USERNAMES = [
  'daniel',
  'jonne',
  'tobi',
  'yvi',
  'flo',
  'andi',
  'marian',
  'marc',
  'spicker',
  'pn',
];

function generateRandomPassword(): string {
  return crypto.randomBytes(16).toString('base64url');
}

const USERS = USERNAMES.map((username) => ({
  username,
  password: generateRandomPassword(),
}));

// Mirror the DB path resolution from db.ts
const defaultDbPath = path.resolve('/home/container/data/cspanel.db');
const fallbackDbPath = path.resolve(process.cwd(), 'data', 'cspanel.db');
const dbPathEnv = process.env.DB_PATH?.trim();
const dbPath = dbPathEnv
  ? path.resolve(dbPathEnv)
  : fs.existsSync(defaultDbPath)
    ? defaultDbPath
    : fallbackDbPath;

console.log(`Using DB: ${dbPath}\n`);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function ensureSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY,
      serverIP TEXT NOT NULL,
      serverPort INTEGER NOT NULL,
      rconPassword TEXT NOT NULL,
      owner_id INTEGER,
      last_map TEXT,
      last_game_type TEXT,
      last_game_mode TEXT
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS server_access (
      user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, server_id)
    )
  `);

  const serverColumns = (
    database.prepare(`PRAGMA table_info(servers)`).all() as { name: string }[]
  ).map((row) => row.name);

  if (!serverColumns.includes('last_map')) {
    database.exec(`ALTER TABLE servers ADD COLUMN last_map TEXT`);
  }
  if (!serverColumns.includes('last_game_type')) {
    database.exec(`ALTER TABLE servers ADD COLUMN last_game_type TEXT`);
  }
  if (!serverColumns.includes('last_game_mode')) {
    database.exec(`ALTER TABLE servers ADD COLUMN last_game_mode TEXT`);
  }
  if (!serverColumns.includes('owner_id')) {
    database.exec(`ALTER TABLE servers ADD COLUMN owner_id INTEGER`);
  }

  const duplicateServers = database
    .prepare(
      `
      SELECT serverIP, serverPort, COUNT(*) AS count
      FROM servers
      GROUP BY serverIP, serverPort
      HAVING COUNT(*) > 1
    `
    )
    .all() as Array<{ serverIP: string; serverPort: number; count: number }>;

  if (duplicateServers.length > 0) {
    const duplicateList = duplicateServers
      .map((row) => `${row.serverIP}:${row.serverPort} (count=${row.count})`)
      .join(', ');
    throw new Error(
      `Cannot create idx_servers_ip_port because duplicate server rows already exist: ${duplicateList}`
    );
  }

  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_ip_port ON servers (serverIP, serverPort)`
  );
}

ensureSchema(db);

const insertUser = db.prepare(`INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`);
const getUserId = db.prepare(`SELECT id FROM users WHERE username = ?`);
const insertServer = db.prepare(`
  INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id)
  VALUES (?, ?, ?, NULL)
`);
const getServerId = db.prepare(`SELECT id FROM servers WHERE serverIP = ? AND serverPort = ?`);
const insertAccess = db.prepare(
  `INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)`
);

// 1. Create users — print generated passwords to stdout (one-time)
console.log('Creating users...');
console.log('┌─────────────────────────────────────────────────┐');
for (const { username, password } of USERS) {
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const result = insertUser.run(username, hash);
  if (result.changes === 1) {
    console.log(`│  ${username.padEnd(12)} → ${password}`);
  } else {
    console.log(`│  ${username.padEnd(12)} → (already exists, skipped)`);
  }
}
console.log('└─────────────────────────────────────────────────┘');
console.log('⚠  Save the passwords above — they cannot be retrieved later.\n');

// 2. Ensure server row exists (encrypt RCON password at rest)
console.log(`Ensuring server ${SERVER_IP}:${SERVER_PORT}...`);

// Lazy-import the encrypt function to reuse the project's own encryption logic.
// If RCON_SECRET_KEY is set, the password is stored encrypted; otherwise plaintext.
function encryptForStorage(plain: string): string {
  const key = process.env.RCON_SECRET_KEY?.trim();
  if (!key) return plain;
  // Inline AES-256-GCM to avoid importing the compiled module
  const keyBuf = /^[0-9a-fA-F]{64}$/.test(key)
    ? Buffer.from(key, 'hex')
    : Buffer.from(key, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

insertServer.run(SERVER_IP, SERVER_PORT, encryptForStorage(RCON_PASSWORD));
const serverRow = getServerId.get(SERVER_IP, SERVER_PORT) as { id: number } | undefined;
if (!serverRow) {
  console.error('Failed to find or create server row. Aborting.');
  process.exit(1);
}
console.log(`  server id = ${serverRow.id}`);

// 3. Grant every user access to the server
console.log('\nGranting server access...');
for (const { username } of USERS) {
  const userRow = getUserId.get(username) as { id: number } | undefined;
  if (!userRow) {
    console.warn(`  ${username}: user not found, skipping`);
    continue;
  }
  const result = insertAccess.run(userRow.id, serverRow.id);
  console.log(`  ${username}: ${result.changes === 1 ? 'access granted' : 'already had access'}`);
}

console.log('\nDone.');
db.close();
