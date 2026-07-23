/** Resolves a requested server only after validating ownership or administrator access. */
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { better_sqlite_client } from '../db';
import { parseServerId } from './parseServerId';

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
function selectAccessibleServerSql(columns: string): string {
  return accessibleServerSelect(columns, 's.id = ? AND sa.user_id = ?');
}

/** Builds the shared access-controlled server list used by authenticated routes. */
function selectAccessibleServersSql(columns: string, orderById = false): string {
  return accessibleServerSelect(columns, 'sa.user_id = ?', orderById);
}

function requireServerId(req: Request, res: Response): string | null {
  const sid = parseServerId(req.body?.server_id);
  if (!sid) {
    res.status(400).json({ error: 'Missing or invalid server_id' });
    return null;
  }
  return sid;
}

/** Returns a session user identifier only when it is safe to use in database queries. */
function authenticatedUserId(req: Request): number | null {
  const userId = req.session?.user?.id;
  return typeof userId === 'number' && Number.isSafeInteger(userId) ? userId : null;
}

let checkAccessStmt: Database.Statement<[string, number]>;

function getCheckAccessStmt(): Database.Statement<[string, number]> {
  if (!checkAccessStmt) {
    checkAccessStmt = better_sqlite_client.prepare(
      `SELECT 1 FROM server_access WHERE server_id = ? AND user_id = ?`
    );
  }
  return checkAccessStmt;
}

function hasAuthorizedServerAccess(req: Request, res: Response, sid: string): boolean {
  const userId = req.session?.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  const row = getCheckAccessStmt().get(sid, userId);
  if (!row) {
    res.status(403).json({ error: 'Access denied to this server' });
    return false;
  }
  return true;
}

function requireAuthorizedServerId(req: Request, res: Response): string | null {
  const sid = requireServerId(req, res);
  if (!sid) return null;
  if (!hasAuthorizedServerAccess(req, res, sid)) return null;
  return sid;
}

function requireAuthorizedServerIdParam(req: Request, res: Response): string | null {
  const sid = parseServerId(req.params.server_id);
  if (!sid) {
    res.status(404).json({ error: 'Server not found' });
    return null;
  }
  if (!hasAuthorizedServerAccess(req, res, sid)) return null;
  return sid;
}

function renderManageResponse(res: Response): void {
  res.render('manage');
}

export {
  authenticatedUserId,
  renderManageResponse,
  requireServerId,
  requireAuthorizedServerId,
  requireAuthorizedServerIdParam,
  selectAccessibleServerSql,
  selectAccessibleServersSql,
};
