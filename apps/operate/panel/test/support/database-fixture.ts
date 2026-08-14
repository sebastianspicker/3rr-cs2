/** Shared SQLite row builders for route integration fixtures. */
import type Database from 'better-sqlite3';

export function insertLoopbackTestServer(db: Database.Database, serverPort: number): number {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('127.0.0.1', ?, 'test-rcon', 1)`
    )
    .run(serverPort);
  return Number(result.lastInsertRowid);
}

export function grantTestServerAccess(db: Database.Database, serverId: number, userId = 1): void {
  db.prepare(`INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
    userId,
    serverId
  );
}
