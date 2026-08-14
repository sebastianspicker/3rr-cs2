/** Verifies management controls preserve partial outcomes and render untrusted data safely. */
import type { Page } from '@playwright/test';
import {
  login,
  seedManageServer,
  seedUser,
  updateRequestedGameSelection,
  confirmModal,
  expect,
  test,
} from './panel-fixture';

interface RequestedSetup {
  gameType: string;
  gameMode: string;
  map: string;
}

async function expectRequestedSetup(
  page: Page,
  serverId: number,
  requestedSetup: RequestedSetup
): Promise<void> {
  await page.goto(`/manage/${serverId}`);
  await expect(page.getByRole('heading', { name: 'Requested Setup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply to server' })).toBeVisible();
  await expect(page.locator('#server_setup_form #send-setup-commands')).toHaveCount(1);
  await expect(page.locator('#gameTypeValue')).toHaveValue(requestedSetup.gameType);
  await expect(page.locator('#gameModeValue')).toHaveValue(requestedSetup.gameMode);
  await expect(page.locator('#selectedMap')).toHaveValue(requestedSetup.map);
  await expect(
    page.locator(`#gameTypeBtns [data-game-type="${requestedSetup.gameType}"]`)
  ).toHaveClass(/btn-active/);
  await expect(
    page.locator(`#gameModeBtns [data-game-mode="${requestedSetup.gameMode}"]`)
  ).toHaveClass(/btn-active/);
}

async function expectFallbackSetup(page: Page, serverId: number): Promise<void> {
  await page.goto(`/manage/${serverId}`);
  await expect(page.locator('#gameTypeValue')).toHaveValue('competitive');
  await expect(page.locator('#gameModeValue')).toHaveValue('competitive');
  await expect(page.locator('#selectedMap')).toHaveValue('de_ancient');
}

