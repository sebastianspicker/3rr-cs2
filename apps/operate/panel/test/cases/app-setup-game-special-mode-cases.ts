/** Map-policy scenarios for OITC and 1v1 arena modes. */
import { test } from 'node:test';
import { assertSetupGameMapCase, type SetupGameMapCase } from '../support/app-setup-game-helpers';

const specialModeCases: SetupGameMapCase[] = [
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

export function registerSetupGameSpecialModeScenarios(): void {
  for (const setupGameMapCase of specialModeCases) {
    test(setupGameMapCase.name, async () => {
      await assertSetupGameMapCase(setupGameMapCase);
    });
  }
}
