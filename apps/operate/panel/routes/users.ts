import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import isAuthenticated, { requireAdmin } from '../modules/middleware';

const router = express.Router();

const selectAccessibleServersStmt = better_sqlite_client.prepare(`
  SELECT s.id, s.serverIP, s.serverPort
    FROM servers s
    JOIN server_access sa ON sa.server_id = s.id
   WHERE sa.user_id = ?
   ORDER BY s.id
`);
const selectAccessibleServerStmt = better_sqlite_client.prepare(`
  SELECT s.id
    FROM servers s
    JOIN server_access sa ON sa.server_id = s.id
   WHERE s.id = ? AND sa.user_id = ?
`);
const insertUserStmt = better_sqlite_client.prepare(
  `INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)`
);
const insertServerAccessStmt = better_sqlite_client.prepare(
  `INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (?, ?)`
);

interface AccessibleServer {
  id: number;
  serverIP: string;
  serverPort: number;
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
// GET /settings — change-password page
// ---------------------------------------------------------------------------
router.get('/settings', isAuthenticated, (_req, res) => {
  res.render('settings');
});

// ---------------------------------------------------------------------------
// GET /admin/users — admin user management page
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
router.post('/api/users/delete', isAuthenticated, requireAdmin, (req, res) => {
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

  const info = better_sqlite_client.prepare(`DELETE FROM users WHERE id = ?`).run(userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  logger.info({ deletedUserId: userId, byUserId: req.session.user?.id }, '[users] user deleted');
  return res.status(200).json({ message: 'User deleted' });
});

// ---------------------------------------------------------------------------
// GET /api/users/list  (admin only)
// List all users (id, username, is_admin — no passwords).
// ---------------------------------------------------------------------------
router.get('/api/users/list', isAuthenticated, requireAdmin, (_req, res) => {
  const rows = better_sqlite_client
    .prepare(`SELECT id, username, is_admin FROM users ORDER BY id`)
    .all() as { id: number; username: string; is_admin: number }[];
  return res.status(200).json({ users: rows });
});

export default router;
