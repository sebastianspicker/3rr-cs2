import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { better_sqlite_client } from '../db';
import { parseServerId } from './parseServerId';

function requireServerId(req: Request, res: Response): string | null {
  const sid = parseServerId(req.body?.server_id);
  if (!sid) {
    res.status(400).json({ error: 'Missing or invalid server_id' });
    return null;
  }
  return sid;
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
  renderManageResponse,
  requireServerId,
  requireAuthorizedServerId,
  requireAuthorizedServerIdParam,
};
