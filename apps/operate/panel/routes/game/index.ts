import express from 'express';
import matchRouter from './match';
import controlsRouter from './controls';

const router = express.Router();
router.use('/', matchRouter);
router.use('/', controlsRouter);

export default router;
