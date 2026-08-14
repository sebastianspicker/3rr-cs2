/** Setup-game mode-specific acceptance, rejection, and ordering scenarios. */
import { test } from 'node:test';
import {
  rconCommands,
  resetRconCommands,
  setFailingRconCommands,
  assert,
} from '../support/app-fixture';
import { assertSetupGameMapCase, submitSetupGame } from '../support/app-setup-game-helpers';

export function registerSetupGameEdgeScenarios(): void {
  test('POST /api/setup-game: wingman rejects active-duty map (de_mirage not in mg_wingman)', async () => {
    await assertSetupGameMapCase({
      name: 'wingman rejects active-duty map',
      gameType: 'competitive',
      gameMode: 'wingman',
      selectedMap: 'de_mirage',
      expectedStatus: 400,
    });
  });

  test('POST /api/setup-game: wingman accepts wingman map', async () => {
    await assertSetupGameMapCase({
      name: 'wingman accepts wingman map',
      gameType: 'competitive',
      gameMode: 'wingman',
      selectedMap: 'de_overpass',
      expectedStatus: 200,
    });
  });

  test('POST /api/setup-game does not change map when execCfg fails', async () => {
    try {
      resetRconCommands();
      setFailingRconCommands(['exec wingman.cfg']);
      const res = await submitSetupGame({
        gameType: 'competitive',
        gameMode: 'wingman',
        selectedMap: 'de_overpass',
        team1: 'Alpha',
        team2: 'Bravo',
      });

      assert.equal(res.status, 500);
      assert.equal(rconCommands.includes('exec wingman.cfg'), true);
      assert.equal(
        rconCommands.some((command) => command.startsWith('changelevel ')),
        false
      );
    } finally {
      setFailingRconCommands([]);
      resetRconCommands();
    }
  });

  test('POST /api/setup-game: ctf rejects non-ctf map', async () => {
    await assertSetupGameMapCase({
      name: 'ctf rejects non-ctf map',
      gameType: 'fun',
      gameMode: 'ctf',
      selectedMap: 'de_mirage',
      expectedStatus: 400,
    });
  });

  test('POST /api/setup-game: ctf accepts ctf map', async () => {
    await assertSetupGameMapCase({
      name: 'ctf accepts ctf map',
      gameType: 'fun',
      gameMode: 'ctf',
      selectedMap: 'workshop/3555531615/ctf_2fort',
      expectedStatus: 200,
    });
  });
}
