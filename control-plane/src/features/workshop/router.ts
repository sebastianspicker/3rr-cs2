/** Per-user workshop-favorite persistence. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { SQLITE_UTC_NOW } from '../../infrastructure/sqlite';
import logger from '../../infrastructure/logging';
import { parseServerId } from '../server-access/parseServerId';
import type { ServerAccess } from '../server-access/access';

const createSchema = z.object({
  workshop_id: z.string().regex(/^\d{5,20}$/, 'workshop_id must be 5-20 digits'),
  name: z.string().trim().min(1).max(80),
});
const updateSchema = createSchema
  .partial()
  .refine((value) => value.workshop_id !== undefined || value.name !== undefined, {
    message: 'name or workshop_id is required',
  });
type Favorite = {
  id: number;
  workshop_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export function createWorkshopRouter(
  db: Database.Database,
  isAuthenticated: RequestHandler,
  { requireAuthorizedServerIdParam }: ServerAccess
): express.Router {
  const router = express.Router();
  const base = `SELECT id, workshop_id, name, created_at, updated_at FROM workshop_favorites WHERE user_id = ? AND server_id = ?`;
  const list = db.prepare(`${base} ORDER BY updated_at DESC, id DESC`);
  const upsert = db.prepare(
    `INSERT INTO workshop_favorites (user_id, server_id, workshop_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ${SQLITE_UTC_NOW}, ${SQLITE_UTC_NOW}) ON CONFLICT(user_id, server_id, workshop_id) DO UPDATE SET name = excluded.name, updated_at = ${SQLITE_UTC_NOW}`
  );
  const byWorkshop = db.prepare(`${base} AND workshop_id = ?`);
  const byId = db.prepare(`${base} AND id = ?`);
  const update = db.prepare(
    `UPDATE workshop_favorites SET workshop_id = ?, name = ?, updated_at = ${SQLITE_UTC_NOW} WHERE id = ? AND user_id = ? AND server_id = ?`
  );
  const remove = db.prepare(
    `DELETE FROM workshop_favorites WHERE id = ? AND user_id = ? AND server_id = ?`
  );
  const favoriteId = (value: unknown) => {
    const parsed = parseServerId(value);
    return parsed ? Number.parseInt(parsed, 10) : null;
  };
  router.get('/api/workshop-favorites/:server_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    return res.json({ favorites: list.all(req.session.user?.id, serverId) as Favorite[] });
  });
  router.post('/api/workshop-favorites/:server_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    const userId = req.session.user?.id;
    upsert.run(userId, serverId, parsed.data.workshop_id, parsed.data.name);
    return res.status(201).json({
      favorite: byWorkshop.get(userId, serverId, parsed.data.workshop_id) as Favorite | undefined,
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
    const existing = byId.get(userId, serverId, id) as Favorite | undefined;
    if (!existing) return res.status(404).json({ error: 'Favorite not found' });
    try {
      update.run(
        parsed.data.workshop_id ?? existing.workshop_id,
        parsed.data.name ?? existing.name,
        id,
        userId,
        serverId
      );
      return res.json({ favorite: byId.get(userId, serverId, id) as Favorite });
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
    const result = remove.run(id, req.session.user?.id, serverId);
    if (result.changes === 0) return res.status(404).json({ error: 'Favorite not found' });
    return res.json({ message: 'Favorite deleted' });
  });
  return router;
}
