import { test, expect } from '@playwright/test';
import { startFixture, login } from './fixture.mjs';

let fixture;
test.beforeEach(async () => {
  fixture = await startFixture();
});
test.afterEach(async () => fixture.close());

test('fleet search and connection filters preserve fleet totals and avoid probes', async ({
  page,
}) => {
  await login(page, fixture);
  await expect(page.locator('#fleet-players')).toHaveText('16');
  const calls = fixture.state.calls.length;
  await page.locator('#server-search').fill('192.0.2.3');
  await expect(page.locator('#serverList .server-card:visible')).toHaveCount(1);
  await expect(page.locator('#fleet-filter-summary')).toContainText('1 of 8');
  await expect(page.locator('#fleet-total')).toHaveText('8');
  await page.locator('#server-status-filter').selectOption('disconnected');
  await expect(page.locator('#fleet-empty-filter')).toBeVisible();
  await expect(page.locator('#serverList .server-card:visible')).toHaveCount(0);
  await page.locator('#fleet-clear-filters').click();
  await expect(page.locator('#serverList .server-card:visible')).toHaveCount(8);
  await expect(page.locator('#server-search')).toHaveValue('');
  expect(fixture.state.calls.length).toBe(calls);
});

test('explicit fleet refresh retains the search and never overlaps a second refresh', async ({
  page,
}) => {
  await login(page, fixture);
  await expect(page.locator('#fleet-players')).toHaveText('16');
  await page.locator('#server-search').fill('192.0.2.3');
  fixture.state.calls.length = 0;
  fixture.state.delay = 150;
  const inventoryRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/servers') inventoryRequests.push(request.url());
  });
  await page.locator('#fleet-refresh').click();
  await page.locator('#fleet-refresh').dispatchEvent('click');
  await expect(page.locator('#fleet-refresh')).toBeEnabled();
  await expect(page.locator('#serverList .server-card:visible')).toHaveCount(1);
  await expect(page.locator('#fleet-players')).toHaveText('16');
  expect(inventoryRequests.filter((url) => url.includes('refresh=1'))).toHaveLength(1);
  expect(fixture.state.maxActive).toBeLessThanOrEqual(4);
});

test('server removal is disclosed and cancellation preserves the server', async ({ page }) => {
  await login(page, fixture);
  await expect(page.locator('#fleet-players')).toHaveText('16');
  const first = page.locator('#serverList .server-card').first();
  await expect(first.locator('.delete-server')).toBeHidden();
  await first.locator('summary').click();
  await first.locator('.delete-server').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM servers').get().count).toBe(8);
});

test('login errors receive focus and do not discard typed account information', async ({
  page,
}) => {
  await page.goto(fixture.url);
  await page.locator('#username').fill('operator');
  await page.locator('#password').fill('incorrect-fixture-password');
  await page.locator('#login_btn').click();
  await expect(page.locator('#error-msg')).toBeVisible();
  await expect(page.locator('#error-msg')).toBeFocused();
  await expect(page.locator('#username')).toHaveValue('operator');
  await expect(page.locator('#login_btn')).toBeEnabled();
  await page.locator('#password').fill('browser-fixture-password');
  await page.locator('#login_btn').click();
  await expect(page).toHaveURL(/\/servers$/);
});

test('connection verification explains progress and preserves values after rejection', async ({
  page,
}) => {
  await login(page, fixture, '/add-server');
  let finish;
  await page.route('**/api/add-server', async (route) => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'RCON authentication failed.' }),
    });
  });
  await page.locator('#serverIP').fill('cs2.example.test');
  await page.locator('#rconPassword').fill('fixture-only');
  await page.locator('#submitButton').click();
  await expect(page.locator('#submitButton')).toBeDisabled();
  await expect(page.locator('#add-server-cancel')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#add-server-cancel')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#add-server-status')).toContainText('verifying RCON');
  await expect.poll(() => typeof finish).toBe('function');
  finish();
  await expect(page.locator('#add-server-status')).toContainText('RCON authentication failed');
  await expect(page.locator('#add-server-status')).toBeFocused();
  await expect(page.locator('#serverIP')).toHaveValue('cs2.example.test');
  await expect(page.locator('#submitButton')).toBeEnabled();
  expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM servers').get().count).toBe(8);
});

