import express from 'express';
import { z } from 'zod';
import { better_sqlite_client } from '../db';
import rcon from '../modules/rcon';
import isAuthenticated from '../modules/middleware';
import logger from '../utils/logger';
import { parseServerId } from '../utils/parseServerId';
import { requireAuthorizedServerIdParam } from '../utils/serverAccess';
import { type ParsedPlayer, parseStatusResponse, parseUsersResponse } from '../utils/rconParsers';
import { clearRconHistory, listRconHistory } from '../utils/rconHistory';
import {
  autocompleteQuery,
  loadAutocomplete,
  parseAutocompleteLimit,
} from './operatorAutocomplete';

const router = express.Router();

const WorkshopFavoriteBodySchema = z.object({
  workshop_id: z.string().regex(/^\d{5,20}$/, 'workshop_id must be 5-20 digits'),
  name: z.string().trim().min(1).max(80),
});

const WorkshopFavoriteUpdateSchema = z
  .object({
    workshop_id: z
      .string()
      .regex(/^\d{5,20}$/, 'workshop_id must be 5-20 digits')
      .optional(),
    name: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => value.workshop_id !== undefined || value.name !== undefined, {
    message: 'name or workshop_id is required',
  });

interface WorkshopFavoriteRow {
  id: number;
  workshop_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

const listFavoritesStmt = better_sqlite_client.prepare(`
  SELECT id, workshop_id, name, created_at, updated_at
    FROM workshop_favorites
   WHERE user_id = ?
     AND server_id = ?
   ORDER BY updated_at DESC, id DESC
`);

const upsertFavoriteStmt = better_sqlite_client.prepare(`
  INSERT INTO workshop_favorites (user_id, server_id, workshop_id, name, created_at, updated_at)
  VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(user_id, server_id, workshop_id) DO UPDATE SET
    name = excluded.name,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

const selectFavoriteStmt = better_sqlite_client.prepare(`
  SELECT id, workshop_id, name, created_at, updated_at
    FROM workshop_favorites
   WHERE user_id = ?
     AND server_id = ?
     AND workshop_id = ?
`);

const selectFavoriteByIdStmt = better_sqlite_client.prepare(`
  SELECT id, workshop_id, name, created_at, updated_at
    FROM workshop_favorites
   WHERE id = ?
     AND user_id = ?
     AND server_id = ?
`);

const updateFavoriteStmt = better_sqlite_client.prepare(`
  UPDATE workshop_favorites
     SET workshop_id = ?,
         name = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = ?
     AND user_id = ?
     AND server_id = ?
`);

const deleteFavoriteStmt = better_sqlite_client.prepare(`
  DELETE FROM workshop_favorites
   WHERE id = ?
     AND user_id = ?
     AND server_id = ?
`);

function parsePositiveId(value: unknown): number | null {
  const parsed = parseServerId(value);
  return parsed ? Number.parseInt(parsed, 10) : null;
}

function isUniqueConstraintError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const message = err instanceof Error ? err.message : String(err);
  return (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    message.includes('UNIQUE constraint failed: workshop_favorites.user_id') ||
    message.includes('UNIQUE constraint failed: workshop_favorites')
  );
}

type FavoriteUpdateResult =
  | { status: 200; favorite: WorkshopFavoriteRow }
  | { status: 409 | 500; error: string };

function parseFavoriteUpdate(
  body: unknown,
  response: express.Response
): z.infer<typeof WorkshopFavoriteUpdateSchema> | null {
  const result = WorkshopFavoriteUpdateSchema.safeParse(body);
  if (result.success) return result.data;
  response.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid input' });
  return null;
}

function persistFavoriteUpdate(
  favoriteId: number,
  userId: number | undefined,
  serverId: string,
  existing: WorkshopFavoriteRow,
  update: z.infer<typeof WorkshopFavoriteUpdateSchema>
): FavoriteUpdateResult {
  const workshopId = update.workshop_id ?? existing.workshop_id;
  const name = update.name ?? existing.name;
  try {
    updateFavoriteStmt.run(workshopId, name, favoriteId, userId, serverId);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      logger.warn({ err: error }, '[workshop-favorites] duplicate update rejected');
      return { status: 409, error: 'A favorite with that workshop_id already exists' };
    }
    logger.error({ err: error }, '[workshop-favorites] update persistence failed');
    return { status: 500, error: 'Workshop favorite update failed' };
  }
  const favorite = selectFavoriteByIdStmt.get(favoriteId, userId, serverId) as WorkshopFavoriteRow;
  return { status: 200, favorite };
}

router.get('/api/players/:server_id', isAuthenticated, async (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;

  const [usersResult, statusResult] = await Promise.allSettled([
    rcon.executeCommand(serverId, 'users'),
    rcon.executeCommand(serverId, 'status'),
  ]);
  const errors: string[] = [];
  let players: ParsedPlayer[] = [];
  let observed = false;
  let humans: number | null = null;
  let bots: number | null = null;
  let maxPlayers: number | null = null;

  if (usersResult.status === 'fulfilled') {
    observed = true;
    players = parseUsersResponse(usersResult.value);
  } else {
    logger.warn({ server_id: serverId, err: usersResult.reason }, '[players] RCON users error');
    errors.push('users unavailable');
  }

  if (statusResult.status === 'fulfilled') {
    observed = true;
    const parsedStatus = parseStatusResponse(statusResult.value);
    humans = parsedStatus.humans;
    bots = parsedStatus.bots;
    maxPlayers = parsedStatus.maxPlayers;
  } else {
    logger.warn({ server_id: serverId, err: statusResult.reason }, '[players] RCON status error');
    errors.push('status unavailable');
  }

  return res.json({
    players,
    humans,
    bots,
    max_players: maxPlayers,
    observed_at: observed ? new Date().toISOString() : null,
    error: errors.length ? errors.join('; ') : null,
  });
});

router.get('/api/rcon/autocomplete/:server_id', isAuthenticated, async (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;

  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const limit = parseAutocompleteLimit(req.query.limit);
    const q = autocompleteQuery(req.query.q);
    const { entry, cached } = await loadAutocomplete(serverId, refresh);
    const suggestions = entry.suggestions
      .filter((suggestion) => !q || suggestion.toLowerCase().includes(q))
      .slice(0, limit);
    return res.json({
      suggestions,
      observed_at: entry.observedAt || null,
      error: entry.error,
      cached,
    });
  } catch (err) {
    logger.error({ server_id: serverId, err }, '[rcon] autocomplete error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/workshop-favorites/:server_id', isAuthenticated, (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;
  const userId = req.session.user?.id;
  const favorites = listFavoritesStmt.all(userId, serverId) as WorkshopFavoriteRow[];
  return res.json({ favorites });
});

router.post('/api/workshop-favorites/:server_id', isAuthenticated, (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;
  const parseResult = WorkshopFavoriteBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
  }

  const userId = req.session.user?.id;
  const { workshop_id: workshopId, name } = parseResult.data;
  upsertFavoriteStmt.run(userId, serverId, workshopId, name);
  const favorite = selectFavoriteStmt.get(userId, serverId, workshopId) as
    | WorkshopFavoriteRow
    | undefined;
  return res.status(201).json({ favorite });
});

router.patch('/api/workshop-favorites/:server_id/:favorite_id', isAuthenticated, (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;
  const favoriteId = parsePositiveId(req.params.favorite_id);
  if (!favoriteId) return res.status(404).json({ error: 'Favorite not found' });

  const update = parseFavoriteUpdate(req.body, res);
  if (!update) return;

  const userId = req.session.user?.id;
  const existing = selectFavoriteByIdStmt.get(favoriteId, userId, serverId) as
    | WorkshopFavoriteRow
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Favorite not found' });

  const result = persistFavoriteUpdate(favoriteId, userId, serverId, existing, update);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  return res.json({ favorite: result.favorite });
});

router.delete('/api/workshop-favorites/:server_id/:favorite_id', isAuthenticated, (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;
  const favoriteId = parsePositiveId(req.params.favorite_id);
  if (!favoriteId) return res.status(404).json({ error: 'Favorite not found' });
  const userId = req.session.user?.id;
  const result = deleteFavoriteStmt.run(favoriteId, userId, serverId);
  if (result.changes === 0) return res.status(404).json({ error: 'Favorite not found' });
  return res.json({ message: 'Favorite deleted' });
});

router.get('/api/rcon/history/:server_id', isAuthenticated, (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;
  const userId = req.session.user?.id;
  if (userId === undefined) return res.status(401).json({ error: 'Authentication required' });
  try {
    return res.json({
      commands: listRconHistory(userId, serverId),
      history_state: 'available',
    });
  } catch (err) {
    logger.error({ err, server_id: serverId }, '[rcon-history] list failed');
    return res.status(500).json({
      error: 'RCON sent-command history unavailable',
      history_state: 'unavailable',
    });
  }
});

router.delete('/api/rcon/history/:server_id', isAuthenticated, (req, res) => {
  const serverId = requireAuthorizedServerIdParam(req, res);
  if (!serverId) return;
  const userId = req.session.user?.id;
  if (userId === undefined) return res.status(401).json({ error: 'Authentication required' });
  try {
    const deleted = clearRconHistory(userId, serverId);
    return res.json({ message: 'Sent RCON command history cleared', deleted });
  } catch (err) {
    logger.error({ err, server_id: serverId }, '[rcon-history] clear failed');
    return res.status(500).json({ error: 'Sent RCON command history could not be cleared' });
  }
});

export default router;
