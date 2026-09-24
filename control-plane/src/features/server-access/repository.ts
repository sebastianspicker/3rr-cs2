/** SQLite persistence backing per-user server-access checks and lookups. */
import type Database from 'better-sqlite3';

function accessibleServerSelect(
  columns: string,
  predicate: 'sa.user_id = ?' | 's.id = ? AND sa.user_id = ?',
  orderById = false
): string {
  return `
    SELECT ${columns}
      FROM servers s
      JOIN server_access sa ON sa.server_id = s.id
     WHERE ${predicate}${orderById ? '\n     ORDER BY s.id' : ''}
  `;
}

/** Builds the shared access-controlled server lookup used by authenticated routes. */
export function selectAccessibleServerSql(columns: string): string {
  return accessibleServerSelect(columns, 's.id = ? AND sa.user_id = ?');
}

/** Builds the shared access-controlled server list used by authenticated routes. */
export function selectAccessibleServersSql(columns: string, orderById = false): string {
  return accessibleServerSelect(columns, 'sa.user_id = ?', orderById);
}

export function createServerAccessRepository(db: Database.Database) {
  const checkAccessStmt = db.prepare(
    `SELECT 1 FROM server_access WHERE server_id = ? AND user_id = ?`
  );

  function hasAccess(serverId: string, userId: number): boolean {
    return Boolean(checkAccessStmt.get(serverId, userId));
  }

  return { hasAccess };
}

export type ServerAccessRepository = ReturnType<typeof createServerAccessRepository>;
