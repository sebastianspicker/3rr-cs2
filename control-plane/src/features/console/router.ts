import { currentExecutionOptions } from '../../shared/executionContext';
/** Raw RCON observations, autocomplete, and command history. */
import express from 'express';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import type { RconManager } from '../../integrations/rcon/rcon';
import logger from '../../infrastructure/logging';
import { createRconHistoryRepository } from '../../integrations/rcon/rconHistory';
import {
  type ParsedPlayer,
  parseStatusResponse,
  parseUsersResponse,
} from '../../integrations/rcon/rconParsers';
import type { ServerAccess } from '../server-access/access';
import {
  autocompleteQuery,
  createAutocompleteLoader,
  parseAutocompleteLimit,
} from './autocomplete';

export function createConsoleRouter(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  { requireAuthorizedServerIdParam }: ServerAccess
): express.Router {
  const router = express.Router();
  const { clearRconHistory, listRconHistory } = createRconHistoryRepository(db);
  const { loadAutocomplete } = createAutocompleteLoader(rcon);
  router.get('/api/players/:server_id', isAuthenticated, async (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    const [usersResult, statusResult] = await Promise.allSettled([
      rcon.observeCommand(serverId, 'users', {
        ...currentExecutionOptions(),
        refresh: req.query.refresh === '1',
      }),
      rcon.observeCommand(serverId, 'status', {
        ...currentExecutionOptions(),
        refresh: req.query.refresh === '1',
      }),
    ]);
    const errors: string[] = [];
    let players: ParsedPlayer[] = [],
      observedAt: string | null = null,
      humans: number | null = null,
      bots: number | null = null,
      maxPlayers: number | null = null;
    if (usersResult.status === 'fulfilled') {
      observedAt = usersResult.value.observedAt;
      players = parseUsersResponse(usersResult.value.value);
    } else {
      logger.warn({ server_id: serverId, err: usersResult.reason }, '[players] RCON users error');
      errors.push('users unavailable');
    }
    if (statusResult.status === 'fulfilled') {
      observedAt =
        observedAt && observedAt < statusResult.value.observedAt
          ? observedAt
          : statusResult.value.observedAt;
      const parsed = parseStatusResponse(statusResult.value.value);
      humans = parsed.humans;
      bots = parsed.bots;
      maxPlayers = parsed.maxPlayers;
    } else {
      logger.warn({ server_id: serverId, err: statusResult.reason }, '[players] RCON status error');
      errors.push('status unavailable');
    }
    return res.json({
      players,
      humans,
      bots,
      max_players: maxPlayers,
      observed_at: observedAt,
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
      return res.json({
        suggestions: entry.suggestions
          .filter((suggestion) => !q || suggestion.toLowerCase().includes(q))
          .slice(0, limit),
        observed_at: entry.observedAt || null,
        error: entry.error,
        cached,
      });
    } catch (err) {
      logger.error({ server_id: serverId, err }, '[rcon] autocomplete error');
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  router.get('/api/rcon/history/:server_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    const userId = req.session.user?.id;
    if (userId === undefined) return res.status(401).json({ error: 'Authentication required' });
    try {
      return res.json({ commands: listRconHistory(userId, serverId), history_state: 'available' });
    } catch (err) {
      logger.error({ err, server_id: serverId }, '[rcon-history] list failed');
      return res
        .status(500)
        .json({ error: 'RCON sent-command history unavailable', history_state: 'unavailable' });
    }
  });
  router.delete('/api/rcon/history/:server_id', isAuthenticated, (req, res) => {
    const serverId = requireAuthorizedServerIdParam(req, res);
    if (!serverId) return;
    const userId = req.session.user?.id;
    if (userId === undefined) return res.status(401).json({ error: 'Authentication required' });
    try {
      return res.json({
        message: 'Sent RCON command history cleared',
        deleted: clearRconHistory(userId, serverId),
      });
    } catch (err) {
      logger.error({ err, server_id: serverId }, '[rcon-history] clear failed');
      return res.status(500).json({ error: 'Sent RCON command history could not be cleared' });
    }
  });
  return router;
}
