/** Verifies connected, unknown, timed-out, and unavailable status states remain distinct. */
import { login, expect, test } from './panel-fixture';

const mixedServerStatuses = [
  {
    id: 51,
    hostname: 'Observed List Server',
    serverIP: '203.0.113.51',
    serverPort: 27015,
    connected: true,
    authenticated: true,
    status: 'connected',
    observed_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
    status_source: 'rcon_hostname',
    timed_out: false,
    error: null,
  },
  {
    id: 52,
    hostname: '-',
    serverIP: '203.0.113.52',
    serverPort: 27015,
    connected: false,
    authenticated: false,
    status: 'unknown',
    observed_at: null,
    status_source: 'not_observed',
    timed_out: false,
    error: null,
  },
  {
    id: 53,
    hostname: '-',
    serverIP: '203.0.113.53',
    serverPort: 27015,
    connected: true,
    authenticated: true,
    status: 'unknown',
    observed_at: null,
    status_source: 'rcon_hostname',
    timed_out: true,
    error: 'hostname probe timed out',
  },
  {
    id: 54,
    hostname: 'Disconnected List Server',
    serverIP: '203.0.113.54',
    serverPort: 27015,
    connected: false,
    authenticated: false,
    status: 'disconnected',
    observed_at: null,
    status_source: 'rcon_connection',
    timed_out: false,
    error: null,
  },
];

export function registerStatusCases(): void {
  test('servers page keeps unknown live player counts unknown', async ({ page }) => {
    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          servers: [
            {
              id: 42,
              hostname: 'Partial List Server',
              serverIP: '203.0.113.42',
              serverPort: 27015,
              connected: true,
              authenticated: true,
            },
          ],
        }),
      });
    });
    await page.route('**/api/status/42', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          humans: null,
          max_players: 12,
        }),
      });
    });

    await login(page);

    await expect(page.locator('.server-player-count[data-server-id="42"]')).toHaveText('–/12');
  });

  test('servers page renders unknown and timed-out server-list status explicitly', async ({
    page,
  }) => {
    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          servers: mixedServerStatuses,
        }),
      });
    });
    await page.route('**/api/status/51', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ humans: 3, max_players: 12 }),
      });
    });

    await login(page);

    await expect(
      page.locator('.server-card').filter({ hasText: 'Observed List Server' })
    ).toContainText('Connected');
    await expect(page.locator('.server-card').filter({ hasText: '203.0.113.52' })).toContainText(
      'Status unknown'
    );
    await expect(page.locator('.server-card').filter({ hasText: '203.0.113.52' })).toContainText(
      'Server 52'
    );
    await expect(page.locator('.server-card').filter({ hasText: '203.0.113.52' })).toContainText(
      'Not observed'
    );
    await expect(page.getByRole('table', { name: 'Configured servers' })).toBeVisible();
    await expect(page.locator('#serverList')).toHaveAttribute('role', 'rowgroup');
    await expect(page.locator('.server-card').first()).toHaveAttribute('role', 'row');
    await expect(
      page.locator('.server-card').filter({ hasText: '203.0.113.52' })
    ).not.toContainText('Disconnected');
    await expect(page.locator('.server-card').filter({ hasText: '203.0.113.53' })).toContainText(
      'Status timed out'
    );
    await expect(
      page.locator('[aria-describedby="server-53-status-detail"]')
    ).toHaveAccessibleDescription('hostname probe timed out');
    await expect(
      page.locator('.server-card').filter({ hasText: 'Disconnected List Server' })
    ).toContainText('Disconnected');
  });

  test('server-card layout and reduced-motion contracts preserve status visibility', async ({
    page,
  }) => {
    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ servers: mixedServerStatuses }),
      });
    });
    await page.route('**/api/status/51', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ humans: 3, max_players: 12 }),
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);

    const card = page.locator('.server-card').filter({ hasText: 'Observed List Server' });
    await expect(card).toBeVisible();
    const desktopLayout = await card.evaluate((element) => {
      const status = element.querySelector('.server-status-cell');
      const actions = element.querySelector('.server-card-actions');
      const window = element.ownerDocument.defaultView;
      if (!status || !actions || !window) return null;
      return {
        statusAlignment: window.getComputedStyle(status).alignItems,
        actionsRightPadding: window.getComputedStyle(actions).paddingRight,
        actionsMotion: window.getComputedStyle(actions).transitionDuration,
        actionsAnimation: window.getComputedStyle(actions).animationDuration,
        actionsAnimationIterations: window.getComputedStyle(actions).animationIterationCount,
        rootScrollBehavior: window.getComputedStyle(element.ownerDocument.documentElement)
          .scrollBehavior,
      };
    });
    expect(desktopLayout).toEqual({
      statusAlignment: 'center',
      actionsRightPadding: '0px',
      actionsMotion: '1e-05s',
      actionsAnimation: '1e-05s',
      actionsAnimationIterations: '1',
      rootScrollBehavior: 'auto',
    });

    await page.setViewportSize({ width: 800, height: 900 });
    await expect
      .poll(() =>
        card.evaluate(
          (element) => element.ownerDocument.defaultView?.matchMedia('(max-width: 900px)').matches
        )
      )
      .toBe(true);
    await card.evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          const window = element.ownerDocument.defaultView;
          if (!window) return resolve();
          window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
        })
    );
    const mobilePadding = await card.evaluate((element) => {
      const actions = element.querySelector('.server-card-actions');
      const window = element.ownerDocument.defaultView;
      return actions && window ? window.getComputedStyle(actions).paddingTop : null;
    });
    expect(mobilePadding).toBe('12px');
  });

  test('servers page shows status unavailable when live player status fetch fails', async ({
    page,
  }) => {
    await page.route('**/api/servers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          servers: [
            {
              id: 61,
              hostname: 'Degraded Status Server',
              serverIP: '203.0.113.61',
              serverPort: 27015,
              connected: true,
              authenticated: true,
              status: 'connected',
              observed_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
              status_source: 'rcon_hostname',
              timed_out: false,
              error: null,
            },
          ],
        }),
      });
    });
    await page.route('**/api/status/61', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'status unavailable' }),
      });
    });

    await login(page);

    await expect(page.locator('.server-player-count[data-server-id="61"]')).toHaveText(
      'status unavailable'
    );
  });

  test('failed login stays on the login page with a generic error', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('e2eadmin');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByLabel('Password').press('Enter');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('alert')).toHaveText('Invalid credentials');
  });
}
