import type { Request, Response } from 'express';

function parseServerId(val: unknown): string | null {
  if (val == null || val === '') return null;
  if (Array.isArray(val)) return null;
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) && val > 0 ? String(val) : null;
  }
  const trimmed = String(val).trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return String(id);
}

function requireServerId(req: Request, res: Response): string | null {
  const sid = parseServerId(req.body?.server_id);
  if (!sid) {
    res.status(400).json({ error: 'Missing or invalid server_id' });
    return null;
  }
  return sid;
}

// Lazy-initialized prepared statement to avoid importing db at module scope,
// which breaks test mocking of the db module.
let checkAccessStmt: { get: (sid: string, userId: number) => unknown } | null = null;

function getCheckAccessStmt() {
  if (!checkAccessStmt) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { better_sqlite_client } = require('../db') as {
      better_sqlite_client: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown } };
    };
    checkAccessStmt = better_sqlite_client.prepare(
      `SELECT 1 FROM server_access WHERE server_id = ? AND user_id = ?`
    );
  }
  return checkAccessStmt;
}

/**
 * Parse + authorize: returns the server_id only if the authenticated user
 * has access to it via the server_access table. Sends 400/403 on failure.
 */
function requireAuthorizedServerId(req: Request, res: Response): string | null {
  const sid = requireServerId(req, res);
  if (!sid) return null; // 400 already sent
  const userId = req.session?.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = getCheckAccessStmt().get(sid, userId);
  if (!row) {
    res.status(403).json({ error: 'Access denied to this server' });
    return null;
  }
  return sid;
}

export { parseServerId, requireServerId, requireAuthorizedServerId };
