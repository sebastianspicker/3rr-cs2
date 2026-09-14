// Captures the real UI with disposable data and an in-process RCON fixture.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startFixture, login } from '../test/browser/fixture.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
process.chdir(packageRoot);
const output = path.resolve(packageRoot, '../docs/screenshots');
await mkdir(output, { recursive: true });
const fixture = await startFixture();
let browser;
const captures = [];
const errors = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === fixture.url) await route.continue();
    else {
      errors.push('Unexpected external request');
      await route.abort();
    }
  });

  async function capture(file, title, fullPage = false) {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: path.join(output, file), fullPage, animations: 'disabled' });
    captures.push({
      file,
      title,
      route: new URL(page.url()).pathname,
      viewport: page.viewportSize(),
      fullPage,
    });
  }

  await login(page, fixture);
  await expect(page.locator('#fleet-players')).toHaveText('16');
  await page.locator('#server-choice-2').check();
  await capture('01-servers.png', 'Choose an existing server');
  await page.locator('#prepare-selected-server').click();
  await expect(page.locator('#send-setup-commands')).toBeEnabled();
  await expect(page.locator('#live-status-updated')).toContainText('observed at');
  await page.locator('#selectedMap').selectOption('de_mirage');
  await page.locator('#team1').fill('Tigers');
  await page.locator('#team2').fill('Sharks');
  await capture('02-setup.png', 'Review the requested session setup');
  await page.locator('#send-setup-commands').click();
  await expect(page.locator('#session-result-heading')).toBeVisible();
  await expect(page.locator('#session-result-heading')).toHaveText('Setup commands sent');
  await capture('03-commands-sent.png', 'Setup commands sent; live state still needs checking');
  await page.locator('#session-check-map').click();
  await expect(page.locator('#session-result-heading')).toHaveText('Requested map observed');
  await expect(page.locator('#session-observed-map')).toHaveText('de_mirage');
  await capture('04-map-observed.png', 'Compare the requested map with a fresh observation');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture('05-mobile.png', 'Session result on a narrow screen', true);
  expect(errors).toEqual([]);
  await writeFile(
    path.join(output, 'manifest.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source: 'control-plane Express/EJS application',
        data: 'Disposable SQLite and deterministic RCON fixture; no live CS2 server',
        command: 'cd control-plane && npm run build && node scripts/capture-screenshots.mjs',
        browser: `Chromium ${browser.version()}`,
        captures,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Captured ${captures.length} screenshots in docs/screenshots.`);
} finally {
  await browser?.close();
  await fixture.close();
}
