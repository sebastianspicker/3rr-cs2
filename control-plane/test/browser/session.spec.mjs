import { test, expect } from '@playwright/test';
import { startFixture, login } from './fixture.mjs';

let fixture;
test.beforeEach(async () => {
  fixture = await startFixture();
});
test.afterEach(async () => fixture.close());

async function openSetup(page, serverId = '1') {
  await login(page, fixture);
  await expect(page.locator('#fleet-players')).toHaveText('16');
  await page.locator(`#server-choice-${serverId}`).check();
  await expect(page.locator('#prepare-selected-server')).toHaveAttribute(
    'href',
    `/manage/${serverId}`
  );
  await page.locator('#prepare-selected-server').click();
  await expect(page).toHaveURL(new RegExp(`/manage/${serverId}$`));
  await expect(page.locator('#send-setup-commands')).toBeEnabled();
  await expect(page.locator('#live-status-updated')).toContainText('observed at');
}

async function sendSetup(page) {
  await page.locator('#server_setup_form').evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.locator('#session-result')).toBeVisible();
}

test('server selection prepares a session and sends one ordered setup request', async ({
  page,
}) => {
  const setupRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/setup-game') {
      setupRequests.push(request.postDataJSON());
    }
  });

  await openSetup(page, '2');
  for (const selector of ['#gameTypeValue', '#gameModeValue', '#selectedMap']) {
    await expect(page.locator(selector)).toHaveJSProperty('tagName', 'SELECT');
  }
  await expect(page.locator('#gameTypeValue')).toHaveValue('competitive');
  await expect(page.locator('#gameModeValue')).toHaveValue('competitive');
  await expect(page.locator('#selectedMap')).toHaveValue('de_ancient');
  await page.locator('#selectedMap').selectOption('de_mirage');
  await page.locator('#team1').fill('Tigers');
  await page.locator('#team2').fill('Sharks');
  await expect(page.locator('#setup-review-teams')).toHaveText('Tigers / Sharks');

  await sendSetup(page);

  expect(setupRequests).toEqual([
    {
      server_id: '2',
      game_type: 'competitive',
      game_mode: 'competitive',
      selectedMap: 'de_mirage',
      team1: 'Tigers',
      team2: 'Sharks',
    },
  ]);
  expect(fixture.state.actions).toEqual([
    { id: '2', command: 'exec warmup.cfg' },
    { id: '2', command: 'mp_teamname_1 "Tigers"' },
    { id: '2', command: 'mp_teamname_2 "Sharks"' },
    { id: '2', command: 'changelevel de_mirage' },
  ]);
  expect(
    fixture.state.actions.some(({ command }) => /ready|required|loadmatch/i.test(command))
  ).toBe(false);
  await expect(page.locator('[data-session-requested="team1"]').first()).toHaveText('Tigers');
  await expect(page.locator('[data-session-requested="team2"]').first()).toHaveText('Sharks');

  fixture.state.calls.length = 0;
  const sentActions = [...fixture.state.actions];
  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-result-heading')).toHaveText('Requested map observed');
  await expect(page.locator('#session-observed-map')).toHaveText('de_mirage');
  await expect(page.locator('#session-observed-players')).toHaveText('2 humans · 0 bots');
  await expect(page.locator('#session-observed-result')).toContainText('Not reported');
  expect(fixture.state.calls.map(({ command }) => command).sort()).toEqual([
    'hostname',
    'status',
    'sv_visiblemaxplayers',
  ]);
  expect(fixture.state.actions).toEqual(sentActions);

  await page.locator('#session-return').click();
  await expect(page.locator('#requested-setup')).toBeVisible();
  await page.locator('#selectedMap').selectOption('de_nuke');
  await sendSetup(page);
  await expect(page.locator('#session-previous-map')).toHaveText('de_mirage');
  await expect(page.locator('#session-observation-state')).toHaveText('Awaiting a new observation');
  await expect(page.locator('#session-observed-result')).toBeHidden();
});

test('a mismatched or partial observation does not claim the setup was confirmed', async ({
  page,
}) => {
  await openSetup(page);
  await page.locator('#selectedMap').selectOption('de_mirage');
  await sendSetup(page);
  fixture.state.maps['1'] = 'de_dust2';
  fixture.cache.invalidateServer('1');
  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-result-heading')).toHaveText('Requested map not confirmed');
  await expect(page.locator('#session-observed-map')).toHaveText('de_dust2');
  await expect(page.locator('#session-return')).toBeHidden();
  await expect(page.locator('#session-edit-setup')).toBeVisible();

  await page.locator('#session-edit-setup').click();
  fixture.state.humans = null;
  fixture.cache.invalidateServer('1');
  await page.locator('#selectedMap').selectOption('de_nuke');
  await sendSetup(page);
  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-observed-map')).toHaveText('de_nuke');
  await expect(page.locator('#session-observed-players')).toHaveText(
    'Unknown humans · unknown bots'
  );
});

