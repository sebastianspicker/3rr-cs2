/** Registers authenticated self-service password changes. */
import type { Response, Router } from 'express';
import { z } from 'zod';
import isAuthenticated from '../../modules/middleware';
import logger from '../../utils/logger';
import { findUserPassword, updateUserPassword } from './persistence';
import { hashPassword, verifyPassword } from './passwords';

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
});

function sendPasswordMatchError(res: Response, matches: boolean | null): boolean {
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

export function registerPasswordRoutes(router: Router): void {
  router.post('/api/users/change-password', isAuthenticated, async (req, res) => {
    const parseResult = ChangePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }

    const { currentPassword, newPassword } = parseResult.data;
    const userId = req.session.user?.id;
    const row = findUserPassword(userId);
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    const matches = await verifyPassword(currentPassword, row.password);
    if (sendPasswordMatchError(res, matches)) return;

    const hashed = await hashPassword(newPassword);
    if (hashed === null) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    updateUserPassword(userId, hashed);
    logger.info({ userId }, '[users] password changed');
    return res.status(200).json({ message: 'Password updated' });
  });
}
