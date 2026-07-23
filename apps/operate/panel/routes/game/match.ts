/** Composes match setup, backup, advanced, and explicit-RCON route groups. */
import express from 'express';
import setupRoutes from './matchSetupRoutes';
import backupRoutes from './matchBackupRoutes';
import advancedRoutes from './matchAdvancedRoutes';
import rconRoutes from './matchRconRoutes';

const router = express.Router();
router.use(setupRoutes);
router.use(backupRoutes);
router.use(advancedRoutes);
router.use(rconRoutes);

export default router;
