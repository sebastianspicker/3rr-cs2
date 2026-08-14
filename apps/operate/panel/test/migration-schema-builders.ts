import type Database from 'better-sqlite3';

export function createVersion1Schema(db: Database.Database, usersSql: string): void {
  db.exec(`
    CREATE TABLE users (${usersSql});
    CREATE TABLE servers (
      id INTEGER PRIMARY KEY,
      serverIP TEXT NOT NULL,
      serverPort INTEGER NOT NULL,
      rconPassword TEXT NOT NULL,
      owner_id INTEGER,
      last_map TEXT,
      last_game_type TEXT,
      last_game_mode TEXT
    );
    CREATE TABLE server_access (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, server_id)
    );
    CREATE UNIQUE INDEX idx_servers_ip_port ON servers (serverIP, serverPort);
    PRAGMA user_version = 1;
  `);
}

export function createPreVersionedInlineSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
    CREATE TABLE servers (
      id INTEGER PRIMARY KEY,
      serverIP TEXT NOT NULL,
      serverPort INTEGER NOT NULL,
      rconPassword TEXT NOT NULL
    );
    CREATE TABLE server_access (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, server_id)
    );
    CREATE UNIQUE INDEX idx_servers_ip_port ON servers (serverIP, serverPort);
  `);
}

export function createVersion2Schema(db: Database.Database): void {
  createVersion1Schema(
    db,
    [
      'id INTEGER PRIMARY KEY',
      'username TEXT NOT NULL UNIQUE',
      'password TEXT NOT NULL',
      'is_admin INTEGER NOT NULL DEFAULT 0',
    ].join(', ')
  );
  db.pragma('user_version = 2');
}

export function createCurrentSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE servers (
      id INTEGER PRIMARY KEY,
      serverIP TEXT NOT NULL,
      serverPort INTEGER NOT NULL,
      rconPassword TEXT NOT NULL,
      owner_id INTEGER,
      last_map TEXT,
      last_game_type TEXT,
      last_game_mode TEXT
    );
    CREATE TABLE server_access (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, server_id)
    );
    CREATE TABLE workshop_favorites (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      workshop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, server_id, workshop_id)
    );
    CREATE TABLE rcon_command_history (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      command TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      UNIQUE (user_id, server_id, command)
    );
    PRAGMA user_version = 3;
  `);
}
