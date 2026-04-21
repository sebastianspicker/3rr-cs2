import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import isAuthenticated from '../modules/middleware';

const router = express.Router();

/** Require the requesting user to have is_admin = 1. */
function isAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!req.session?.user?.is_admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// GET /settings — change-password page
// ---------------------------------------------------------------------------
router.get('/settings', isAuthenticated, (req, res) => {
  res.render('settings');
});

// ---------------------------------------------------------------------------
// GET /admin/users — admin user management page
// ---------------------------------------------------------------------------
router.get('/admin/users', isAuthenticated, isAdmin, (req, res) => {
  res.render('admin-users', { currentUserId: req.session.user!.id });
});

// ---------------------------------------------------------------------------
// POST /api/users/change-password
// Authenticated user changes their own password.
// Body: { currentPassword: string, newPassword: string }
// ---------------------------------------------------------------------------
router.post('/api/users/change-password', isAuthenticated, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12, 'New password must be at least 12 characters'),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
  }

  const { currentPassword, newPassword } = parseResult.data;
  const userId = req.session.user!.id;

  const row = better_sqlite_client
    .prepare(`SELECT password FROM users WHERE id = ?`)
    .get(userId) as { password: string } | undefined;

  if (!row) {
    return res.status(404).json({ error: 'User not found' });
  }

  let matches = false;
  try {
    matches = await bcrypt.compare(currentPassword, row.password);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt compare error');
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!matches) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  let hashed: string;
  try {
    hashed = await bcrypt.hash(newPassword, 12);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt hash error');
    return res.status(500).json({ error: 'Internal server error' });
  }

  better_sqlite_client.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(hashed, userId);
  logger.info({ userId }, '[users] password changed');
  return res.status(200).json({ message: 'Password updated' });
});

// ---------------------------------------------------------------------------
// POST /api/users/add  (admin only)
// Create a new user.
// Body: { username: string, password: string }
// ---------------------------------------------------------------------------
router.post('/api/users/add', isAuthenticated, isAdmin, async (req, res) => {
  const schema = z.object({
    username: z.string().min(1).max(255),
    password: z.string().min(12, 'Password must be at least 12 characters'),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
  }

  const { username, password } = parseResult.data;
  const safeUsername = username.trim();

  const existing = better_sqlite_client
    .prepare(`SELECT id FROM users WHERE username = ?`)
    .get(safeUsername);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  let hashed: string;
  try {
    hashed = await bcrypt.hash(password, 12);
  } catch (err) {
    logger.error({ err }, '[users] bcrypt hash error');
    return res.status(500).json({ error: 'Internal server error' });
  }

  better_sqlite_client
    .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)`)
    .run(safeUsername, hashed);
  logger.info({ username: safeUsername }, '[users] user added');
  return res.status(201).json({ message: 'User created' });
});

// ---------------------------------------------------------------------------
// POST /api/users/delete  (admin only)
// Delete a user by id. Cannot delete yourself.
// Body: { userId: number }
// ---------------------------------------------------------------------------
router.post('/api/users/delete', isAuthenticated, isAdmin, (req, res) => {
  const schema = z.object({
    userId: z.number().int().positive(),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const { userId } = parseResult.data;

  if (userId === req.session.user!.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const info = better_sqlite_client
    .prepare(`DELETE FROM users WHERE id = ?`)
    .run(userId);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  logger.info({ deletedUserId: userId, byUserId: req.session.user!.id }, '[users] user deleted');
  return res.status(200).json({ message: 'User deleted' });
});

// ---------------------------------------------------------------------------
// GET /api/users/list  (admin only)
// List all users (id, username, is_admin — no passwords).
// ---------------------------------------------------------------------------
router.get('/api/users/list', isAuthenticated, isAdmin, (_req, res) => {
  const rows = better_sqlite_client
    .prepare(`SELECT id, username, is_admin FROM users ORDER BY id`)
    .all() as { id: number; username: string; is_admin: number }[];
  return res.status(200).json({ users: rows });
});

export default router;
