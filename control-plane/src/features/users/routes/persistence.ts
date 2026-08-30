/** Shared SQLite and RCON lifecycle operations for user-management routes. */
import type Database from 'better-sqlite3';
import type { RconManager } from '../../../integrations/rcon/rcon';
import type { ServerAccess } from '../../server-access/access';

export function createUserPersistence(
  db: Database.Database,
  rcon: RconManager,
  { selectAccessibleServerSql, selectAccessibleServersSql }: ServerAccess
) {
  const selectAccessibleServersStmt = db.prepare(
    selectAccessibleServersSql('s.id, s.serverIP, s.serverPort', true)
  );
  const selectAccessibleServerStmt = db.prepare(selectAccessibleServerSql('s.id'));
  const insertUserStmt = db.prepare(
    `INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)`
  );
  const insertServerAccessStmt = db.prepare(
    `INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)`
  );
  const selectExclusivelyAccessibleServerIdsStmt = db.prepare(`
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
  const deleteUserStmt = db.prepare(`DELETE FROM users WHERE id = ?`);
  const deleteOrphanServerStmt = db.prepare(`
  DELETE FROM servers
   WHERE id = ?
     AND NOT EXISTS (SELECT 1 FROM server_access WHERE server_id = ?)
`);

  interface AccessibleServer {
    id: number;
    serverIP: string;
    serverPort: number;
  }

  interface UserDeletionResult {
    userDeleted: boolean;
    deletedServerIds: number[];
  }

  const deleteUserAndExclusiveServersTransaction = db.transaction(
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

  function getAccessibleServers(userId: number | undefined): AccessibleServer[] {
    return selectAccessibleServersStmt.all(userId) as AccessibleServer[];
  }

  function findUserPassword(userId: number | undefined): { password: string } | undefined {
    return db.prepare(`SELECT password FROM users WHERE id = ?`).get(userId) as
      | { password: string }
      | undefined;
  }

  function updateUserPassword(userId: number | undefined, password: string): void {
    db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(password, userId);
  }

  function userNameExists(username: string): boolean {
    return Boolean(db.prepare(`SELECT id FROM users WHERE username = ?`).get(username));
  }

  function initialServerAccessIsValid(
    serverId: number | undefined,
    userId: number | undefined
  ): boolean {
    return serverId === undefined || Boolean(selectAccessibleServerStmt.get(serverId, userId));
  }

  function createUser(username: string, password: string, serverId: number | undefined): number {
    return db.transaction(() => {
      const info = insertUserStmt.run(username, password);
      const userId = Number(info.lastInsertRowid);
      if (serverId) {
        insertServerAccessStmt.run(userId, serverId);
      }
      return userId;
    })();
  }

  function deleteUserAndExclusiveServers(userId: number): UserDeletionResult {
    return deleteUserAndExclusiveServersTransaction(userId);
  }

  /** Attempts every orphaned-server cleanup and returns only IDs whose RCON teardown failed. */
  async function cleanupDeletedUserServers(serverIds: number[]): Promise<number[]> {
    const cleanupResults = await Promise.allSettled(
      serverIds.map((serverId) => rcon.removeServer(String(serverId)))
    );
    return cleanupResults.flatMap((result, index) => {
      const serverId = serverIds[index];
      return result.status === 'rejected' && serverId !== undefined ? [serverId] : [];
    });
  }

  function listUsers(): { id: number; username: string; is_admin: number }[] {
    return db.prepare(`SELECT id, username, is_admin FROM users ORDER BY id`).all() as {
      id: number;
      username: string;
      is_admin: number;
    }[];
  }
  return {
    getAccessibleServers,
    findUserPassword,
    updateUserPassword,
    userNameExists,
    initialServerAccessIsValid,
    createUser,
    deleteUserAndExclusiveServers,
    cleanupDeletedUserServers,
    listUsers,
  };
}
export type UserPersistence = ReturnType<typeof createUserPersistence>;
