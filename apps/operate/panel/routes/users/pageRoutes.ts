/** Registers authenticated settings and administrator user-management pages. */
import type { Router } from 'express';
import isAuthenticated, { requireAdmin } from '../../modules/middleware';
import { getAccessibleServers } from './persistence';

export function registerUserPageRoutes(router: Router): void {
  router.get('/settings', isAuthenticated, (_req, res) => {
    res.render('settings');
  });

  router.get('/admin/users', isAuthenticated, requireAdmin, (req, res) => {
    const currentUserId = req.session.user?.id;
    const servers = getAccessibleServers(currentUserId);
    res.render('admin-users', { currentUserId, servers });
  });
}
