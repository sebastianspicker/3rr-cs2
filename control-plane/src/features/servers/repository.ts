/** SQLite persistence for server inventory, access grants, and per-server requested setup. */
import type Database from 'better-sqlite3';
import { selectAccessibleServerSql, selectAccessibleServersSql } from '../server-access/repository';

export interface ServerRow {
  id: number;
  serverIP: string;
  serverPort: number;
}

export interface ServerFullRow extends ServerRow {
  rconPassword: string;
}

export interface ManageServerRow extends ServerRow {
  requested_game_type?: string;
  requested_game_mode?: string;
  requested_map?: string;
}

export type PersistServerResult = { serverId: number } | { serverId: null; maximumReached: true };

export function createServersRepository(db: Database.Database) {
  // Add / share
  const insertServerStmt = db.prepare(
    `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?)`
  );
  const insertServerAccessStmt = db.prepare(
    `INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)`
  );
  const updateServerPasswordStmt = db.prepare(`UPDATE servers SET rconPassword = ? WHERE id = ?`);
  const selectServerByIpPortStmt = db.prepare(
    `SELECT id, rconPassword FROM servers WHERE serverIP = ? AND serverPort = ?`
  );
  const countServersByOwnerStmt = db.prepare(
    `SELECT COUNT(*) AS count FROM server_access WHERE user_id = ?`
  );
  const selectServerAccessStmt = db.prepare(
    `SELECT 1 FROM server_access WHERE user_id = ? AND server_id = ?`
  );

  // Lifecycle (reconnect / delete)
  const selectServerFullStmt = db.prepare(
    selectAccessibleServerSql('s.id, s.serverIP, s.serverPort, s.rconPassword')
  );
  const deleteServerAccessStmt = db.prepare(
    'DELETE FROM server_access WHERE server_id = ? AND user_id = ?'
  );
  const deleteOrphanServerStmt = db.prepare(
    'DELETE FROM servers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM server_access WHERE server_id = ?)'
  );

  // Status
  const selectAccessibleServerIdStmt = db.prepare(selectAccessibleServerSql('s.id'));
  const selectAllAccessibleServersStmt = db.prepare(
    selectAccessibleServersSql('s.id, s.serverIP, s.serverPort')
  );

  // Manage view
  const selectManageStmt = db.prepare(
    selectAccessibleServerSql(`s.id,
    s.serverIP,
    s.serverPort,
    s.last_game_type AS requested_game_type,
    s.last_game_mode AS requested_game_mode,
    s.last_map AS requested_map`)
  );

  function findServerByIpPort(
    serverIP: string,
    serverPort: number
  ): { id: number; rconPassword: string } | undefined {
    return selectServerByIpPortStmt.get(serverIP, serverPort) as
      | { id: number; rconPassword: string }
      | undefined;
  }

  function ownerCannotAddServer(ownerId: number, existingId: number | undefined): boolean {
    if (existingId !== undefined && selectServerAccessStmt.get(ownerId, existingId)) return false;
    const { count } = countServersByOwnerStmt.get(ownerId) as { count: number };
    return count >= 50;
  }

  function saveServerRecord(
    serverIP: string,
    serverPort: number,
    encryptedPassword: string,
    ownerId: number,
    existingId: number | undefined
  ): number | null {
    if (existingId !== undefined) {
      updateServerPasswordStmt.run(encryptedPassword, existingId);
      return existingId;
    }
    const insertResult = insertServerStmt.run(serverIP, serverPort, encryptedPassword, ownerId);
    const inserted = selectServerByIpPortStmt.get(serverIP, serverPort) as
      | { id: number }
      | undefined;
    if (insertResult.changes === 0 && inserted) {
      updateServerPasswordStmt.run(encryptedPassword, inserted.id);
    }
    return inserted?.id ?? null;
  }

  const persistServerAndAccessTxn = db.transaction(
    (
      serverIP: string,
      serverPort: number,
      encryptedPassword: string,
      ownerId: number
    ): PersistServerResult => {
      const existing = selectServerByIpPortStmt.get(serverIP, serverPort) as
        | { id: number }
        | undefined;
      if (ownerCannotAddServer(ownerId, existing?.id))
        return { serverId: null, maximumReached: true };
      const serverId = saveServerRecord(
        serverIP,
        serverPort,
        encryptedPassword,
        ownerId,
        existing?.id
      );
      if (serverId === null) throw new Error('Failed to add the server');
      insertServerAccessStmt.run(ownerId, serverId);
      return { serverId };
    }
  );

  function persistServerAndAccess(
    serverIP: string,
    serverPort: number,
    encryptedPassword: string,
    ownerId: number
  ): PersistServerResult {
    return persistServerAndAccessTxn(serverIP, serverPort, encryptedPassword, ownerId);
  }

  function findAccessibleServerFull(
    serverId: string,
    userId: number | undefined
  ): ServerFullRow | undefined {
    return selectServerFullStmt.get(serverId, userId) as ServerFullRow | undefined;
  }

  const deleteServerAndAccessTxn = db.transaction(
    (serverId: string, ownerId: number): { found: boolean; serverDeleted: boolean } => {
      const accessResult = deleteServerAccessStmt.run(serverId, ownerId);
      if (accessResult.changes === 0) return { found: false, serverDeleted: false };
      const orphanResult = deleteOrphanServerStmt.run(serverId, serverId);
      return { found: true, serverDeleted: orphanResult.changes > 0 };
    }
  );

  function deleteServerAndAccess(
    serverId: string,
    ownerId: number
  ): { found: boolean; serverDeleted: boolean } {
    return deleteServerAndAccessTxn(serverId, ownerId);
  }

  function findAccessibleServerId(
    serverId: string,
    userId: number | undefined
  ): { id: number } | undefined {
    return selectAccessibleServerIdStmt.get(serverId, userId) as { id: number } | undefined;
  }

  function listAccessibleServers(userId: number | undefined): ServerRow[] {
    return selectAllAccessibleServersStmt.all(userId) as ServerRow[];
  }

  function findAccessibleServerForManage(
    serverId: string,
    userId: number | undefined
  ): ManageServerRow | undefined {
    return selectManageStmt.get(serverId, userId) as ManageServerRow | undefined;
  }

  return {
    findServerByIpPort,
    ownerCannotAddServer,
    persistServerAndAccess,
    findAccessibleServerFull,
    deleteServerAndAccess,
    findAccessibleServerId,
    listAccessibleServers,
    findAccessibleServerForManage,
  };
}

export type ServersRepository = ReturnType<typeof createServersRepository>;
