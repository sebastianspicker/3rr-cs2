import { currentExecutionOptions } from '../../../shared/executionContext';
import express from 'express';
import type Database from 'better-sqlite3';
import type { RconManager } from '../../../integrations/rcon/rcon';
import type { RequestHandler } from 'express';
import { getMapsForMode, mapsConfig } from '../../game-catalog/mapsConfig';
import logger from '../../../infrastructure/logging';
import { parseServerId } from '../../server-access/parseServerId';
import { parseHostnameResponse } from '../../../integrations/rcon/rconResponse';
import type { ServerAccess } from '../../server-access/access';

interface ServerRow {
  id: number;
  serverIP: string;
  serverPort: number;
  requested_game_type?: string;
  requested_game_mode?: string;
  requested_map?: string;
}

export function createServerViewRoutes(
  db: Database.Database,
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  { renderManageResponse, selectAccessibleServerSql }: ServerAccess
): express.Router {
  const router = express.Router();
  const selectManageStmt = db.prepare(
    selectAccessibleServerSql(`s.id,
    s.serverIP,
    s.serverPort,
    s.last_game_type AS requested_game_type,
    s.last_game_mode AS requested_game_mode,
    s.last_map AS requested_map`)
  );

  async function managedHostname(
    serverId: string
  ): Promise<{ hostname: string; error: string | null }> {
    try {
      const response = await rcon.observeCommand(serverId, 'hostname', currentExecutionOptions());
      return { hostname: parseHostnameResponse(response.value, '–'), error: null };
    } catch (error) {
      logger.warn({ server_id: serverId, err: error }, '[server] manage hostname unavailable');
      return { hostname: '–', error: 'hostname unavailable' };
    }
  }

  function requestedType(server: ServerRow, gameTypes: string[]): string {
    const requested = server.requested_game_type;
    if (requested && Object.hasOwn(mapsConfig.gameTypes, requested)) return requested;
    return gameTypes[0] ?? '';
  }

  function requestedMode(
    server: ServerRow,
    config: (typeof mapsConfig.gameTypes)[string] | undefined,
    modes: string[]
  ): string {
    const requested = server.requested_game_mode;
    if (requested && config && Object.hasOwn(config.gameModes, requested)) return requested;
    return modes[0] ?? '';
  }

  function requestedMapName(server: ServerRow, maps: string[]): string {
    const requested = server.requested_map;
    if (typeof requested === 'string') {
      const allowed = maps.find((map) => map === requested);
      if (allowed !== undefined) return allowed;
    }
    return maps.at(0) ?? '';
  }

  function requestedSetup(server: ServerRow) {
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

  async function manageView(serverId: string, ownerId: number | undefined): Promise<object | null> {
    const server = selectManageStmt.get(serverId, ownerId) as ServerRow | undefined;
    if (!server) return null;
    const managedServerId = String(server.id);
    const hostname = await managedHostname(managedServerId);
    const connection = rcon.getConnectionInfo(managedServerId);
    return {
      server_id: managedServerId,
      hostname: hostname.hostname,
      host: connection?.host ?? server.serverIP,
      port: connection?.port ?? server.serverPort,
      ...requestedSetup(server),
      connected: Boolean(connection?.connected),
      authenticated: Boolean(connection?.authenticated),
      hostname_error: hostname.error,
    };
  }

  router.get('/servers', isAuthenticated, (_req, res) => {
    res.render('servers');
  });

  router.get('/manage/:server_id', isAuthenticated, async (req, res) => {
    try {
      const parsedServerId = parseServerId(req.params.server_id);
      if (!parsedServerId) return res.status(404).send('Server not found');
      const view = await manageView(
        String(Number.parseInt(parsedServerId, 10)),
        req.session.user?.id
      );
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
