import express from 'express';
import isAuthenticated from '../../modules/middleware';
import { requireAuthorizedServerId } from '../../utils/parseServerId';
import logger from '../../utils/logger';
import {
  parseConVarValue,
  sendGameRouteError,
  parseIntBody,
  requireAllowlisted,
  runGameCmd,
  execCfg,
  makeToggleRoute,
  makeSimpleCmdRoute,
  makePresetRoute,
  makeMultiPresetRoute,
} from './helpers';

const router = express.Router();

//
// === PRACTICE CONTROLS ===
//
router.post('/api/cheats-toggle', isAuthenticated, makeToggleRoute('cheats-toggle', 'sv_cheats'));
router.post(
  '/api/free-armor-toggle',
  isAuthenticated,
  makeToggleRoute('free-armor-toggle', 'mp_free_armor')
);
router.post(
  '/api/buy-anywhere-toggle',
  isAuthenticated,
  makeToggleRoute('buy-anywhere-toggle', 'mp_buy_anywhere')
);
router.post(
  '/api/grenade-trajectory-toggle',
  isAuthenticated,
  makeToggleRoute(
    'grenade-trajectory-toggle',
    'sv_grenade_trajectory_prac_pipreview',
    'sv_grenade_trajectory'
  )
);
router.post(
  '/api/show-impacts-toggle',
  isAuthenticated,
  makeToggleRoute('show-impacts-toggle', 'sv_showimpacts')
);

router.post('/api/respawn-toggle', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'respawn-toggle', value },
      '[game] action'
    );
    await Promise.all([
      runGameCmd(server_id, `mp_respawn_on_death_ct ${value}`),
      runGameCmd(server_id, `mp_respawn_on_death_t ${value}`),
    ]);
    return res.status(200).json({ message: `Respawn set to ${value}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'respawn-toggle');
  }
});

router.post(
  '/api/infinite-ammo-toggle',
  isAuthenticated,
  makePresetRoute('infinite-ammo-toggle', 'sv_infinite_ammo', [0, 1, 2])
);

router.post(
  '/api/set-freezetime',
  isAuthenticated,
  makePresetRoute('set-freezetime', 'mp_freezetime', [0, 5, 10, 15, 20])
);

router.post(
  '/api/set-startmoney',
  isAuthenticated,
  makeMultiPresetRoute(
    'set-startmoney',
    [0, 800, 1600, 3200, 16000],
    async (sid, n) => {
      await Promise.all([
        runGameCmd(sid, `mp_startmoney ${n}`),
        runGameCmd(sid, `mp_maxmoney ${Math.max(n, 16000)}`),
      ]);
    },
    (n) => `mp_startmoney set to ${n}`
  )
);

router.post(
  '/api/bot-difficulty',
  isAuthenticated,
  makePresetRoute('bot-difficulty', 'bot_difficulty', [0, 1, 2, 3])
);

//
// === PRACTICE CONTROLS (extended) ===
//
router.post(
  '/api/set-roundtime',
  isAuthenticated,
  makeMultiPresetRoute(
    'set-roundtime',
    [1, 2, 5, 60],
    async (sid, n) => {
      await Promise.all([
        runGameCmd(sid, `mp_roundtime ${n}`),
        runGameCmd(sid, `mp_roundtime_defuse ${n}`),
      ]);
    },
    (n) => `mp_roundtime set to ${n} min`
  )
);

router.post(
  '/api/bot-add-ct',
  isAuthenticated,
  makeSimpleCmdRoute('bot-add-ct', 'bot_add ct', 'CT bot added!')
);
router.post(
  '/api/bot-add-t',
  isAuthenticated,
  makeSimpleCmdRoute('bot-add-t', 'bot_add t', 'T bot added!')
);
router.post(
  '/api/bot-kick-ct',
  isAuthenticated,
  makeSimpleCmdRoute('bot-kick-ct', 'bot_kick ct', 'CT bots kicked!')
);
router.post(
  '/api/bot-kick-t',
  isAuthenticated,
  makeSimpleCmdRoute('bot-kick-t', 'bot_kick t', 'T bots kicked!')
);

const VALID_GIVE_WEAPONS = [
  'weapon_flashbang',
  'weapon_smokegrenade',
  'weapon_hegrenade',
  'weapon_molotov',
  'weapon_decoy',
  'weapon_incgrenade',
] as const;

router.post('/api/give-weapon', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const weapon = req.body?.weapon;
    if (typeof weapon !== 'string' || !(VALID_GIVE_WEAPONS as readonly string[]).includes(weapon)) {
      return res
        .status(400)
        .json({ error: `weapon must be one of: ${VALID_GIVE_WEAPONS.join(', ')}` });
    }
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'give-weapon', weapon },
      '[game] action'
    );
    await runGameCmd(server_id, `give ${weapon}`);
    return res.status(200).json({ message: `Gave ${weapon}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'give-weapon');
  }
});

