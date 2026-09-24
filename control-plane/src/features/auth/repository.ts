/** SQLite persistence for login credential lookup and session-user revalidation. */
import type Database from 'better-sqlite3';

export interface AuthUserRow {
  id: number;
  username: string;
  password: string;
  is_admin: number;
}

export interface SessionUserRow {
  id: number;
  username: string;
  is_admin: number;
}

export function createAuthRepository(db: Database.Database) {
  const findByUsernameStmt = db.prepare(
    'SELECT id, username, password, is_admin FROM users WHERE username = ?'
  );
  const findSessionUserStmt = db.prepare(`
    SELECT id, username, is_admin
      FROM users
     WHERE id = ?
  `);

  function findByUsername(username: string): AuthUserRow | undefined {
    return findByUsernameStmt.get(username) as AuthUserRow | undefined;
  }

  function findSessionUser(id: number): SessionUserRow | undefined {
    return findSessionUserStmt.get(id) as SessionUserRow | undefined;
  }

  return { findByUsername, findSessionUser };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
