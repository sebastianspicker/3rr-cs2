/** Captures sanitized public documentation views from an isolated local panel. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { chromium } from '@playwright/test';

const panelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '3rr-screenshot-'));
const dbPath = path.join(tempDir, '3rr.db');
const captureDir = path.join(tempDir, 'captures');
const screenshotDir = path.join(panelRoot, 'docs', 'screenshots');
const port = '3217';
const username = ['docs', 'operator'].join('-');
const password = ['docs', 'password', '12345'].join('-');
const captureSettleMs = 250;

fs.mkdirSync(captureDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });

const app = spawn(process.execPath, ['dist/app.js'], {
  cwd: panelRoot,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: port,
    DB_PATH: dbPath,
    SESSION_SECRET: ['3rr', 'local', 'screenshot', 'session', 'secret'].join('-'),
    RCON_SECRET_KEY: '01'.repeat(32),
    ALLOW_DEFAULT_CREDENTIALS: 'true',
    DEFAULT_USERNAME: username,
    DEFAULT_PASSWORD: password,
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const appClosed = new Promise((resolve) => app.once('close', resolve));

async function waitForApp() {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Panel startup timed out')), 20_000);
    app.once('error', reject);
    app.once('exit', (code) => reject(new Error(`Panel exited before capture (${code})`)));
    app.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Server is running')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function prepareForCapture(page, readySelector) {
  await page.locator(readySelector).waitFor({ state: 'visible' });
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'instant' }));
  await page.waitForTimeout(captureSettleMs);
}

async function assertViewportFit(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollLeft: window.scrollX,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.clientWidth + 1) {
    throw new Error(
      `${label} overflows horizontally (${dimensions.scrollWidth}px > ${dimensions.clientWidth}px)`
    );
  }
  if (dimensions.scrollLeft !== 0) {
    throw new Error(`${label} starts horizontally scrolled by ${dimensions.scrollLeft}px`);
  }
}

async function assertElementNotClipped(page, selector, label) {
  const bounds = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.left < 0 ||
    bounds.top < 0 ||
    bounds.right > bounds.viewportWidth ||
    bounds.bottom > bounds.viewportHeight
  ) {
    throw new Error(`${label} is clipped: ${JSON.stringify(bounds)}`);
  }
}

let browser;
try {
  await waitForApp();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const baseUrl = `http://127.0.0.1:${port}`;

  await page.goto(baseUrl);
  await prepareForCapture(page, '#login-form');
  await assertViewportFit(page, 'Login at 1536x1024');
  await page.screenshot({ path: path.join(captureDir, '01-login.png'), fullPage: false });

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await Promise.all([
    page.waitForURL('**/servers'),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);

  const db = new Database(dbPath);
  const operator = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  const result = db
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id)
       VALUES ('203.0.113.10', 27015, 'documentation-only', ?)`
    )
    .run(operator.id);
  const serverId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO server_access (user_id, server_id) VALUES (?, ?)').run(
    operator.id,
    serverId
  );
  db.close();

  await page.reload();
  await prepareForCapture(page, '#serverList .server-card');
  await assertViewportFit(page, 'Servers at 1536x1024');
  await assertElementNotClipped(page, '.nav-brand', 'Server inventory navigation brand');
  await page.screenshot({ path: path.join(captureDir, '02-servers.png'), fullPage: false });
  await page.goto(`${baseUrl}/add-server`);
  await page.getByLabel('Server address').fill('203.0.113.10');
  await page.getByLabel('RCON port').fill('27015');
  await prepareForCapture(page, '#add-server-form');
  await assertViewportFit(page, 'Add server at 1536x1024');
  await assertElementNotClipped(page, '.nav-brand', 'Add-server navigation brand');
  await page.screenshot({ path: path.join(captureDir, '03-add-server.png'), fullPage: false });
  const observedAt = new Date().toISOString();
  await page.route(`**/api/status/${serverId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hostname: 'Server 1',
        map: 'de_ancient',
        humans: 8,
        bots: 2,
        max_players: 12,
        connected: true,
        authenticated: true,
        partial: false,
        complete: true,
        observed_at: observedAt,
        error: null,
      }),
    });
  });
  await page.route(`**/api/players/${serverId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        players: [
          {
            userid: '2',
            name: 'hampus',
            steam_account_id: '1001',
            steam_id64: '76561197960266729',
          },
          {
            userid: '4',
            name: 'Emilia',
            steam_account_id: '1002',
            steam_id64: '76561197960266730',
          },
          { userid: '7', name: 'nomad', steam_account_id: '1003', steam_id64: '76561197960266731' },
          { userid: '9', name: 'Kova', steam_account_id: '1004', steam_id64: '76561197960266732' },
        ],
        humans: 8,
        bots: 2,
        max_players: 12,
        observed_at: observedAt,
        error: null,
      }),
    });
  });
  await page.route(`**/api/rcon/history/${serverId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        commands: [
          { id: 3, command: 'status', use_count: 4, last_used_at: observedAt },
          { id: 2, command: 'hostname', use_count: 2, last_used_at: observedAt },
          { id: 1, command: 'map de_ancient', use_count: 1, last_used_at: observedAt },
        ],
        history_state: 'available',
      }),
    });
  });
  await page.goto(`${baseUrl}/manage/${serverId}`);
  await prepareForCapture(page, '#server_setup_form');
  await assertViewportFit(page, 'Manage at 1536x1024');
  await assertElementNotClipped(page, '.nav-brand', 'Manage navigation brand');
  await page.screenshot({ path: path.join(captureDir, '04-manage.png'), fullPage: false });
  await page.goto(`${baseUrl}/settings`);
  await prepareForCapture(page, '#change-password-form');
  await assertViewportFit(page, 'Settings at 1536x1024');
  await assertElementNotClipped(page, '.nav-brand', 'Settings navigation brand');
  await page.screenshot({ path: path.join(captureDir, '05-settings.png'), fullPage: false });
  await page.goto(`${baseUrl}/admin/users`);
  await prepareForCapture(page, '#user-table');
  await assertViewportFit(page, 'Users at 1536x1024');
  await assertElementNotClipped(page, '.nav-brand', 'Users navigation brand');
  await page.screenshot({ path: path.join(captureDir, '06-users.png'), fullPage: false });

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobilePage.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`mobile console: ${message.text()}`);
  });
  mobilePage.on('pageerror', (error) => browserErrors.push(`mobile page: ${error.message}`));
  await mobilePage.emulateMedia({ reducedMotion: 'reduce' });
  await mobilePage.goto(baseUrl);
  await prepareForCapture(mobilePage, '#login-form');
  await assertViewportFit(mobilePage, 'Login at 390x844');
  await mobilePage.keyboard.press('Tab');
  const focusedText = await mobilePage.evaluate(() => document.activeElement?.textContent?.trim());
  if (focusedText !== 'Skip to main content') {
    throw new Error(`Expected the skip link to receive first keyboard focus, got ${focusedText}`);
  }
  await mobilePage.getByLabel('Username').fill(username);
  await mobilePage.getByLabel('Password').fill(password);
  await Promise.all([
    mobilePage.waitForURL('**/servers'),
    mobilePage.getByRole('button', { name: 'Sign in' }).click(),
  ]);
  await prepareForCapture(mobilePage, '#serverList .server-card');
  await assertViewportFit(mobilePage, 'Servers at 390x844');
  await mobilePage.getByRole('button', { name: 'Open navigation' }).click();
  await mobilePage.getByRole('link', { name: 'Add server' }).waitFor({ state: 'visible' });
  await mobilePage.keyboard.press('Escape');
  if (
    (await mobilePage
      .getByRole('button', { name: 'Open navigation' })
      .getAttribute('aria-expanded')) !== 'false'
  ) {
    throw new Error('Expected Escape to close mobile navigation');
  }
  await mobilePage.goto(`${baseUrl}/add-server`);
  await prepareForCapture(mobilePage, '#add-server-form');
  await assertViewportFit(mobilePage, 'Add server at 390x844');
  await mobilePage.goto(`${baseUrl}/manage/${serverId}`);
  await prepareForCapture(mobilePage, '#server_setup_form');
  await assertViewportFit(mobilePage, 'Manage at 390x844');
  await mobilePage.screenshot({
    path: path.join(captureDir, '08-manage-mobile.png'),
    fullPage: false,
  });
  await mobilePage.goto(`${baseUrl}/settings`);
  await prepareForCapture(mobilePage, '#change-password-form');
  await assertViewportFit(mobilePage, 'Settings at 390x844');
  await mobilePage.goto(`${baseUrl}/admin/users`);
  await prepareForCapture(mobilePage, '#user-table');
  await assertViewportFit(mobilePage, 'Users at 390x844');

  const tabletPage = await browser.newPage({ viewport: { width: 900, height: 1024 } });
  tabletPage.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`tablet console: ${message.text()}`);
  });
  tabletPage.on('pageerror', (error) => browserErrors.push(`tablet page: ${error.message}`));
  await tabletPage.emulateMedia({ reducedMotion: 'reduce' });
  await tabletPage.goto(baseUrl);
  await tabletPage.getByLabel('Username').fill(username);
  await tabletPage.getByLabel('Password').fill(password);
  await Promise.all([
    tabletPage.waitForURL('**/servers'),
    tabletPage.getByRole('button', { name: 'Sign in' }).click(),
  ]);
  for (const [route, selector, label] of [
    ['/servers', '#serverList .server-card', 'Servers'],
    ['/add-server', '#add-server-form', 'Add server'],
    [`/manage/${serverId}`, '#server_setup_form', 'Manage'],
    ['/settings', '#change-password-form', 'Settings'],
    ['/admin/users', '#user-table', 'Users'],
  ]) {
    await tabletPage.goto(`${baseUrl}${route}`);
    await prepareForCapture(tabletPage, selector);
    await assertViewportFit(tabletPage, `${label} at 900x1024`);
    if (label === 'Manage') {
      await tabletPage.screenshot({
        path: path.join(captureDir, '07-manage-tablet.png'),
        fullPage: false,
      });
    }
  }

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors during screenshot capture:\n${browserErrors.join('\n')}`);
  }

  for (const filename of [
    '01-login.png',
    '02-servers.png',
    '03-add-server.png',
    '04-manage.png',
    '05-settings.png',
    '06-users.png',
    '07-manage-tablet.png',
    '08-manage-mobile.png',
  ]) {
    fs.copyFileSync(path.join(captureDir, filename), path.join(screenshotDir, filename));
  }
} finally {
  await browser?.close();
  if (app.exitCode === null && app.signalCode === null) app.kill('SIGTERM');
  await appClosed;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
