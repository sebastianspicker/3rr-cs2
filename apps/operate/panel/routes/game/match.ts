import express from 'express';
import { z } from 'zod';
import rcon from '../../modules/rcon';
import isAuthenticated from '../../modules/middleware';
import { better_sqlite_client } from '../../db';
import { requireAuthorizedServerId } from '../../utils/parseServerId';
import { getMapsForMode, mapsConfig } from '../../utils/mapsConfig';
import logger from '../../utils/logger';
import {
  sanitizeString,
  sanitizeBackupFileName,
  sanitizeCfgName,
  isRconCommandAllowed,
  sendGameRouteError,
  runGameCmd,
  execCfg,
  makeToggleRoute,
  makeSimpleCmdRoute,
  makeSequenceRoute,
  MAX_TEAM_NAME_LEN,
  MAX_SAY_MESSAGE_LEN,
  MAX_RCON_COMMAND_LEN,
  RCON_BLOCKED_COMMANDS,
} from './helpers';

const router = express.Router();

const updateServerStmt = better_sqlite_client.prepare(`
  UPDATE servers
     SET last_map        = ?,
         last_game_type  = ?,
         last_game_mode  = ?
   WHERE id = ?
`);

const SetupGameBodySchema = z.object({
  game_type: z.string().min(1),
  game_mode: z.string().min(1),
  selectedMap: z.string().min(1),
  team1: z.string().optional(),
  team2: z.string().optional(),
});

const WorkshopMapBodySchema = z.object({
  workshop_id: z.string().regex(/^\d{5,20}$/, 'workshop_id must be 5-20 digits'),
});

const RestoreRoundBodySchema = z.object({
  round_number: z.number().int().min(1).max(99),
});

const MatchzyReadyRequiredBodySchema = z.object({
  value: z.number().int().min(0).max(10),
});

const MatchzyCoachBodySchema = z.object({
  side: z.enum(['ct', 't']),
});

const MatchFileBodySchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_.-]+\.json$/, 'filename must be a .json file with safe characters'),
});

const PlayerUserIdBodySchema = z.object({
  userid: z
    .string()
    .regex(/^\d{1,4}$/, 'userid must be 1\u20134 digits (use `status` in RCON to find it)'),
});

const PlayerSteamId64BodySchema = z.object({
  steamid: z.string().regex(/^\d{17}$/, 'steamid must be exactly 17 digits (SteamID64)'),
});

const MapGroupBodySchema = z.object({
  group: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_]+$/, 'group must contain only alphanumeric characters and underscores'),
});

const WorkshopCollectionBodySchema = z.object({
  collection_id: z.string().regex(/^\d{5,20}$/, 'collection_id must be 5\u201320 digits'),
});

//
// === SETUP / CREATE MATCH ===
//
router.post('/api/setup-game', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = SetupGameBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { game_type, game_mode, selectedMap, team1 = '', team2 = '' } = parseResult.data;
    const gt = mapsConfig.gameTypes?.[game_type];
    if (!gt) {
      return res.status(400).json({ error: 'Unknown game type' });
    }
    if ('comingSoon' in gt && gt.comingSoon) {
      return res.status(400).json({ error: 'This game type is not yet available' });
    }
    const gm = gt.gameModes?.[game_mode];
    if (!gm) {
      return res.status(400).json({ error: 'Unknown game mode' });
    }
    if ('comingSoon' in gm && gm.comingSoon) {
      return res.status(400).json({ error: 'This game mode is not yet available' });
    }
    const allowedMaps = getMapsForMode(game_type, game_mode);
    const mapName =
      typeof selectedMap === 'string' && selectedMap.trim().length > 0 ? selectedMap.trim() : '';
    // Allow alphanumeric, underscore, hyphen, dot, and forward-slash (for workshop/id/name paths).
    const VALID_MAP_NAME_RE = /^[a-zA-Z0-9_./-]+$/;
    if (!mapName || !VALID_MAP_NAME_RE.test(mapName)) {
      return res.status(400).json({ error: 'selectedMap contains invalid characters' });
    }
    if (allowedMaps.length > 0 && !allowedMaps.includes(mapName)) {
      return res.status(400).json({
        error: `selectedMap must be one of: ${allowedMaps.join(', ')}`,
      });
    }

    // Validate cfg name before sending any RCON commands so we never leave the
    // server in a half-applied state (map changed, CFG not loaded).
    const execFile = sanitizeCfgName(gm.exec);
    if (!execFile) {
      return res.status(400).json({ error: 'Invalid exec config name' });
    }

    const t1 = sanitizeString(team1, MAX_TEAM_NAME_LEN);
    const t2 = sanitizeString(team2, MAX_TEAM_NAME_LEN);

    const username = req.session?.user?.username ?? 'unknown';
    logger.info(
      {
        user: username,
        action: 'setup-game',
        map: mapName,
        gameType: game_type,
        gameMode: game_mode,
      },
      '[game] action'
    );

    if (t1) await runGameCmd(server_id, `mp_teamname_1 "${t1}"`);
    if (t2) await runGameCmd(server_id, `mp_teamname_2 "${t2}"`);

    await runGameCmd(server_id, `changelevel ${mapName}`);
    await execCfg(server_id, execFile);

    updateServerStmt.run(mapName, game_type, game_mode, server_id);

    return res.status(200).json({ message: 'Game Created!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'setup-game');
  }
});

