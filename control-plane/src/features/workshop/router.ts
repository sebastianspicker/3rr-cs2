/** Per-user workshop-favorite persistence. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import logger from '../../infrastructure/logging';
import { parseServerId } from '../server-access/parseServerId';
import type { ServerAccess } from '../server-access/access';
import { createWorkshopRepository } from './repository';

const createSchema = z.object({
  workshop_id: z.string().regex(/^\d{5,20}$/, 'workshop_id must be 5-20 digits'),
  name: z.string().trim().min(1).max(80),
});
const updateSchema = createSchema
  .partial()
  .refine((value) => value.workshop_id !== undefined || value.name !== undefined, {
    message: 'name or workshop_id is required',
  });

export function createWorkshopRouter(
  db: Database.Database,
  isAuthenticated: RequestHandler,
  { requireAuthorizedServerIdParam }: ServerAccess
): express.Router {
  const router = express.Router();
  const repository = createWorkshopRepository(db);
  const favoriteId = (value: unknown) => {
    const parsed = parseServerId(value);
    return parsed ? Number.parseInt(parsed, 10) : null;
  };
  router.get('/api/workshop-favorites/:server_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    return res.json({ favorites: repository.listFavorites(req.session.user?.id, serverId) });
  });
  router.post('/api/workshop-favorites/:server_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    const userId = req.session.user?.id;
    repository.upsertFavorite(userId, serverId, parsed.data.workshop_id, parsed.data.name);
    return res.status(201).json({
      favorite: repository.findByWorkshopId(userId, serverId, parsed.data.workshop_id),
    });
  });
  router.patch('/api/workshop-favorites/:server_id/:favorite_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    const id = favoriteId(req.params.favorite_id);
    if (!id) return res.status(404).json({ error: 'Favorite not found' });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    const userId = req.session.user?.id;
    const existing = repository.findById(userId, serverId, id);
    if (!existing) return res.status(404).json({ error: 'Favorite not found' });
    try {
      repository.updateFavorite(
        parsed.data.workshop_id ?? existing.workshop_id,
        parsed.data.name ?? existing.name,
        id,
        userId,
        serverId
      );
      return res.json({ favorite: repository.findById(userId, serverId, id) });
    } catch (error) {
      logger.warn({ err: error }, '[workshop-favorites] update persistence failed');
      return res.status(409).json({ error: 'A favorite with that workshop_id already exists' });
    }
  });
  router.delete('/api/workshop-favorites/:server_id/:favorite_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    const id = favoriteId(req.params.favorite_id);
    if (!id) return res.status(404).json({ error: 'Favorite not found' });
    const changes = repository.deleteFavorite(id, req.session.user?.id, serverId);
    if (changes === 0) return res.status(404).json({ error: 'Favorite not found' });
    return res.json({ message: 'Favorite deleted' });
  });
  return router;
}
