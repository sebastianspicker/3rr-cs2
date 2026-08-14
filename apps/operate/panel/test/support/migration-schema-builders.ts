/** Builds historical SQLite fixtures used to prove each supported migration boundary. */
import type Database from 'better-sqlite3';

const CURRENT_USER_COLUMNS = [
  'id INTEGER PRIMARY KEY',
  'username TEXT NOT NULL UNIQUE',
  'password TEXT NOT NULL',
  'is_admin INTEGER NOT NULL DEFAULT 0',
].join(', ');

const USER_REFERENCE_COLUMN = 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE';
const SERVER_REFERENCE_COLUMN =
  'server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE';

function operatorStateTableSql(
  tableName: string,
  valueColumns: string,
  updatedColumn: string,
  uniqueColumn: string
): string {
  return `
    CREATE TABLE ${tableName} (
      id INTEGER PRIMARY KEY,
      ${USER_REFERENCE_COLUMN},
      ${SERVER_REFERENCE_COLUMN},
      ${valueColumns},
      created_at TEXT NOT NULL,
      ${updatedColumn} TEXT NOT NULL,
      UNIQUE (user_id, server_id, ${uniqueColumn})
    );
  `;
}

function coreSchemaSql(usersSql: string, includeServerState: boolean): string {
  const serverStateColumns = includeServerState
    ? `,
      owner_id INTEGER,
      last_map TEXT,
      last_game_type TEXT,
      last_game_mode TEXT`
    : '';
  return `
    CREATE TABLE users (${usersSql});
    CREATE TABLE servers (
      id INTEGER PRIMARY KEY,
      serverIP TEXT NOT NULL,
      serverPort INTEGER NOT NULL,
      rconPassword TEXT NOT NULL${serverStateColumns}
    );
    CREATE TABLE server_access (
      ${USER_REFERENCE_COLUMN},
      ${SERVER_REFERENCE_COLUMN},
      PRIMARY KEY (user_id, server_id)
    );
    CREATE UNIQUE INDEX idx_servers_ip_port ON servers (serverIP, serverPort);
  `;
}

export function createVersion1Schema(db: Database.Database, usersSql: string): void {
  db.exec(`${coreSchemaSql(usersSql, true)}
    PRAGMA user_version = 1;
  `);
}

export function createPreVersionedInlineSchema(db: Database.Database): void {
  db.exec(
    coreSchemaSql(
      'id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL',
      false
    )
  );
}

export function createVersion2Schema(db: Database.Database): void {
  createVersion1Schema(db, CURRENT_USER_COLUMNS);
  db.pragma('user_version = 2');
}

export function createCurrentSchema(db: Database.Database): void {
  db.exec(`${coreSchemaSql(CURRENT_USER_COLUMNS, true)}${operatorStateTableSql(
    'workshop_favorites',
    'workshop_id TEXT NOT NULL, name TEXT NOT NULL',
    'updated_at',
    'workshop_id'
  )}${operatorStateTableSql(
    'rcon_command_history',
    'command TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 1',
    'last_used_at',
    'command'
  )}
    PRAGMA user_version = 3;
  `);
}
