import express from 'express';
import isAuthenticated from '../../modules/middleware';
import { getMapsForMode, mapsConfig } from '../../utils/mapsConfig';

const router = express.Router();

router.get('/api/game-types/:type/game-modes', isAuthenticated, (req, res) => {
  const type = String(req.params.type);
  const typeConfig = Object.entries(mapsConfig.gameTypes).find(([name]) => name === type)?.[1];
  if (!typeConfig) return res.status(404).json({ error: 'Unknown game type' });
  res.json({ gameModes: Object.keys(typeConfig.gameModes) });
});

router.get('/api/game-types/:type/game-modes/:mode/maps', isAuthenticated, (req, res) => {
  const type = String(req.params.type);
  const mode = String(req.params.mode);
  const typeConfig = Object.entries(mapsConfig.gameTypes).find(([name]) => name === type)?.[1];
  if (!typeConfig) return res.status(404).json({ error: 'Unknown game type' });
  const modeConfig = Object.entries(typeConfig.gameModes).find(([name]) => name === mode)?.[1];
  if (!modeConfig) return res.status(404).json({ error: 'Unknown game mode' });
  res.json({ maps: getMapsForMode(type, mode) });
});

export default router;
