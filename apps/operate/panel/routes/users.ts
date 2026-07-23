/** Administrator-only user lifecycle routes that protect the final administrator. */
import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import isAuthenticated, { requireAdmin } from '../modules/middleware';
import rcon from '../modules/rcon';
import { selectAccessibleServerSql, selectAccessibleServersSql } from '../utils/serverAccess';

const router = express.Router();

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

interface AccessibleServer {
  id: number;
  serverIP: string;
  serverPort: number;
}

interface UserDeletionResult {
  userDeleted: boolean;
  deletedServerIds: number[];
}

const deleteUserAndExclusiveServers = better_sqlite_client.transaction(
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

function logUserDeletion(userId: number, deletedServerIds: number[], byUserId?: number): void {
  logger.info({ deletedUserId: userId, deletedServerIds, byUserId }, '[users] user deleted');
}

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
});

async function verifyPassword(password: string, passwordHash: string): Promise<boolean | null> {
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt compare error');
    return null;
  }
}

async function hashPassword(password: string): Promise<string | null> {
  try {
    return await bcrypt.hash(password, 12);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt hash error');
    return null;
  }
}

function sendPasswordMatchError(res: express.Response, matches: boolean | null): boolean {
  if (matches === null) {
    res.status(500).json({ error: 'Internal server error' });
    return true;
  }
  if (!matches) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET /settings - change-password page
// ---------------------------------------------------------------------------
router.get('/settings', isAuthenticated, (_req, res) => {
  res.render('settings');
});

// ---------------------------------------------------------------------------
// GET /admin/users - admin user management page
// ---------------------------------------------------------------------------
router.get('/admin/users', isAuthenticated, requireAdmin, (req, res) => {
  const currentUserId = req.session.user?.id;
  const servers = selectAccessibleServersStmt.all(currentUserId) as AccessibleServer[];
  res.render('admin-users', { currentUserId, servers });
});

// ---------------------------------------------------------------------------
// POST /api/users/change-password
// Authenticated user changes their own password.
// Body: { currentPassword: string, newPassword: string }
// ---------------------------------------------------------------------------
router.post('/api/users/change-password', isAuthenticated, async (req, res) => {
  const parseResult = ChangePasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
  }

  const { currentPassword, newPassword } = parseResult.data;
  const userId = req.session.user?.id;

  const row = better_sqlite_client
    .prepare(`SELECT password FROM users WHERE id = ?`)
    .get(userId) as { password: string } | undefined;

  if (!row) {
    return res.status(404).json({ error: 'User not found' });
  }

  const matches = await verifyPassword(currentPassword, row.password);
  if (sendPasswordMatchError(res, matches)) return;

  const hashed = await hashPassword(newPassword);
  if (hashed === null) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  better_sqlite_client.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(hashed, userId);
  logger.info({ userId }, '[users] password changed');
  return res.status(200).json({ message: 'Password updated' });
});

// ---------------------------------------------------------------------------
// POST /api/users/add  (admin only)
// Create a new user.
// Body: { username: string, password: string, serverId?: number }
// ---------------------------------------------------------------------------
const NewUserSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  serverId: z.number().int().positive().optional(),
});

async function hashNewUserPassword(password: string): Promise<string | null> {
  try {
    return await bcrypt.hash(password, 12);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt hash error');
    return null;
  }
}

function initialServerAccessIsValid(serverId: number | undefined, userId: number | undefined) {
  return serverId === undefined || Boolean(selectAccessibleServerStmt.get(serverId, userId));
}

router.post('/api/users/add', isAuthenticated, requireAdmin, async (req, res) => {
  const parseResult = NewUserSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
  }

  const { username: safeUsername, password, serverId } = parseResult.data;
  const currentUserId = req.session.user?.id;

  const existing = better_sqlite_client
    .prepare(`SELECT id FROM users WHERE username = ?`)
    .get(safeUsername);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  if (!initialServerAccessIsValid(serverId, currentUserId)) {
    return res.status(400).json({ error: 'Initial server access is invalid' });
  }

  const hashed = await hashNewUserPassword(password);
  if (!hashed) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  const createUser = better_sqlite_client.transaction(() => {
    const info = insertUserStmt.run(safeUsername, hashed);
    const userId = Number(info.lastInsertRowid);
    if (serverId) {
      insertServerAccessStmt.run(userId, serverId);
    }
    return userId;
  });
  const newUserId = createUser();
  logger.info({ username: safeUsername, userId: newUserId, serverId }, '[users] user added');
  return res.status(201).json({ message: 'User created' });
});

// ---------------------------------------------------------------------------
// POST /api/users/delete  (admin only)
// Delete a user by id. Cannot delete yourself.
// Body: { userId: number }
// ---------------------------------------------------------------------------
router.post('/api/users/delete', isAuthenticated, requireAdmin, async (req, res) => {
  const schema = z.object({
    userId: z.number().int().positive(),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const { userId } = parseResult.data;

  if (userId === req.session.user?.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  let deletion: UserDeletionResult;
  try {
    deletion = deleteUserAndExclusiveServers(userId);
  } catch (err) {
    logger.error({ err, userId }, '[users] user deletion transaction failed');
    return res.status(500).json({ error: 'Failed to delete user' });
  }

  if (!deletion.userDeleted) {
    return res.status(404).json({ error: 'User not found' });
  }

  logUserDeletion(userId, deletion.deletedServerIds, req.session.user?.id);

  const failedServerIds = await cleanupDeletedUserServers(deletion.deletedServerIds);
  if (failedServerIds.length > 0) {
    logger.error(
      { deletedUserId: userId, failedServerIds },
      '[users] deleted orphan servers but RCON cleanup failed'
    );
    return res.status(500).json({
      error: 'User deleted, but RCON cleanup failed',
      user_deleted: true,
      deleted_server_ids: deletion.deletedServerIds,
      rcon_cleanup: 'failed',
      failed_server_ids: failedServerIds,
    });
  }

  return res.status(200).json({
    message: 'User deleted',
    user_deleted: true,
    deleted_server_ids: deletion.deletedServerIds,
    rcon_cleanup: deletion.deletedServerIds.length > 0 ? 'completed' : 'not_needed',
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/list  (admin only)
// List all users (id, username, is_admin - no passwords).
// ---------------------------------------------------------------------------
router.get('/api/users/list', isAuthenticated, requireAdmin, (_req, res) => {
  const rows = better_sqlite_client
    .prepare(`SELECT id, username, is_admin FROM users ORDER BY id`)
    .all() as { id: number; username: string; is_admin: number }[];
  return res.status(200).json({ users: rows });
});

export default router;
