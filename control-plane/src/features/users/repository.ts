/** SQLite persistence for user accounts, passwords, and their server-access grants. */
import type Database from 'better-sqlite3';
import { selectAccessibleServerSql, selectAccessibleServersSql } from '../server-access/repository';

export interface AccessibleServer {
  id: number;
  serverIP: string;
  serverPort: number;
}

export interface UserDeletionResult {
  userDeleted: boolean;
  deletedServerIds: number[];
}

export function createUsersRepository(db: Database.Database) {
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
  const selectPasswordStmt = db.prepare(`SELECT password FROM users WHERE id = ?`);
  const updatePasswordStmt = db.prepare(`UPDATE users SET password = ? WHERE id = ?`);
  const selectUserIdByUsernameStmt = db.prepare(`SELECT id FROM users WHERE username = ?`);
  const listUsersStmt = db.prepare(`SELECT id, username, is_admin FROM users ORDER BY id`);

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
    return selectPasswordStmt.get(userId) as { password: string } | undefined;
  }

  function updateUserPassword(userId: number | undefined, password: string): void {
    updatePasswordStmt.run(password, userId);
  }

  function userNameExists(username: string): boolean {
    return Boolean(selectUserIdByUsernameStmt.get(username));
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

  function listUsers(): { id: number; username: string; is_admin: number }[] {
    return listUsersStmt.all() as { id: number; username: string; is_admin: number }[];
  }

  return {
    getAccessibleServers,
    findUserPassword,
    updateUserPassword,
    userNameExists,
    initialServerAccessIsValid,
    createUser,
    deleteUserAndExclusiveServers,
    listUsers,
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