//
// === QUICK COMMANDS ===
//
router.post(
  '/api/scramble-teams',
  isAuthenticated,
  makeSimpleCmdRoute('scramble-teams', 'mp_shuffleteams', 'Teams scrambled!')
);
router.post(
  '/api/kick-all-bots',
  isAuthenticated,
  makeSimpleCmdRoute('kick-all-bots', 'bot_kick all', 'All bots kicked!')
);
router.post(
  '/api/add-bot',
  isAuthenticated,
  makeSimpleCmdRoute('add-bot', 'bot_add', 'Bot added!')
);
router.post(
  '/api/kill-bots',
  isAuthenticated,
  makeSimpleCmdRoute('kill-bots', 'bot_kill', 'Bots killed!')
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
  makeSimpleCmdRoute('restart', 'mp_restartgame 1', 'Game restarted')
);
router.post(
  '/api/swap-team',
  isAuthenticated,
  makeSimpleCmdRoute('swap-team', 'mp_swapteams', 'Teams swapped!')
);
router.post(
  '/api/pause',
  isAuthenticated,
  makeSimpleCmdRoute('pause', 'css_matchzy_pause', 'Game paused')
);
router.post(
  '/api/unpause',
  isAuthenticated,
  makeSimpleCmdRoute('unpause', 'css_matchzy_unpause', 'Game unpaused')
);

router.post(
  '/api/start-warmup',
  isAuthenticated,
  makeSequenceRoute('start-warmup', ['mp_restartgame 1', { cfg: 'warmup.cfg' }], 'Warmup started!')
);
router.post(
  '/api/start-knife',
  isAuthenticated,
  makeSequenceRoute(
    'start-knife',
    [{ cfg: 'knife.cfg' }, 'css_matchzy_knife'],
    'Knife round started!'
  )
);

//
// === ROUND BACKUPS ===
//
router.post('/api/list-backups', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'list-backups' },
      '[game] action'
    );
    const text = await rcon.executeCommand(server_id, 'mp_backup_restore_list_files');
    return res.status(200).json({ message: text || 'No backups found' });
  } catch (err) {
    return sendGameRouteError(res, err, 'list-backups');
  }
});

router.post('/api/restore-round', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = RestoreRoundBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const n = parseResult.data.round_number;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'restore-round', round: n },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_restore ${n}`);
    return res.status(200).json({ message: 'Round restored!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'restore-round');
  }
});

router.post('/api/restore-latest-backup', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'restore-latest-backup' },
      '[game] action'
    );
    const text = await rcon.executeCommand(server_id, 'mp_backup_round_file_last');
    const rawFile = text ? text.split('=')[1]?.trim() : null;
    const lastFile = sanitizeBackupFileName(rawFile);
    if (lastFile) {
      await runGameCmd(server_id, `mp_backup_restore_load_file ${lastFile}`);
      await runGameCmd(server_id, 'css_matchzy_pause');
      return res.status(200).json({ message: `Latest round restored (${lastFile})` });
    }
    return res.status(200).json({ message: 'No latest backup found!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'restore-latest-backup');
  }
});

//
// === MATCHZY COMMANDS ===
//
router.post(
  '/api/matchzy-match',
  isAuthenticated,
  makeSequenceRoute(
    'matchzy-match',
    [{ cfg: 'live.cfg' }, 'css_matchzy_loadmatch'],
    'Match started via MatchZy!'
  )
);
router.post(
  '/api/matchzy-practice',
  isAuthenticated,
  makeSimpleCmdRoute('matchzy-practice', 'css_matchzy_practice', 'Practice mode enabled!')
);
router.post(
  '/api/matchzy-exitprac',
  isAuthenticated,
  makeSequenceRoute(
    'matchzy-exitprac',
    ['css_matchzy_exitprac', { cfg: 'warmup.cfg' }],
    'Exited practice mode!'
  )
);
router.post(
  '/api/matchzy-playout',
  isAuthenticated,
  makeSimpleCmdRoute('matchzy-playout', 'css_matchzy_playout', 'Playout enabled!')
);

router.post('/api/matchzy-readyrequired', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = MatchzyReadyRequiredBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const n = parseResult.data.value;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'matchzy-readyrequired', value: n },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_readyrequired ${n}`);
    return res.status(200).json({ message: `Ready required set to ${n}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'matchzy-readyrequired');
  }
});

router.post(
  '/api/matchzy-abort',
  isAuthenticated,
  makeSequenceRoute('matchzy-abort', ['css_matchzy_abort', { cfg: 'warmup.cfg' }], 'Match aborted!')
);

router.post('/api/matchzy-coach', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = MatchzyCoachBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { side } = parseResult.data;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'matchzy-coach', side },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_coach ${side}`);
    return res.status(200).json({ message: `Coach assigned to ${side.toUpperCase()}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'matchzy-coach');
  }
});

router.post('/api/matchzy-load-match-file', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = MatchFileBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { filename } = parseResult.data;
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
    return res.status(200).json({ message: `Loading match from ${filename}...` });
  } catch (err) {
    return sendGameRouteError(res, err, 'matchzy-load-match-file');
  }
});

//
// === PLAYER MANAGEMENT ===
//
router.post('/api/player-kick', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = PlayerUserIdBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { userid } = parseResult.data;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'player-kick', userid },
      '[game] action'
    );
    await runGameCmd(server_id, `kickid ${userid}`);
    return res.status(200).json({ message: `Player ${userid} kicked` });
  } catch (err) {
    return sendGameRouteError(res, err, 'player-kick');
  }
});

router.post('/api/player-mute', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = PlayerSteamId64BodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { steamid } = parseResult.data;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'player-mute', steamid },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_mute ${steamid}`);
    return res.status(200).json({ message: `Player ${steamid} muted` });
  } catch (err) {
    return sendGameRouteError(res, err, 'player-mute');
  }
});

