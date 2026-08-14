/** Shared SQLite and RCON lifecycle operations for user-management routes. */
import { better_sqlite_client } from '../../db';
import rcon from '../../modules/rcon';
import { selectAccessibleServerSql, selectAccessibleServersSql } from '../../utils/serverAccess';

const selectAccessibleServersStmt = better_sqlite_client.prepare(
  selectAccessibleServersSql('s.id, s.serverIP, s.serverPort', true)
);
const selectAccessibleServerStmt = better_sqlite_client.prepare(selectAccessibleServerSql('s.id'));
const insertUserStmt = better_sqlite_client.prepare(
  `INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)`
);
const insertServerAccessStmt = better_sqlite_client.prepare(
  `INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)`
);
const selectExclusivelyAccessibleServerIdsStmt = better_sqlite_client.prepare(`
  SELECT sa.server_id AS id
    FROM server_access sa
   WHERE sa.user_id = ?
     AND NOT EXISTS (
       SELECT 1
         FROM server_access other
        WHERE other.server_id = sa.server_id
          AND other.user_id <> sa.user_id
     )
   ORDER BY sa.server_id
`);
const deleteUserStmt = better_sqlite_client.prepare(`DELETE FROM users WHERE id = ?`);
const deleteOrphanServerStmt = better_sqlite_client.prepare(`
  DELETE FROM servers
   WHERE id = ?
     AND NOT EXISTS (SELECT 1 FROM server_access WHERE server_id = ?)
`);

export interface AccessibleServer {
  id: number;
  serverIP: string;
  serverPort: number;
}

export interface UserDeletionResult {
  userDeleted: boolean;
  deletedServerIds: number[];
}

const deleteUserAndExclusiveServersTransaction = better_sqlite_client.transaction(
  (userId: number): UserDeletionResult => {
    const exclusiveServers = selectExclusivelyAccessibleServerIdsStmt.all(userId) as Array<{
      id: number;
    }>;
    const userResult = deleteUserStmt.run(userId);
    if (userResult.changes === 0) {
      return { userDeleted: false, deletedServerIds: [] };
    }

    const deletedServerIds: number[] = [];
    for (const { id } of exclusiveServers) {
      const serverResult = deleteOrphanServerStmt.run(id, id);
      if (serverResult.changes > 0) deletedServerIds.push(id);
    }
    return { userDeleted: true, deletedServerIds };
  }
);

export function getAccessibleServers(userId: number | undefined): AccessibleServer[] {
  return selectAccessibleServersStmt.all(userId) as AccessibleServer[];
}

export function findUserPassword(userId: number | undefined): { password: string } | undefined {
  return better_sqlite_client.prepare(`SELECT password FROM users WHERE id = ?`).get(userId) as
    | { password: string }
    | undefined;
}

export function updateUserPassword(userId: number | undefined, password: string): void {
  better_sqlite_client.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(password, userId);
}

export function userNameExists(username: string): boolean {
  return Boolean(
    better_sqlite_client.prepare(`SELECT id FROM users WHERE username = ?`).get(username)
  );
}

export function initialServerAccessIsValid(
  serverId: number | undefined,
  userId: number | undefined
): boolean {
  return serverId === undefined || Boolean(selectAccessibleServerStmt.get(serverId, userId));
}

export function createUser(
  username: string,
  password: string,
  serverId: number | undefined
): number {
  return better_sqlite_client.transaction(() => {
    const info = insertUserStmt.run(username, password);
    const userId = Number(info.lastInsertRowid);
    if (serverId) {
      insertServerAccessStmt.run(userId, serverId);
    }
    return userId;
  })();
}

export function deleteUserAndExclusiveServers(userId: number): UserDeletionResult {
  return deleteUserAndExclusiveServersTransaction(userId);
}

/** Attempts every orphaned-server cleanup and returns only IDs whose RCON teardown failed. */
export async function cleanupDeletedUserServers(serverIds: number[]): Promise<number[]> {
  const cleanupResults = await Promise.allSettled(
    serverIds.map((serverId) => rcon.removeServer(String(serverId)))
  );
  return cleanupResults.flatMap((result, index) => {
    const serverId = serverIds[index];
    return result.status === 'rejected' && serverId !== undefined ? [serverId] : [];
  });
}

export function listUsers(): { id: number; username: string; is_admin: number }[] {
  return better_sqlite_client
    .prepare(`SELECT id, username, is_admin FROM users ORDER BY id`)
    .all() as { id: number; username: string; is_admin: number }[];
}
