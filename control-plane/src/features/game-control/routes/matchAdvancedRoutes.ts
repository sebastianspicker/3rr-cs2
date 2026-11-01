/** Validated advanced match operations, kept separate from ordinary setup routes. */
import express from 'express';
import type { RconManager } from '../../../integrations/rcon';
import type { RequestHandler } from 'express';
import { parseGameBody } from './matchRouteValidation';
import type { ServerAccess } from '../../server-access/access';
import logger from '../../../infrastructure/logging';
import { mapsConfig } from '../../game-catalog/mapsConfig';
import {
  MapGroupBodySchema,
  MatchFileBodySchema,
  MatchzyCoachBodySchema,
  MatchzyReadyRequiredBodySchema,
  PlayerSteamId64BodySchema,
  PlayerUserIdBodySchema,
  WorkshopCollectionBodySchema,
  WorkshopMapBodySchema,
} from './matchContracts';
import { sendGameRouteError } from './gameCommandExecution';
import { createGameRouteFactories } from './gameRouteFactories';
import { createRouteRateLimit } from '../../../shared/routeRateLimit';

const routeRateLimit = createRouteRateLimit();
const KnownMapGroupBodySchema = MapGroupBodySchema.refine(
  ({ group }) => Object.hasOwn(mapsConfig.mapGroups, group),
  { error: (issue) => `Unknown map group: ${(issue.input as { group: string }).group}` }
);

export function createMatchAdvancedRoutes(
  rcon: RconManager,
  isAuthenticated: RequestHandler,
  access: ServerAccess
): express.Router {
  const router = express.Router();
  const { requireAuthorizedServerId } = access;
  const { makeBodyCmdRoute, makeSequenceRoute, makeSimpleCmdRoute, runGameCmdSequence } =
    createGameRouteFactories(rcon, access);

  router.post(
    '/api/matchzy-match',
    isAuthenticated,
    makeSequenceRoute(
      'matchzy-match',
      [{ cfg: 'live.cfg' }, 'css_matchzy_loadmatch'],
      'MatchZy match command sequence sent.'
    )
  );
  router.post(
    '/api/matchzy-practice',
    isAuthenticated,
    makeSimpleCmdRoute('matchzy-practice', 'css_matchzy_practice', 'MatchZy practice command sent.')
  );
  router.post(
    '/api/matchzy-exitprac',
    isAuthenticated,
    makeSequenceRoute(
      'matchzy-exitprac',
      ['css_matchzy_exitprac', { cfg: 'warmup.cfg' }],
      'MatchZy exit practice command sequence sent.'
    )
  );
  router.post(
    '/api/matchzy-playout',
    isAuthenticated,
    makeSimpleCmdRoute('matchzy-playout', 'css_matchzy_playout', 'MatchZy playout command sent.')
  );

  router.post(
    '/api/matchzy-readyrequired',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'matchzy-readyrequired',
      MatchzyReadyRequiredBodySchema,
      ({ value }) => `css_matchzy_readyrequired ${value}`,
      ({ value }) => `Ready-required command sent with value ${value}.`
    )
  );

  router.post(
    '/api/matchzy-abort',
    isAuthenticated,
    makeSequenceRoute(
      'matchzy-abort',
      ['css_matchzy_abort', { cfg: 'warmup.cfg' }],
      'MatchZy abort command sequence sent.'
    )
  );

  router.post(
    '/api/matchzy-coach',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'matchzy-coach',
      MatchzyCoachBodySchema,
      ({ side }) => `css_matchzy_coach ${side}`,
      ({ side }) => `Coach command sent for ${side.toUpperCase()}.`
    )
  );

  router.post('/api/matchzy-load-match-file', isAuthenticated, routeRateLimit, async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const parsedBody = parseGameBody(MatchFileBodySchema, req.body, res);
      if (!parsedBody) return;
      const { filename } = parsedBody;
      logger.info(
        {
          user: req.session?.user?.username ?? 'unknown',
          action: 'matchzy-load-match-file',
          filename,
        },
        '[game] action'
      );
      await runGameCmdSequence(server_id, [
        'exec live.cfg',
        `css_matchzy_loadmatch_fromfile ${filename}`,
      ]);
      return res
        .status(200)
        .json({ message: `Load match-file command sequence sent for ${filename}.` });
    } catch (err) {
      sendGameRouteError(res, err, 'matchzy-load-match-file');
      return;
    }
  });

  router.post(
    '/api/player-kick',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'player-kick',
      PlayerUserIdBodySchema,
      ({ userid }) => `kickid ${userid}`,
      ({ userid }) => `Kick command sent for player ${userid}.`
    )
  );

  router.post(
    '/api/player-mute',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'player-mute',
      PlayerSteamId64BodySchema,
      ({ steamid }) => `css_matchzy_mute ${steamid}`,
      ({ steamid }) => `Mute command sent for player ${steamid}.`
    )
  );

  router.post(
    '/api/player-unmute',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'player-unmute',
      PlayerSteamId64BodySchema,
      ({ steamid }) => `css_matchzy_unmute ${steamid}`,
      ({ steamid }) => `Unmute command sent for player ${steamid}.`
    )
  );

  router.post(
    '/api/workshop-map',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'workshop-map',
      WorkshopMapBodySchema,
      ({ workshop_id }) => `host_workshop_map ${workshop_id}`,
      ({ workshop_id }) => `Workshop map load command sent for ${workshop_id}.`
    )
  );

  router.post(
    '/api/set-mapgroup',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'set-mapgroup',
      KnownMapGroupBodySchema,
      ({ group }) => `mp_mapgroupname ${group}`,
      ({ group }) => `Map-group command sent for ${group}.`
    )
  );

  router.post(
    '/api/workshop-collection',
    isAuthenticated,
    routeRateLimit,
    makeBodyCmdRoute(
      'workshop-collection',
      WorkshopCollectionBodySchema,
      ({ collection_id }) => `host_workshop_collection ${collection_id}`,
      ({ collection_id }) => `Workshop collection load command sent for ${collection_id}.`
    )
  );

  return router;
}
