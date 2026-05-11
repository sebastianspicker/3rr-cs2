import { expect, test, type Page } from '@playwright/test';

async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Username').fill('e2eadmin');
  await page.getByLabel('Password').fill(['e2e', 'password', '12345'].join(''));
  await Promise.all([
    page.waitForURL('**/servers'),
    page.getByRole('button', { name: 'Authenticate' }).click(),
  ]);
}

test('health endpoint reports the built panel as ready', async ({ request }) => {
  const response = await request.get('/api/health');
  const body = (await response.json()) as unknown;

  expect(response.ok()).toBe(true);
  expect(body).toEqual({ ok: true });
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

test('operator sees a validation error when adding an invalid server address', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Add Server' }).click();

  await page.getByLabel('Server IP').fill('not a valid host');
  await page.getByLabel('Server Port').fill('27015');
  await page.getByLabel('RCON Password').fill('not-used-by-validation');
  await page.getByRole('button', { name: 'Add Server' }).click();

  await expect(page.locator('#cs-toast-container')).toContainText(
    'server_ip must be a valid IPv4/IPv6 address or hostname'
  );
});

test('failed login stays on the login page with a generic error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username').fill('e2eadmin');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Authenticate' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials');
});
