import { getMapsForMode, mapsConfig } from '../../utils/mapsConfig';
import { execCfg, runGameCmd, sanitizeCfgName, sanitizeString, MAX_TEAM_NAME_LEN } from './helpers';
import type { z } from 'zod';
import type { SetupGameBodySchema } from './matchContracts';

type SetupBody = z.infer<typeof SetupGameBodySchema>;

export interface ValidatedSetup {
  gameType: string;
  gameMode: string;
  mapName: string;
  execFile: string;
  team1: string;
  team2: string;
}

function modeConfig(gameType: string, gameMode: string): { exec: string } | string {
  const type = Object.entries(mapsConfig.gameTypes).find(([name]) => name === gameType)?.[1];
  if (!type) return 'Unknown game type';
  if (type.comingSoon === true) return 'This game type is not yet available';
  const mode = Object.entries(type.gameModes).find(([name]) => name === gameMode)?.[1];
  if (!mode) return 'Unknown game mode';
  if (mode.comingSoon === true) return 'This game mode is not yet available';
  return mode;
}

export function validateSetup(body: SetupBody): ValidatedSetup | string {
  const mode = modeConfig(body.game_type, body.game_mode);
  if (typeof mode === 'string') return mode;
  const mapName = body.selectedMap.trim();
  if (!mapName || !/^[a-zA-Z0-9_./-]+$/.test(mapName)) {
    return 'selectedMap contains invalid characters';
  }
  const allowedMaps = getMapsForMode(body.game_type, body.game_mode);
  if (allowedMaps.length && !allowedMaps.includes(mapName)) {
    return `selectedMap must be one of: ${allowedMaps.join(', ')}`;
  }
  const execFile = sanitizeCfgName(mode.exec);
  if (!execFile) return 'Invalid exec config name';
  return {
    gameType: body.game_type,
    gameMode: body.game_mode,
    mapName,
    execFile,
    team1: sanitizeString(body.team1, MAX_TEAM_NAME_LEN),
    team2: sanitizeString(body.team2, MAX_TEAM_NAME_LEN),
  };
}

export async function applySetup(serverId: string, setup: ValidatedSetup): Promise<void> {
  await execCfg(serverId, setup.execFile);
  if (setup.team1) await runGameCmd(serverId, `mp_teamname_1 "${setup.team1}"`);
  if (setup.team2) await runGameCmd(serverId, `mp_teamname_2 "${setup.team2}"`);
  await runGameCmd(serverId, `changelevel ${setup.mapName}`);
}