test('settings supports radio keyboard navigation, theme persistence and password mismatch focus', async ({
  page,
}) => {
  await login(page, fixture, '/settings');
  await page.locator('#theme-dark').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#theme-light')).toBeFocused();
  await expect(page.locator('#theme-light')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('#theme-light')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Open account navigation', exact: true }).click();
  await page.locator('#theme-toggle').click();
  await expect(page.locator('#theme-dark')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#current-password').fill('browser-fixture-password');
  await page.locator('#new-password').fill('new-fixture-password');
  await page.locator('#confirm-password').fill('different-fixture-password');
  await page.locator('#change-password-submit').click();
  await expect(page.locator('#confirm-password')).toBeFocused();
  await expect(page.locator('#confirm-password')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#change-password-status')).toContainText('do not match');
});

test('account navigation closes on focus departure and Escape restores the opener', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, fixture, '/manage/1');
  await expect(page.locator('#nav-server-list a')).toHaveCount(8);
  await expect(page.locator('#nav-server-list a[aria-current]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open account navigation', exact: true }).click();
  await page.locator('#nav-links-list a').first().focus();
  await page.locator('#manage-tab-setup').focus();
  await expect(page.locator('#nav-toggle-btn')).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Open account navigation', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#nav-toggle-btn')).toBeFocused();
  await expect(page.locator('#nav-toggle-btn')).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1440, 390]) {
  test(`all workspaces render in both themes without overflow at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, fixture);
    for (const theme of ['dark', 'light']) {
      await page.evaluate((value) => {
        localStorage.setItem('3rr.theme', value);
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const route of ['/servers', '/add-server', '/settings', '/admin/users', '/manage/1']) {
        await page.goto(fixture.url + route);
        await expect(page.locator('#main')).toBeVisible();
        await expect(page).toHaveTitle(/3RR/);
        const tabs = route.startsWith('/manage/')
          ? ['console', 'match', 'players', 'setup']
          : [null];
        for (const tab of tabs) {
          if (tab) await page.locator(`[data-manage-tab="${tab}"]`).click();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${route} ${tab} ${theme}`
          ).toBe(true);
        }
      }
    }
    expect(errors).toEqual([]);
  });
}

test('user creation and deliberate deletion refresh the real account table', async ({ page }) => {
  await login(page, fixture, '/admin/users');
  await page.locator('#new-username').fill('second-operator');
  await page.locator('#new-user-password').fill('another-fixture-password');
  await page.locator('#new-user-server').selectOption('1');
  await page.locator('#add-user-submit').click();
  await expect(page.locator('#add-user-status')).toContainText('User created');
  const row = page.locator('#user-table-body tr').filter({ hasText: 'second-operator' });
  await expect(row).toContainText('Operator');
  await row.getByRole('button', { name: 'Delete user second-operator', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Delete user second-operator', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete user', exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(1);
});

test('a delayed older user-table refresh cannot restore a deleted account', async ({ page }) => {
  fixture.db
    .prepare(
      'INSERT INTO users (username, password, is_admin) SELECT ?, password, 0 FROM users WHERE id = 1'
    )
    .run('temporary-operator');
  await login(page, fixture, '/admin/users');
  const row = page.locator('#user-table-body tr').filter({ hasText: 'temporary-operator' });
  await expect(row).toBeVisible();
  let releaseOld;
  let oldRequestCaptured = false;
  await page.route('**/api/users/list', async (route) => {
    if (oldRequestCaptured) return route.continue();
    oldRequestCaptured = true;
    const response = await route.fetch();
    const body = await response.text();
    await new Promise((resolve) => {
      releaseOld = resolve;
    });
    await route.fulfill({ status: response.status(), contentType: 'application/json', body });
  });
  await page.locator('#refresh-users').click();
  await expect.poll(() => typeof releaseOld).toBe('function');
  await row.getByRole('button', { name: 'Delete user temporary-operator', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete user', exact: true }).click();
  await expect(row).toHaveCount(0);
  releaseOld();
  await expect(page.locator('#refresh-users')).toBeEnabled();
  await expect(row).toHaveCount(0);
  await expect(page.locator('#user-table')).toHaveAttribute('aria-busy', 'false');
});
