import { better_sqlite_client } from '../db';

export interface RconHistoryRow {
  id: number;
  command: string;
  use_count: number;
  last_used_at: string;
}

const HISTORY_LIMIT = 50;

const upsertHistoryStmt = better_sqlite_client.prepare(`
  INSERT INTO rcon_command_history (user_id, server_id, command, use_count, created_at, last_used_at)
  VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(user_id, server_id, command) DO UPDATE SET
    use_count = use_count + 1,
    last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

const pruneHistoryStmt = better_sqlite_client.prepare(`
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

const listHistoryStmt = better_sqlite_client.prepare(`
  SELECT id, command, use_count, last_used_at
    FROM rcon_command_history
   WHERE user_id = ?
     AND server_id = ?
   ORDER BY last_used_at DESC, id DESC
   LIMIT ${HISTORY_LIMIT}
`);

const clearHistoryStmt = better_sqlite_client.prepare(`
  DELETE FROM rcon_command_history
   WHERE user_id = ?
     AND server_id = ?
`);

export function recordRconCommand(userId: number, serverId: string, command: string): void {
  const normalized = command.trim();
  if (!normalized) return;
  const txn = better_sqlite_client.transaction(() => {
    upsertHistoryStmt.run(userId, serverId, normalized);
    pruneHistoryStmt.run(userId, serverId, userId, serverId);
  });
  txn();
}

export function listRconHistory(userId: number, serverId: string): RconHistoryRow[] {
  return listHistoryStmt.all(userId, serverId) as RconHistoryRow[];
}

export function clearRconHistory(userId: number, serverId: string): number {
  return clearHistoryStmt.run(userId, serverId).changes;
}
