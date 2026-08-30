/** Express access-control middleware backed by the current session user. */
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import logger from '../infrastructure/logging';

interface SessionUserRow {
  id: number;
  username: string;
  is_admin: number;
}

function rejectUnauthenticated(req: Request, res: Response): void {
  const acceptHeader = req.headers.accept;
  if (acceptHeader?.includes('text/html')) {
    res.redirect('/');
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function createAuthentication(db: Database.Database) {
  const selectSessionUserStmt = db.prepare(`
    SELECT id, username, is_admin
      FROM users
     WHERE id = ?
  `);

  function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
    const sessionUser = req.session.user;
    if (!sessionUser) {
      rejectUnauthenticated(req, res);
      return;
    }

    const user = selectSessionUserStmt.get(sessionUser.id) as SessionUserRow | undefined;
    if (!user) {
      req.session.destroy((err) => {
        if (err) {
          logger.warn({ err, userId: sessionUser.id }, '[auth] stale session destroy failed');
        }
        rejectUnauthenticated(req, res);
      });
      return;
    }

    if (sessionUser.username !== user.username || sessionUser.is_admin !== user.is_admin) {
      req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
    }
    next();
  }

  function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.session?.user?.is_admin) {
      const acceptHeader = req.headers.accept;
      if (acceptHeader?.includes('text/html')) {
        res.redirect('/servers');
        return;
      }
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  }

  return { isAuthenticated, requireAdmin };
}
