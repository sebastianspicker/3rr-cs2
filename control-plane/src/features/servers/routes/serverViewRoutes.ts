import express from 'express';
import type Database from 'better-sqlite3';
import type { RequestHandler } from 'express';
import { getMapsForMode, mapsConfig } from '../../game-catalog/mapsConfig';
import logger from '../../../infrastructure/logging';
import { parseServerId } from '../../server-access/parseServerId';
import type { RconManager } from '../../../integrations/rcon';
import type { ServerAccess } from '../../server-access/access';
import { createServersRepository, type ManageServerRow } from '../repository';

export function createServerViewRoutes(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  { renderManageResponse }: ServerAccess
): express.Router {
  const router = express.Router();
  const repository = createServersRepository(db);

  function requestedType(server: ManageServerRow, gameTypes: string[]): string {
    const requested = server.requested_game_type;
    if (requested && Object.hasOwn(mapsConfig.gameTypes, requested)) return requested;
    return gameTypes[0] ?? '';
  }

  function requestedMode(
    server: ManageServerRow,
    config: (typeof mapsConfig.gameTypes)[string] | undefined,
    modes: string[]
  ): string {
    const requested = server.requested_game_mode;
    if (requested && config && Object.hasOwn(config.gameModes, requested)) return requested;
    return modes[0] ?? '';
  }

  function requestedMapName(server: ManageServerRow, maps: string[]): string {
    const requested = server.requested_map;
    if (typeof requested === 'string') {
      const allowed = maps.find((map) => map === requested);
      if (allowed !== undefined) return allowed;
    }
    return maps.at(0) ?? '';
  }

  function requestedSetup(server: ManageServerRow) {
    const gameTypes = Object.keys(mapsConfig.gameTypes);
    const mapGroups = Object.entries(mapsConfig.mapGroups).map(([id, group]) => ({
      id,
      displayName: group.displayName,
    }));
    const requestedGameType = requestedType(server, gameTypes);
    const config = Object.entries(mapsConfig.gameTypes).find(
      ([name]) => name === requestedGameType
    )?.[1];
    const modes = config ? Object.keys(config.gameModes) : [];
    const requestedGameMode = requestedMode(server, config, modes);
    const maps = requestedGameMode ? getMapsForMode(requestedGameType, requestedGameMode) : [];
    const requestedMap = requestedMapName(server, maps);
    return { gameTypes, mapGroups, requestedGameType, requestedGameMode, requestedMap };
  }

  // The page renders from stored and in-process state only; the client loads the
  // live hostname with the first status observation.
  function manageView(serverId: string, ownerId: number | undefined): object | null {
    const server = repository.findAccessibleServerForManage(serverId, ownerId);
    if (!server) return null;
    const managedServerId = String(server.id);
    const connection = rcon.getConnectionInfo(managedServerId);
    const online = Boolean(connection?.connected && connection.authenticated);
    return {
      server_id: managedServerId,
      hostname: '–',
      host: connection?.host ?? server.serverIP,
      port: connection?.port ?? server.serverPort,
      ...requestedSetup(server),
      connected: Boolean(connection?.connected),
      authenticated: Boolean(connection?.authenticated),
      // Until the first observation, an offline socket means "not observed", not "down".
      hostname_error: online ? null : 'not observed yet',
    };
  }

  router.get('/servers', isAuthenticated, (_req, res) => {
    res.render('servers');
  });

  router.get('/manage/:server_id', isAuthenticated, (req, res) => {
    try {
      const parsedServerId = parseServerId(req.params.server_id);
      if (!parsedServerId) return res.status(404).send('Server not found');
      const view = manageView(String(Number.parseInt(parsedServerId, 10)), req.session.user?.id);
      if (!view) return res.status(404).send('Server not found');
      res.locals = { ...res.locals, ...view };
      renderManageResponse(res);
    } catch (err) {
      logger.error({ err }, '[server] manage error');
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
}