router.post('/api/player-unmute', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = PlayerSteamId64BodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { steamid } = parseResult.data;
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'player-unmute', steamid },
      '[game] action'
    );
    await runGameCmd(server_id, `css_matchzy_unmute ${steamid}`);
    return res.status(200).json({ message: `Player ${steamid} unmuted` });
  } catch (err) {
    return sendGameRouteError(res, err, 'player-unmute');
  }
});

//
// === WORKSHOP MAP ===
//
router.post('/api/workshop-map', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = WorkshopMapBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const workshopId = parseResult.data.workshop_id;
    const username = req.session?.user?.username ?? 'unknown';
    logger.info(
      { user: username, action: 'workshop-map', workshop_id: workshopId },
      '[game] action'
    );
    await runGameCmd(server_id, `host_workshop_map ${workshopId}`);
    return res.status(200).json({ message: `Loading workshop map ${workshopId}...` });
  } catch (err) {
    return sendGameRouteError(res, err, 'workshop-map');
  }
});

//
// === MAP GROUP ===
//
router.post('/api/set-mapgroup', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = MapGroupBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { group } = parseResult.data;
    if (!mapsConfig.mapGroups[group]) {
      return res.status(400).json({ error: `Unknown map group: ${group}` });
    }
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', action: 'set-mapgroup', group },
      '[game] action'
    );
    await runGameCmd(server_id, `mp_mapgroupname ${group}`);
    return res.status(200).json({ message: `Map group set to ${group}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'set-mapgroup');
  }
});

//
// === WORKSHOP COLLECTION ===
//
router.post('/api/workshop-collection', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const parseResult = WorkshopCollectionBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res
        .status(400)
        .json({ error: parseResult.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { collection_id } = parseResult.data;
    logger.info(
      {
        user: req.session?.user?.username ?? 'unknown',
        action: 'workshop-collection',
        collection_id,
      },
      '[game] action'
    );
    await runGameCmd(server_id, `host_workshop_collection ${collection_id}`);
    return res.status(200).json({ message: `Loading workshop collection ${collection_id}...` });
  } catch (err) {
    return sendGameRouteError(res, err, 'workshop-collection');
  }
});

//
// === RCON / SAY ===
//
router.post('/api/rcon', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const command = req.body?.command;
    if (!isRconCommandAllowed(command)) {
      return res.status(400).json({
        error: `Command not allowed (single command only, max ${MAX_RCON_COMMAND_LEN} chars, blocked: ${RCON_BLOCKED_COMMANDS.join(', ')})`,
      });
    }
    const cmdVerb = typeof command === 'string' ? (command.trim().split(/\s+/)[0] ?? '') : '';
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', cmd: cmdVerb },
      '[rcon] user command'
    );
    const resp = await rcon.executeCommand(
      server_id,
      typeof command === 'string' ? command.trim() : ''
    );
    return res.status(200).json({ message: 'Command sent.', output: resp || undefined });
  } catch (err) {
    return sendGameRouteError(res, err, 'rcon');
  }
});

router.post('/api/say-admin', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireAuthorizedServerId(req, res);
    if (!server_id) return;
    const text = sanitizeString(req.body?.message, MAX_SAY_MESSAGE_LEN);
    if (!text) {
      return res.status(400).json({
        error: 'message is required and must be non-empty after sanitization',
      });
    }
    logger.info(
      { user: req.session?.user?.username ?? 'unknown', text },
      '[rcon] say-admin command'
    );
    await rcon.executeCommand(server_id, `say "${text}"`);
    return res.status(200).json({ message: 'Message sent!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'say-admin');
  }
});

export default router;
