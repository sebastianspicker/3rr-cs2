import { test, expect } from '@playwright/test';
import { startFixture, login } from './fixture.mjs';

let fixture;
test.beforeEach(async () => {
  fixture = await startFixture();
});
test.afterEach(async () => {
  await fixture.close();
});

for (const [mode, expected] of [
  ['complete', '16'],
  ['partial', '2 observed · partial'],
  ['unavailable', 'Unavailable'],
]) {
  test(`fleet ${mode} counts and bounded HTTP observations`, async ({ page }) => {
    fixture.state.mode = mode;
    await login(page, fixture);
    await expect(page.locator('#fleet-players')).toHaveText(expected);
    expect(fixture.state.maxActive).toBeLessThanOrEqual(4);
    expect(fixture.state.calls.filter((call) => call.command === 'status')).toHaveLength(8);
  });
}

test('management refresh joins active work and bypasses completed observations', async ({
  page,
}) => {
  await login(page, fixture, '/manage/1');
  await expect(page.locator('#live-status-updated')).toContainText('observed at');
  fixture.state.calls.length = 0;
  fixture.state.delay = 500;
  await page.locator('[data-manage-tab="setup"]').click();
  await page.locator('#refresh_status').click();
  await page.locator('#refresh_status').dispatchEvent('click');
  await expect.poll(() => fixture.state.calls.length).toBe(3);
  await expect.poll(() => fixture.state.active).toBe(0);
  await page.locator('[data-manage-tab="setup"]').click();
  await page.locator('#refresh_status').click();
  await expect.poll(() => fixture.state.calls.length).toBe(6);
});

test('real CSRF rejection and session expiry', async ({ page, context }) => {
  await login(page, fixture, '/manage/1');
  const rejected = await page.request.post(fixture.url + '/api/add-bot', {
    data: { server_id: '1' },
  });
  expect(rejected.status()).toBe(403);
  expect(fixture.state.actions).toHaveLength(0);
  await expect.poll(() => fixture.state.active).toBe(0);
  await page.waitForLoadState('networkidle');
  await context.clearCookies();
  await page.locator('[data-manage-tab="setup"]').click();
  await page.locator('#refresh_status').click();
  await expect(page).toHaveURL(/\?expired=1$/);
  await expect(page.locator('#login-form')).toBeVisible();
});

for (const outcome of ['not_sent', 'unknown']) {
  test(`action ${outcome} retains honest feedback`, async ({ page }) => {
    await login(page, fixture, '/manage/1');
    fixture.state.outcome = outcome;
    await page.locator('[data-manage-tab="console"]').click();
    await page.locator('#rconInput').fill('say fixture');
    await page.locator('#rconInputBtn').click();
    await expect(page.locator('.cs-toast--error')).toContainText(
      outcome === 'not_sent' ? 'Command was not sent' : 'Outcome unknown'
    );
    await expect(page.locator('.cs-toast--error')).not.toContainText('Retry the action');
    expect(fixture.state.actions.filter((action) => action.command === 'say fixture')).toHaveLength(
      1
    );
    expect(
      fixture.state.actions.every((action) =>
        ['say fixture', 'cmdlist', 'cvarlist'].includes(action.command)
      )
    ).toBe(true);
  });
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`keyboard tabs palette and navigation ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await login(page, fixture, '/manage/1');
    await expect(page).toHaveTitle(/3RR/);
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('#live-status-updated')).toContainText('observed at');
    const selected = page.locator('[role="tab"][aria-selected="true"]');
    await selected.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toBeFocused();
    await page.keyboard.press('Control+k');
    await page.getByRole('searchbox', { name: 'Search commands' }).fill('open console');
    await page.keyboard.press('Enter');
    await expect(page.locator('#rconInput')).toBeFocused();
    await page.screenshot({
      path: `/tmp/3rr-cs16-implementation/manage-${viewport.width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    fixture.state.calls.length = 0;
    await page.goto(fixture.url + '/settings');
    await expect(page.locator('#nav-server-list a')).toHaveCount(8);
    expect(fixture.state.calls).toHaveLength(0);
    if (viewport.width < 500) {
      await page.getByRole('button', { name: 'Open account navigation', exact: true }).click();
      await expect(page.locator('#nav-toggle-btn')).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(page.locator('#nav-toggle-btn')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#nav-toggle-btn')).toBeFocused();
    }
    expect(errors).toEqual([]);
  });
}

test('hidden polling suspends requests and discards an obsolete response', async ({ page }) => {
  await login(page, fixture, '/manage/1');
  await expect.poll(() => fixture.state.active).toBe(0);
  await page.clock.install();
  await page.locator('[data-manage-tab="setup"]').click();
  fixture.state.delay = 300;
  await page.locator('#refresh_status').click();
  const observed = await page.locator('#live-status-updated').textContent();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => fixture.state.active).toBe(0);
  expect(await page.locator('#live-status-updated').textContent()).toBe(observed);
  fixture.state.calls.length = 0;
  await page.clock.fastForward(90000);
  expect(fixture.state.calls).toHaveLength(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => fixture.state.active).toBe(0);
  await expect(page.locator('#live-status-updated')).toContainText('observed at');
});

test('structured sequence failure preserves applied and uncertain command details', async () => {
  const { ApiError } = await import('../../web/client/common.ts');
  const details = {
    code: 'RconDeadlineError',
    outcome: 'unknown',
    partial: true,
    applied_commands: ['sv_cheats 1'],
    failed_command: 'bot_kick',
    failed_command_index: 1,
    failure_reason: 'deadline exceeded',
  };
  const error = new ApiError('Sequence failed.', 504, details);
  expect(error.details).toEqual(details);
  expect(error.code).toBe(details.code);
  expect(error.outcome).toBe('unknown');
  expect(error.message).toContain('Applied: sv_cheats 1');
  expect(error.message).toContain('Failed command: bot_kick');
  expect(error.message).toContain('Check server state before sending again');
});
