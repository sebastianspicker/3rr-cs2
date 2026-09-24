/** SQLite-backed RCON server store: persisted credentials and startup server inventory. */
import type Database from 'better-sqlite3';

export interface RconServerInfo {
  id: number;
  serverIP: string;
  serverPort: number;
}

export function createSqliteRconServerStore(db: Database.Database) {
  const selectPassword = db.prepare('SELECT rconPassword FROM servers WHERE id = ?');
  const selectServers = db.prepare('SELECT id, serverIP, serverPort FROM servers');

  function getRconPassword(serverId: number): string | null {
    const row = selectPassword.get(serverId) as { rconPassword: string } | undefined;
    return row?.rconPassword ?? null;
  }

  function listRconServers(): RconServerInfo[] {
    return selectServers.all() as RconServerInfo[];
  }

  return { getRconPassword, listRconServers };
}

export type RconServerStore = ReturnType<typeof createSqliteRconServerStore>;
