/** Registers administrator user creation, deletion, and listing routes. */
import type { Router } from 'express';
import { z } from 'zod';
import isAuthenticated, { requireAdmin } from '../../modules/middleware';
import logger from '../../utils/logger';
import {
  cleanupDeletedUserServers,
  createUser,
  deleteUserAndExclusiveServers,
  initialServerAccessIsValid,
  listUsers,
  userNameExists,
} from './persistence';
import { hashPassword } from './passwords';

const NewUserSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  serverId: z.number().int().positive().optional(),
});

const DeleteUserSchema = z.object({
  userId: z.number().int().positive(),
});

function logUserDeletion(userId: number, deletedServerIds: number[], byUserId?: number): void {
  logger.info({ deletedUserId: userId, deletedServerIds, byUserId }, '[users] user deleted');
}

export function registerUserManagementRoutes(router: Router): void {
  router.post('/api/users/add', isAuthenticated, requireAdmin, async (req, res) => {
    const parseResult = NewUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }

    const { username: safeUsername, password, serverId } = parseResult.data;
    const currentUserId = req.session.user?.id;
    if (userNameExists(safeUsername)) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    if (!initialServerAccessIsValid(serverId, currentUserId)) {
      return res.status(400).json({ error: 'Initial server access is invalid' });
    }

    const hashed = await hashPassword(password);
    if (!hashed) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    const newUserId = createUser(safeUsername, hashed, serverId);
    logger.info({ username: safeUsername, userId: newUserId, serverId }, '[users] user added');
    return res.status(201).json({ message: 'User created' });
  });

  router.post('/api/users/delete', isAuthenticated, requireAdmin, async (req, res) => {
    const parseResult = DeleteUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const { userId } = parseResult.data;
    if (userId === req.session.user?.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    let deletion: ReturnType<typeof deleteUserAndExclusiveServers>;
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

  router.get('/api/users/list', isAuthenticated, requireAdmin, (_req, res) => {
    return res.status(200).json({ users: listUsers() });
  });
}
