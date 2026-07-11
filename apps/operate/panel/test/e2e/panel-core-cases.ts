import { login, seedManageServer, confirmModal, expect, test } from './panel-fixture';

export function registerCoreCases(): void {
  test('health endpoint reports built panel liveness and readiness', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = (await response.json()) as { ok?: unknown; ready?: unknown };

    expect(response.ok()).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.ready).toBe(true);
  });

  test('operator can log in, see the server dashboard, and log out', async ({ page }) => {
    await login(page);

    await expect(page.getByRole('heading', { name: 'Servers' })).toBeVisible();
    await expect(page.locator('#serverList')).toContainText('No servers configured yet.');
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'CS2 Panel' })).toBeVisible();
  });

  test('operator sees a validation error when adding an invalid server address', async ({
    page,
  }) => {
    await login(page);
    await page.getByRole('link', { name: 'Add Server' }).click();

    await page.getByLabel('Server IP').fill('not a valid host');
    await page.getByLabel('Server Port').fill('27015');
    await page.getByLabel('RCON Password').fill('not-used-by-validation');
    await page.getByLabel('RCON Password').press('Enter');

    await expect(page.locator('#cs-toast-container')).toContainText(
      'server_ip must be a valid IPv4/IPv6 address or hostname'
    );
  });

  test('manage page exposes RCON-only status, players, favorites, and history states', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();

    await page.goto(`/manage/${serverId}`);

    await expect(page.getByText('Initial RCON status was not observed')).toBeVisible();
    await expect(page.locator('.manage-header')).toContainText('Status not observed');
    await expect(page.getByRole('heading', { name: 'RCON Observed Status' })).toBeVisible();
    await expect(page.locator('#live-status-state')).toContainText('RCON error');
    await expect(page.locator('#live-status-error')).toContainText('status unavailable');
    await expect(page.getByRole('heading', { name: 'RCON Players' })).toBeVisible();
    await expect(page.locator('#players-error')).toContainText('users unavailable');

    await page.getByLabel('Workshop favorite name').fill('E2E Workshop');
    await page.getByLabel('Workshop favorite ID').fill('12345678901');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#workshopFavoritesList')).toContainText('E2E Workshop');

    await page.locator('summary').filter({ hasText: 'RCON Console' }).click();
    await expect(page.locator('#rconHistoryList')).toContainText('No sent RCON commands yet.');
    await expect(page.getByRole('button', { name: 'Suggest' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Add Bot' })).toBeHidden();
    await page.locator('summary').filter({ hasText: 'Quick Commands' }).click();
    await expect(page.getByRole('button', { name: 'Add Bot' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Practice Mode' })).toBeHidden();
    await page.locator('summary').filter({ hasText: 'Practice Controls' }).click();
    await expect(page.getByRole('button', { name: 'Practice Mode' })).toBeVisible();
  });

  test('manage page shows RCON history unavailable when history fetch fails', async ({ page }) => {
    await login(page);
    const serverId = seedManageServer();

    await page.route('**/api/rcon/history/**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'RCON sent-command history unavailable',
          history_state: 'unavailable',
        }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await page.locator('summary').filter({ hasText: 'RCON Console' }).click();

    await expect(page.locator('#rconHistoryList')).toContainText(
      'RCON sent-command history unavailable.'
    );
    await expect(page.locator('#cs-toast-container')).toContainText(
      'RCON sent-command history unavailable'
    );
  });

  test('RCON autocomplete selection uses endpoint suggestions to populate the command input', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();
    let autocompleteUrl: string | null = null;

    await page.route(`**/api/rcon/autocomplete/${serverId}**`, async (route) => {
      autocompleteUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suggestions: ['status', 'stats'],
          observed_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
          error: null,
        }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await page.locator('summary').filter({ hasText: 'RCON Console' }).click();
    await page.locator('#rconInput').fill('sta');
    await page.getByRole('button', { name: 'Suggest' }).click();

    const suggestions = page.locator('#rconSuggestions');
    await expect(suggestions).toContainText('status');
    await expect.poll(() => autocompleteUrl).not.toBeNull();
    const requestedUrl = new URL(autocompleteUrl ?? 'http://invalid.local');
    expect(requestedUrl.searchParams.get('q')).toBe('sta');
    expect(requestedUrl.searchParams.get('refresh')).toBe('1');

    await suggestions.getByRole('button', { name: 'status' }).click();
    await expect(page.locator('#rconInput')).toHaveValue('status');
    await expect(suggestions).toBeHidden();
  });

  test('RCON send disables the send button while posting and renders returned output', async ({
    page,
  }) => {
    await login(page);
    const serverId = seedManageServer();
    let rconBody: Record<string, unknown> | null = null;
    const rconGate: { release?: () => void } = {};

    await page.route('**/api/rcon/history/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ commands: [], history_state: 'available' }),
      });
    });
    await page.route('**/api/rcon', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      rconBody = route.request().postDataJSON() as Record<string, unknown>;
      await new Promise<void>((resolve) => {
        rconGate.release = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Command sent.',
          output: 'hostname: E2E',
          command_sent: true,
          history_recorded: true,
          partial: false,
        }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await page.locator('summary').filter({ hasText: 'RCON Console' }).click();
    await page.locator('#rconInput').fill('status');

    const sendButton = page.locator('#rconInputBtn');
    const sendClick = sendButton.click();
    await expect(sendButton).toBeDisabled();
    await expect.poll(() => rconBody?.command).toBe('status');
    expect(rconBody).toMatchObject({ server_id: String(serverId), command: 'status' });
    const release = rconGate.release;
    if (!release) throw new Error('RCON route was not called');
    release();
    await sendClick;

    await expect(sendButton).toBeEnabled();
    await expect(page.locator('#rconResultText')).toContainText('hostname: E2E');
    await expect(page.locator('#rconInput')).toHaveValue('');
  });

  test('RCON history use and clear update the input and empty state', async ({ page }) => {
    await login(page);
    const serverId = seedManageServer();
    let commands = [
      {
        id: 1,
        command: 'mp_maxrounds 30',
        use_count: 2,
        last_used_at: new Date('2026-05-26T10:00:00.000Z').toISOString(),
      },
    ];
    let clearedHistory = false;

    await page.route(`**/api/rcon/history/${serverId}`, async (route) => {
      if (route.request().method() === 'DELETE') {
        commands = [];
        clearedHistory = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Sent-command history cleared.' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ commands, history_state: 'available' }),
      });
    });

    await page.goto(`/manage/${serverId}`);
    await page.locator('summary').filter({ hasText: 'RCON Console' }).click();

    const historyList = page.locator('#rconHistoryList');
    await expect(historyList).toContainText('mp_maxrounds 30');
    await historyList.getByRole('button', { name: 'Use' }).click();
    await expect(page.locator('#rconInput')).toHaveValue('mp_maxrounds 30');

    await page.locator('#rconHistoryClearBtn').click();
    await confirmModal(page, 'Clear sent RCON command history for this server?');
    await expect.poll(() => clearedHistory).toBe(true);
    await expect(historyList).toContainText('No sent RCON commands yet.');
  });
}
