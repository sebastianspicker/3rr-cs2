/** Map-policy scenarios for scoutzknivez and bunnyhop modes. */
import { test } from 'node:test';
import { assertSetupGameMapCase, type SetupGameMapCase } from '../support/app-setup-game-helpers';

const movementModeCases: SetupGameMapCase[] = [
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
];

export function registerSetupGameMovementModeScenarios(): void {
  for (const setupGameMapCase of movementModeCases) {
    test(setupGameMapCase.name, async () => {
      await assertSetupGameMapCase(setupGameMapCase);
    });
  }
}
