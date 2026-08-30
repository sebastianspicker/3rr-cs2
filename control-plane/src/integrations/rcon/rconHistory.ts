/** Bounded per-server command history for RCON convenience without unbounded retention. */
import type Database from 'better-sqlite3';
import { SQLITE_UTC_NOW } from '../../infrastructure/sqlite/index';

export interface RconHistoryRow {
  id: number;
  command: string;
  use_count: number;
  last_used_at: string;
}

const HISTORY_LIMIT = 50;

export function createRconHistoryRepository(db: Database.Database) {
  const upsertHistoryStmt = db.prepare(`
  INSERT INTO rcon_command_history (user_id, server_id, command, use_count, created_at, last_used_at)
  VALUES (?, ?, ?, 1, ${SQLITE_UTC_NOW}, ${SQLITE_UTC_NOW})
  ON CONFLICT(user_id, server_id, command) DO UPDATE SET
    use_count = use_count + 1,
    last_used_at = ${SQLITE_UTC_NOW}
`);

  const pruneHistoryStmt = db.prepare(`
  DELETE FROM rcon_command_history
   WHERE user_id = ?
     AND server_id = ?
     AND id NOT IN (
       SELECT id
         FROM rcon_command_history
        WHERE user_id = ?
          AND server_id = ?
        ORDER BY last_used_at DESC, id DESC
        LIMIT ${HISTORY_LIMIT}
     )
`);

  const listHistoryStmt = db.prepare(`
  SELECT id, command, use_count, last_used_at
    FROM rcon_command_history
   WHERE user_id = ?
     AND server_id = ?
   ORDER BY last_used_at DESC, id DESC
   LIMIT ${HISTORY_LIMIT}
`);

  const clearHistoryStmt = db.prepare(`
  DELETE FROM rcon_command_history
   WHERE user_id = ?
     AND server_id = ?
`);

  function recordRconCommand(userId: number, serverId: string, command: string): void {
    const normalized = command.trim();
    if (!normalized) return;
    const txn = db.transaction(() => {
      upsertHistoryStmt.run(userId, serverId, normalized);
      pruneHistoryStmt.run(userId, serverId, userId, serverId);
    });
    txn();
  }

  function listRconHistory(userId: number, serverId: string): RconHistoryRow[] {
    return listHistoryStmt.all(userId, serverId) as RconHistoryRow[];
  }

  function clearRconHistory(userId: number, serverId: string): number {
    return clearHistoryStmt.run(userId, serverId).changes;
  }
  return { recordRconCommand, listRconHistory, clearRconHistory };
}

export type RconHistoryRepository = ReturnType<typeof createRconHistoryRepository>;
