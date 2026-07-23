import { test } from 'node:test';
import { assertSetupGameMapCase, type SetupGameMapCase } from './app-setup-game-helpers';

const SETUP_GAME_MAP_CASES: SetupGameMapCase[] = [
  {
    name: 'POST /api/setup-game: scoutzknivez rejects non-scoutz map',
    gameType: 'fun',
    gameMode: 'scoutzknivez',
    selectedMap: 'de_mirage',
    expectedStatus: 400,
  },
  {
    name: 'POST /api/setup-game: scoutzknivez accepts scoutz map',
    gameType: 'fun',
    gameMode: 'scoutzknivez',
    selectedMap: 'workshop/3073929825/scoutzknivez_pure_cs2',
    expectedStatus: 200,
  },
  {
    name: 'POST /api/setup-game: bhop rejects non-bhop map',
    gameType: 'fun',
    gameMode: 'bunnyhop',
    selectedMap: 'de_mirage',
    expectedStatus: 400,
  },
  {
    name: 'POST /api/setup-game: bhop accepts bhop map',
    gameType: 'fun',
    gameMode: 'bunnyhop',
    selectedMap: 'workshop/3077211069/bhop_at_night',
    expectedStatus: 200,
  },
  {
    name: 'POST /api/setup-game: gungame rejects map not in gungame pool',
    gameType: 'casual',
    gameMode: 'gungame',
    selectedMap: 'de_shorttrain',
    expectedStatus: 400,
  },
  {
    name: 'POST /api/setup-game: gungame accepts gungame map',
    gameType: 'casual',
    gameMode: 'gungame',
    selectedMap: 'ar_shoots',
    expectedStatus: 200,
  },
  {
    name: 'POST /api/setup-game: deathmatch rejects map not in active pool',
    gameType: 'casual',
    gameMode: 'deathmatch',
    selectedMap: 'de_shorttrain',
    expectedStatus: 400,
  },
  {
    name: 'POST /api/setup-game: deathmatch accepts active duty map',
    gameType: 'casual',
    gameMode: 'deathmatch',
    selectedMap: 'de_mirage',
    expectedStatus: 200,
  },
  {
    name: 'POST /api/setup-game: oitc rejects map not in oitc pool',
    gameType: 'fun',
    gameMode: 'oitc',
    selectedMap: 'de_shorttrain',
    expectedStatus: 400,
  },
  {
    name: 'POST /api/setup-game: oitc accepts oitc map',
    gameType: 'fun',
    gameMode: 'oitc',
    selectedMap: 'de_dust2',
    expectedStatus: 200,
  },
  {
    name: 'POST /api/setup-game: 1v1arenas rejects non-arena map',
    gameType: 'fun',
    gameMode: '1v1arenas',
    selectedMap: 'de_mirage',
    expectedStatus: 400,
  },
  {
    name: 'POST /api/setup-game: 1v1arenas accepts arena map',
    gameType: 'fun',
    gameMode: '1v1arenas',
    selectedMap: 'workshop/3070581293/de_bank',
    expectedStatus: 200,
  },
];

for (const setupGameMapCase of SETUP_GAME_MAP_CASES) {
  test(setupGameMapCase.name, async () => {
    await assertSetupGameMapCase(setupGameMapCase);
  });
}