export function registerManageCases(): void {
  test('workshop favorite edit, launch, and delete controls call endpoints and update the list', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();
    let favorite = {
      id: 7,
      name: 'Dust Favorite',
      workshop_id: '12345678901',
      created_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
    };
    let favorites = [favorite];
    let favoritePatchBody: Record<string, unknown> | null = null;
    let launchedFavoriteBody: Record<string, unknown> | null = null;
    let deletedFavoriteId: number | null = null;

    await page.route(`**/api/workshop-favorites/${serverId}**`, async (route) => {
      const request = route.request();
      const method = request.method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ favorites }),
        });
        return;
      }
      if (method === 'PATCH') {
        favoritePatchBody = request.postDataJSON() as Record<string, unknown>;
        favorite = {
          ...favorite,
          name: String(favoritePatchBody.name),
          workshop_id: String(favoritePatchBody.workshop_id),
          updated_at: new Date('2026-05-26T10:05:00.000Z').toISOString(),
        };
        favorites = [favorite];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ favorite }),
        });
        return;
      }
      if (method === 'DELETE') {
        const pathParts = new URL(request.url()).pathname.split('/');
        deletedFavoriteId = Number(pathParts[pathParts.length - 1]);
        favorites = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Workshop favorite deleted.' }),
        });
        return;
      }
      await route.continue();
    });
    await page.route('**/api/workshop-map', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      launchedFavoriteBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Workshop favorite launched.' }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await page.locator('details.setup-advanced > summary').click();
    const favoritesList = page.locator('#workshopFavoritesList');
    await expect(favoritesList).toContainText('Dust Favorite');

    await favoritesList.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Workshop favorite name')).toHaveValue('Dust Favorite');
    await expect(page.getByLabel('Workshop favorite ID')).toHaveValue('12345678901');
    await expect(page.locator('#addWorkshopFavorite')).toHaveText('Update');

    await page.getByLabel('Workshop favorite name').fill('Ancient Favorite');
    await page.getByLabel('Workshop favorite ID').fill('22222222222');
    await page.locator('#addWorkshopFavorite').click();
    await expect.poll(() => favoritePatchBody?.name).toBe('Ancient Favorite');
    expect(favoritePatchBody).toMatchObject({
      name: 'Ancient Favorite',
      workshop_id: '22222222222',
    });
    await expect(favoritesList).toContainText('Ancient Favorite');
    await expect(page.locator('#addWorkshopFavorite')).toHaveText('Save');

    await favoritesList.getByRole('button', { name: 'Load' }).click();
    await confirmModal(page, 'Load workshop favorite 22222222222?');
    await expect.poll(() => launchedFavoriteBody?.workshop_id).toBe('22222222222');
    expect(launchedFavoriteBody).toMatchObject({
      server_id: String(serverId),
      workshop_id: '22222222222',
    });
    await expect(page.locator('#cs-toast-container')).toContainText('Workshop favorite launched.');

    await favoritesList.getByRole('button', { name: 'Delete' }).click();
    await confirmModal(page, 'Delete workshop favorite 22222222222?');
    await expect.poll(() => deletedFavoriteId).toBe(7);
    await expect(favoritesList).toContainText('No saved workshop favorites for this server.');
  });

  test('workshop collection controls block invalid IDs and report endpoint outcomes', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();
    const collectionBodies: Record<string, unknown>[] = [];

    await page.route('**/api/workshop-collection', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON() as Record<string, unknown>;
      collectionBodies.push(body);
      if (collectionBodies.length === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'text/plain',
          body: 'upstream failed',
        });
        return;
      }
      if (collectionBodies.length === 2) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'collection import failed' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Collection loaded.' }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await page.locator('details.setup-advanced > summary').click();
    const collectionInput = page.locator('#workshopCollectionId');

    await collectionInput.fill('bad');
    await page.locator('#loadWorkshopCollection').click();
    await expect(page.locator('#cs-toast-container')).toContainText(
      'Collection ID must be 5–20 digits.'
    );
    await expect(page.getByRole('button', { name: 'Dismiss error' })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss error' }).click();
    expect(collectionBodies).toHaveLength(0);

    await collectionInput.fill('33333333333');
    await page.locator('#loadWorkshopCollection').click();
    await confirmModal(page, 'Load workshop collection 33333333333?');
    await expect.poll(() => collectionBodies.length).toBe(1);
    expect(collectionBodies[0]).toMatchObject({
      server_id: String(serverId),
      collection_id: '33333333333',
    });
    await expect(page.locator('#cs-toast-container')).toContainText('Request failed (500)');
    await expect(collectionInput).toHaveValue('33333333333');

    await page.locator('#loadWorkshopCollection').click();
    await confirmModal(page, 'Load workshop collection 33333333333?');
    await expect.poll(() => collectionBodies.length).toBe(2);
    expect(collectionBodies[1]).toMatchObject({
      server_id: String(serverId),
      collection_id: '33333333333',
    });
    await expect(page.locator('#cs-toast-container')).toContainText('collection import failed');
    await expect(collectionInput).toHaveValue('33333333333');

    await page.locator('#loadWorkshopCollection').click();
    await confirmModal(page, 'Load workshop collection 33333333333?');
    await expect.poll(() => collectionBodies.length).toBe(3);
    expect(collectionBodies[2]).toMatchObject({
      server_id: String(serverId),
      collection_id: '33333333333',
    });
    await expect(page.locator('#cs-toast-container')).toContainText('Collection loaded.');
    await expect(collectionInput).toHaveValue('');
  });

  test('admin user list renders usernames as text instead of markup', async ({ page }) => {
    await page.addInitScript(() => {
      (globalThis as unknown as { __adminUserXss: number }).__adminUserXss = 0;
    });
    await login(page);

    const maliciousUsername = 'operator <img src=x onerror="window.__adminUserXss=1">';
    seedUser(maliciousUsername);

    await page.goto('/admin/users');

    const tableBody = page.locator('#user-table-body');
    await expect(tableBody).toContainText(maliciousUsername);
    await expect(tableBody.locator('img')).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(
          () => (globalThis as unknown as { __adminUserXss?: number }).__adminUserXss ?? 0
        )
      )
      .toBe(0);
  });

  test('manage page labels restored setup selections as requested state', async ({ page }) => {
    await login(page);

    const savedServerId = seedManageServer();
    const requestedSetup = {
      gameType: 'fun',
      gameMode: 'ctf',
      map: 'workshop/3555532817/ctf_doublecross',
    };
    updateRequestedGameSelection(savedServerId, requestedSetup);
    await expectRequestedSetup(page, savedServerId, requestedSetup);

    const invalidServerId = seedManageServer();
    updateRequestedGameSelection(invalidServerId, {
      gameType: 'missing-type',
      gameMode: 'missing-mode',
      map: 'missing-map',
    });
    await expectFallbackSetup(page, invalidServerId);
  });

  test('manage page renders partial RCON status without zeroing unknown players', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();

    await page.route('**/api/status/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hostname: 'Partial Status Server',
          map: null,
          humans: null,
          bots: null,
          max_players: 12,
          connected: true,
          authenticated: true,
          partial: true,
          complete: false,
          observed_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
          error: 'status unavailable',
        }),
      });
    });

    await page.goto(`/manage/${serverId}`);

    await expect(page.locator('#live-status-state')).toHaveText('RCON partial');
    await expect(page.locator('#live-players')).toHaveText('–/12');
    await expect(page.locator('#live-max-players')).toHaveText('12');
    await expect(page.locator('#live-status-error')).toContainText('status unavailable');
    const statusColors = await page.locator('#live-status-updated').evaluate((updated) => {
      const error = updated.ownerDocument.getElementById('live-status-error');
      const window = updated.ownerDocument.defaultView;
      return {
        updated: window ? window.getComputedStyle(updated).color : null,
        error: error && window ? window.getComputedStyle(error).color : null,
      };
    });
    expect(statusColors).toEqual({
      updated: 'rgb(139, 151, 168)',
      error: 'rgb(224, 90, 82)',
    });
  });

  test('manage status badges synchronize the initial unknown state with live observations', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();
    let statusRequests = 0;
    let releaseInitialObservation: (() => void) | undefined;
    const initialObservationReleased = new Promise<void>((resolve) => {
      releaseInitialObservation = resolve;
    });
    let initialObservationRequested: (() => void) | undefined;
    const initialObservationStarted = new Promise<void>((resolve) => {
      initialObservationRequested = resolve;
    });

    await page.route(`**/api/status/${serverId}`, async (route) => {
      statusRequests += 1;
      if (statusRequests === 1) {
        initialObservationRequested?.();
        await initialObservationReleased;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            hostname: 'Observed Server',
            map: 'de_dust2',
            humans: 4,
            bots: 0,
            max_players: 12,
            connected: true,
            authenticated: true,
            partial: false,
            complete: true,
            observed_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
            error: null,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hostname: null,
          map: null,
          humans: null,
          bots: null,
          max_players: null,
          connected: true,
          authenticated: true,
          partial: false,
          complete: false,
          observed_at: null,
          error: 'hostname unavailable',
        }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await initialObservationStarted;
    await expect(page.locator('#manage-status-badge')).toHaveText('Status not observed');
    await expect(page.locator('#rcon-console-status-badge')).toHaveText('Status not observed');

    releaseInitialObservation?.();
    await expect(page.locator('#manage-status-dot')).toHaveClass(/online/);
    await expect(page.locator('#manage-status-badge')).toHaveText('RCON authenticated');
    await expect(page.locator('#manage-status-badge')).toHaveClass(/badge-connected/);
    await expect(page.locator('#rcon-console-status-badge')).toHaveText('RCON authenticated');
    await expect(page.locator('#rcon-console-status-badge')).toHaveClass(/badge-connected/);
    await expect(page.locator('#manage-initial-alert')).toBeHidden();
    await expect(page.locator('#truth-rail-map')).toHaveText('de_dust2');
    await expect(page.locator('#truth-rail-players')).toHaveText('4/12');

    await page.locator('#refresh_status').click();
    await expect(page.locator('#manage-status-dot')).toHaveClass(/unknown/);
    await expect(page.locator('#manage-status-badge')).toHaveText('RCON error');
    await expect(page.locator('#manage-status-badge')).toHaveClass(/badge-unknown/);
    await expect(page.locator('#rcon-console-status-badge')).toHaveText('RCON error');
    await expect(page.locator('#rcon-console-status-badge')).toHaveClass(/badge-unknown/);
  });

  test('RCON console renders response text without markup execution or unsafe controls', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();

    await page.route('**/api/rcon', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Command sent, but history was not recorded.',
          output: '<b>&amp;\u202ealready escaped</b>',
          command_sent: true,
          history_recorded: false,
          partial: true,
        }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await page.locator('#rconInput').fill('status');
    await page.locator('#rconInputBtn').click();

    const result = page.locator('#rconResultText');
    await expect(result).toContainText('<b>&amp;already escaped</b>');
    await expect(result.locator('b')).toHaveCount(0);
    expect(await result.textContent()).not.toContain('\u202e');
    await expect(
      page.getByText('Command sent, but history was not recorded.', { exact: true })
    ).toBeVisible();
  });
}
