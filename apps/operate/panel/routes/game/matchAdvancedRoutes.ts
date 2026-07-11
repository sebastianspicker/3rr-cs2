import express from 'express';
import { parseGameBody } from './matchRouteValidation';
import isAuthenticated from '../../modules/middleware';
import { requireAuthorizedServerId } from '../../utils/serverAccess';
import logger from '../../utils/logger';
import { mapsConfig } from '../../utils/mapsConfig';
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
import {
  execCfg,
  makeSequenceRoute,
  makeSimpleCmdRoute,
  runGameCmd,
  sendGameRouteError,
} from './helpers';

const router = express.Router();

// === MATCHZY COMMANDS ===
//
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

router.post('/api/matchzy-readyrequired', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(MatchzyReadyRequiredBodySchema, req.body, res);
    if (!parsedBody) return;
    const n = parsedBody.value;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'matchzy-readyrequired', value: n },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_readyrequired ${n}`);
    return res.status(200).json({ message: `Ready-required command sent with value ${n}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'matchzy-readyrequired');
    return;
  }
});

router.post(
  '/api/matchzy-abort',
  isAuthenticated,
  makeSequenceRoute(
    'matchzy-abort',
    ['css_matchzy_abort', { cfg: 'warmup.cfg' }],
    'MatchZy abort command sequence sent.'
  )
);

router.post('/api/matchzy-coach', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(MatchzyCoachBodySchema, req.body, res);
    if (!parsedBody) return;
    const { side } = parsedBody;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'matchzy-coach', side },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_coach ${side}`);
    return res.status(200).json({ message: `Coach command sent for ${side.toUpperCase()}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'matchzy-coach');
    return;
  }
});

router.post('/api/matchzy-load-match-file', isAuthenticated, async (req, res) => {
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
    await execCfg(server_id, 'live.cfg');
    await runGameCmd(server_id, `css_matchzy_loadmatch_fromfile ${filename}`);
    return res
      .status(200)
      .json({ message: `Load match-file command sequence sent for ${filename}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'matchzy-load-match-file');
    return;
  }
});

//
// === PLAYER MANAGEMENT ===
//
router.post('/api/player-kick', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(PlayerUserIdBodySchema, req.body, res);
    if (!parsedBody) return;
    const { userid } = parsedBody;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'player-kick', userid },
      '[game] action'
    );
    await runGameCmd(server_id, `kickid ${userid}`);
    return res.status(200).json({ message: `Kick command sent for player ${userid}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'player-kick');
    return;
  }
});

router.post('/api/player-mute', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(PlayerSteamId64BodySchema, req.body, res);
    if (!parsedBody) return;
    const { steamid } = parsedBody;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'player-mute', steamid },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_mute ${steamid}`);
    return res.status(200).json({ message: `Mute command sent for player ${steamid}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'player-mute');
    return;
  }
});

router.post('/api/player-unmute', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(PlayerSteamId64BodySchema, req.body, res);
    if (!parsedBody) return;
    const { steamid } = parsedBody;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'player-unmute', steamid },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_unmute ${steamid}`);
    return res.status(200).json({ message: `Unmute command sent for player ${steamid}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'player-unmute');
    return;
  }
});

//
// === WORKSHOP MAP ===
//
router.post('/api/workshop-map', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(WorkshopMapBodySchema, req.body, res);
    if (!parsedBody) return;
    const workshopId = parsedBody.workshop_id;
    const username = req.session?.user?.username ?? 'unknown';
    logger.info(
      { user: username, action: 'workshop-map', workshop_id: workshopId },
      '[game] action'
    );
    await runGameCmd(server_id, `host_workshop_map ${workshopId}`);
    return res.status(200).json({ message: `Workshop map load command sent for ${workshopId}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'workshop-map');
    return;
  }
});

//
// === MAP GROUP ===
//
router.post('/api/set-mapgroup', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(MapGroupBodySchema, req.body, res);
    if (!parsedBody) return;
    const { group } = parsedBody;
    if (!Object.hasOwn(mapsConfig.mapGroups, group)) {
      return res.status(400).json({ error: `Unknown map group: ${group}` });
    }
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'set-mapgroup', group },
      '[game] action'
    );
    await runGameCmd(server_id, `mp_mapgroupname ${group}`);
    return res.status(200).json({ message: `Map-group command sent for ${group}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'set-mapgroup');
    return;
  }
});

//
// === WORKSHOP COLLECTION ===
//
router.post('/api/workshop-collection', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(WorkshopCollectionBodySchema, req.body, res);
    if (!parsedBody) return;
    const { collection_id } = parsedBody;
    logger.info(
      {
        user: req.session?.user?.username ?? 'unknown',
        action: 'workshop-collection',
        collection_id,
      },
      '[game] action'
    );
    await runGameCmd(server_id, `host_workshop_collection ${collection_id}`);
    return res
      .status(200)
      .json({ message: `Workshop collection load command sent for ${collection_id}.` });
  } catch (err) {
    sendGameRouteError(res, err, 'workshop-collection');
    return;
  }
});

//

export default router;