test('an uncertain setup failure is not resent when the operator checks live state', async ({
  page,
}) => {
  await openSetup(page);
  fixture.state.outcome = 'unknown';
  await page.locator('#selectedMap').selectOption('de_mirage');
  await sendSetup(page);
  await expect(page.locator('#session-result-heading')).toHaveText('Setup may be incomplete');
  await expect(page.locator('#session-result-error')).toContainText('Outcome unknown');
  await expect(page.locator('#session-result-description')).toContainText(
    'Check server state before sending setup again'
  );
  expect(fixture.state.actions).toEqual([{ id: '1', command: 'exec warmup.cfg' }]);

  fixture.state.calls.length = 0;
  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-result-heading')).toHaveText('Requested map not confirmed');
  await expect(page.locator('#session-result-error')).toContainText('setup request failed');
  expect(fixture.state.actions).toEqual([{ id: '1', command: 'exec warmup.cfg' }]);
  expect(fixture.state.calls.map(({ command }) => command).sort()).toEqual([
    'hostname',
    'status',
    'sv_visiblemaxplayers',
  ]);
});

test('a completed observation from an older submission cannot replace the newer result', async ({
  page,
}) => {
  let releaseOldObservation;
  let capturedOldObservation = false;
  await page.route(
    (url) => url.pathname === '/api/status/1' && url.search === '?refresh=1',
    async (route) => {
      if (capturedOldObservation) {
        await route.continue();
        return;
      }
      capturedOldObservation = true;
      const response = await route.fetch();
      const body = await response.text();
      await new Promise((resolve) => {
        releaseOldObservation = resolve;
      });
      await route.fulfill({ response, body });
    }
  );

  await openSetup(page);
  await page.locator('#selectedMap').selectOption('de_mirage');
  await sendSetup(page);
  await page.locator('#session-check-map').click();
  await expect.poll(() => typeof releaseOldObservation).toBe('function');

  await page.locator('#session-edit-setup').click();
  await page.locator('#selectedMap').selectOption('de_nuke');
  await sendSetup(page);
  await expect(page.locator('#session-result-heading')).toHaveText('Setup commands sent');
  await expect(page.locator('[data-session-requested="selectedMap"]').first()).toHaveText(
    'de_nuke'
  );

  releaseOldObservation();
  await expect(page.locator('#session-check-map')).toBeEnabled();
  await expect(page.locator('#session-result-heading')).toHaveText('Setup commands sent');
  await expect(page.locator('#session-pending-result')).toBeVisible();
  await expect(page.locator('#session-observed-result')).toBeHidden();
  await expect(page.locator('#session-return')).toBeHidden();

  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-result-heading')).toHaveText('Requested map observed');
  await expect(page.locator('#session-observed-map')).toHaveText('de_nuke');
});

test('a matching map after setup failure still leaves the recovery path available', async ({
  page,
}) => {
  await openSetup(page);
  fixture.state.outcome = 'unknown';
  await page.locator('#selectedMap').selectOption('de_dust2');
  await sendSetup(page);
  await expect(page.locator('#session-result-heading')).toHaveText('Setup may be incomplete');
  await expect(page.locator('#session-result-error')).toContainText('Outcome unknown');

  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-result-heading')).toHaveText('Requested map observed');
  await expect(page.locator('#session-observed-map')).toHaveText('de_dust2');
  await expect(page.locator('#session-result-error')).toContainText('setup request failed');
  await expect(page.locator('#session-edit-setup')).toBeVisible();
  await expect(page.locator('#session-return')).toBeHidden();
  expect(fixture.state.actions).toEqual([{ id: '1', command: 'exec warmup.cfg' }]);
});

test('a stale dependent choice response cannot replace the latest selection', async ({ page }) => {
  let releaseCasual;
  await page.route('**/api/game-types/casual/game-modes', async (route) => {
    await new Promise((resolve) => {
      releaseCasual = resolve;
    });
    await route.continue();
  });
  await openSetup(page);
  await page.locator('#gameTypeValue').selectOption('casual');
  await expect.poll(() => typeof releaseCasual).toBe('function');
  await page.locator('#gameTypeValue').selectOption('fun');
  await expect(page.locator('#gameModeValue')).toHaveValue('bunnyhop');
  await expect(page.locator('#selectedMap')).toHaveValue('workshop/3077211069/bhop_at_night');
  releaseCasual();
  await expect(page.locator('#send-setup-commands')).toBeEnabled();
  await expect(page.locator('#gameTypeValue')).toHaveValue('fun');
  await expect(page.locator('#gameModeValue')).toHaveValue('bunnyhop');
  await expect(page.locator('#selectedMap')).toHaveValue('workshop/3077211069/bhop_at_night');
});

test('failed setup choices stay disabled and can be retried', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/game-types/competitive/game-modes', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });
  await login(page, fixture, '/manage/1');
  await expect(page.locator('#setup-status')).toContainText('could not be loaded');
  await expect(page.locator('#setup-retry')).toBeVisible();
  await expect(page.locator('#selectedMap')).toBeDisabled();
  await expect(page.locator('#send-setup-commands')).toBeDisabled();
  await page.locator('#setup-retry').click();
  await expect(page.locator('#send-setup-commands')).toBeEnabled();
  await expect(page.locator('#gameModeValue')).toHaveValue('competitive');
  await expect(page.locator('#selectedMap')).toHaveValue('de_ancient');
  expect(attempts).toBe(2);
});

test('the primary session flow has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSetup(page);
  await page.locator('#selectedMap').selectOption('de_mirage');
  await sendSetup(page);
  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-result-heading')).toHaveText('Requested map observed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '/tmp/3rr-cs16-implementation/session-mobile.png',
    fullPage: true,
  });
});
