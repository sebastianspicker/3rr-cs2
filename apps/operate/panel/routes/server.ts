/** Stable composition root for server views, lifecycle APIs, status, and catalog routes. */
import express from 'express';
import serverAddRouter from './serverAdd';
import serverViewRoutes from './server/serverViewRoutes';
import serverStatusRoutes from './server/serverStatusRoutes';
import serverLifecycleRoutes from './server/serverLifecycleRoutes';
import serverCatalogRoutes from './server/serverCatalogRoutes';

const router = express.Router();
router.use(serverAddRouter);
router.use(serverViewRoutes);
router.use(serverStatusRoutes);
router.use(serverLifecycleRoutes);
router.use(serverCatalogRoutes);

export default router;