//
// === SCRIM CONTROLS ===
//
router.post(
  '/api/set-maxrounds',
  isAuthenticated,
  makePresetRoute('set-maxrounds', 'mp_maxrounds', [16, 24, 30])
);

const VALID_OT_ROUNDS = [3, 5, 6] as const;

router.post('/api/set-overtime', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const enable = parseConVarValue(req.body?.enable);
    if (enable === null) {
      return res.status(400).json({ error: 'enable must be 0 or 1' });
    }
    const otRounds = parseIntBody(req.body?.ot_rounds);
    if (
      !requireAllowlisted(
        res,
        otRounds,
        VALID_OT_ROUNDS,
        `ot_rounds must be one of: ${VALID_OT_ROUNDS.join(', ')}`
      )
    )
      return;
    logger.info(
      {
        user: req.session?.user?.username ?? 'unknown',
        action: 'set-overtime',
        enable,
        ot_rounds: otRounds,
      },
      '[game] action'
    );
    await Promise.all([
      runGameCmd(server_id, `mp_overtime_enable ${enable}`),
      runGameCmd(server_id, `mp_overtime_maxrounds ${otRounds}`),
    ]);
    return res
      .status(200)
      .json({ message: `Overtime ${enable ? 'enabled' : 'disabled'} (MR${otRounds})` });
  } catch (err) {
    return sendGameRouteError(res, err, 'set-overtime');
  }
});

//
// === GAME MODIFIER TOGGLES ===
//
router.post(
  '/api/damage-print-toggle',
  isAuthenticated,
  makeToggleRoute('damage-print-toggle', 'mp_damage_print_enable', 'Damage Print')
);

router.post(
  '/api/set-buytime',
  isAuthenticated,
  makePresetRoute('set-buytime', 'mp_buytime', [10, 15, 30, 45, 90])
);

//
// === QUICK PRACTICE COMMANDS ===
//
router.post(
  '/api/noclip',
  isAuthenticated,
  makeSimpleCmdRoute('noclip', 'noclip', 'Noclip toggled!')
);

router.post(
  '/api/rethrow-grenade',
  isAuthenticated,
  makeSimpleCmdRoute('rethrow-grenade', 'sv_rethrow_last_grenade', 'Grenade rethrown!')
);

//
// === GAME MODIFIER TOGGLES (CFG-based) ===
//
router.post('/api/random-rounds-toggle', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'random-rounds-toggle', value },
      '[game] action'
    );
    await execCfg(server_id, value === 1 ? 'random_rounds_on.cfg' : 'random_rounds_off.cfg');
    return res.status(200).json({ message: `Random Rounds ${value ? 'enabled' : 'disabled'}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'random-rounds-toggle');
  }
});

router.post('/api/rtd-toggle', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'rtd-toggle', value },
      '[game] action'
    );
    await execCfg(server_id, value === 1 ? 'rtd_on.cfg' : 'rtd_off.cfg');
    return res.status(200).json({ message: `RTD ${value ? 'enabled' : 'disabled'}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'rtd-toggle');
  }
});

router.post(
  '/api/rtd-force-roll',
  isAuthenticated,
  makeSimpleCmdRoute('rtd-force-roll', 'css_rtd_forceroll', 'Dice rolled for all players!')
);

export default router;
