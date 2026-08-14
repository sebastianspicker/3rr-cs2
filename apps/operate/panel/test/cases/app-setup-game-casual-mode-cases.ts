/** Map-policy scenarios for gungame and deathmatch modes. */
import { test } from 'node:test';
import { assertSetupGameMapCase, type SetupGameMapCase } from '../support/app-setup-game-helpers';

const casualModeCases: SetupGameMapCase[] = [
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
];

export function registerSetupGameCasualModeScenarios(): void {
  for (const setupGameMapCase of casualModeCases) {
    test(setupGameMapCase.name, async () => {
      await assertSetupGameMapCase(setupGameMapCase);
    });
  }
}
