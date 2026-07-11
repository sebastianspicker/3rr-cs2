import express from 'express';
import { parseGameBody } from './matchRouteValidation';
import isAuthenticated from '../../modules/middleware';
import { requireAuthorizedServerId } from '../../utils/serverAccess';
import logger from '../../utils/logger';
import { SetupGameBodySchema, updateRequestedSetupStmt } from './matchContracts';
import { applySetup, validateSetup } from './matchSetupService';
import {
  sendGameRouteError,
  makeToggleRoute,
  makeSimpleCmdRoute,
  makeSequenceRoute,
} from './helpers';

const router = express.Router();

router.post('/api/setup-game', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parsedBody = parseGameBody(SetupGameBodySchema, req.body, res);
    if (!parsedBody) return;
    const setup = validateSetup(parsedBody);
    if (typeof setup === 'string') return res.status(400).json({ error: setup });

    const username = req.session?.user?.username ?? 'unknown';
    logger.info(
      {
        user: username,
        action: 'setup-game',
        map: setup.mapName,
        gameType: setup.gameType,
        gameMode: setup.gameMode,
      },
      '[game] action'
    );

    await applySetup(server_id, setup);
    updateRequestedSetupStmt.run(setup.mapName, setup.gameType, setup.gameMode, server_id);

    return res.status(200).json({
      message: 'Game setup commands sent.',
      setup_state: 'requested',
      observed: false,
      requested_setup: {
        game_type: setup.gameType,
        game_mode: setup.gameMode,
        map: setup.mapName,
      },
    });
  } catch (err) {
    sendGameRouteError(res, err, 'setup-game');
    return;
  }
});

//
// === QUICK COMMANDS ===
//
router.post(
  '/api/scramble-teams',
  isAuthenticated,
  makeSimpleCmdRoute('scramble-teams', 'mp_shuffleteams', 'Team scramble command sent.')
);
router.post(
  '/api/kick-all-bots',
  isAuthenticated,
  makeSimpleCmdRoute('kick-all-bots', 'bot_kick all', 'Kick all bots command sent.')
);
router.post(
  '/api/add-bot',
  isAuthenticated,
  makeSimpleCmdRoute('add-bot', 'bot_add', 'Add bot command sent.')
);
router.post(
  '/api/kill-bots',
  isAuthenticated,
  makeSimpleCmdRoute('kill-bots', 'bot_kill', 'Kill bots command sent.')
);

//
// === MATCH SETTINGS TOGGLES ===
//
router.post(
  '/api/limitteams-toggle',
  isAuthenticated,
  makeToggleRoute('limitteams-toggle', 'mp_limitteams')
);
router.post(
  '/api/autoteam-toggle',
  isAuthenticated,
  makeToggleRoute('autoteam-toggle', 'mp_autoteambalance')
);
router.post(
  '/api/friendlyfire-toggle',
  isAuthenticated,
  makeToggleRoute('friendlyfire-toggle', 'mp_friendlyfire')
);
router.post(
  '/api/autokick-toggle',
  isAuthenticated,
  makeToggleRoute('autokick-toggle', 'mp_autokick')
);

//
// === GAME PHASE COMMANDS ===
//
router.post(
  '/api/restart',
  isAuthenticated,
  makeSimpleCmdRoute('restart', 'mp_restartgame 1', 'Restart command sent.')
);
router.post(
  '/api/swap-team',
  isAuthenticated,
  makeSimpleCmdRoute('swap-team', 'mp_swapteams', 'Team swap command sent.')
);
router.post(
  '/api/pause',
  isAuthenticated,
  makeSimpleCmdRoute('pause', 'css_matchzy_pause', 'Pause command sent.')
);
router.post(
  '/api/unpause',
  isAuthenticated,
  makeSimpleCmdRoute('unpause', 'css_matchzy_unpause', 'Unpause command sent.')
);

router.post(
  '/api/start-warmup',
  isAuthenticated,
  makeSequenceRoute(
    'start-warmup',
    ['mp_restartgame 1', { cfg: 'warmup.cfg' }],
    'Warmup command sequence sent.'
  )
);
router.post(
  '/api/start-knife',
  isAuthenticated,
  makeSequenceRoute(
    'start-knife',
    [{ cfg: 'knife.cfg' }, 'css_matchzy_knife'],
    'Knife round command sequence sent.'
  )
);

//

export default router;
