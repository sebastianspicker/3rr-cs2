/** Real app and disposable SQLite; only the RCON transport is deterministic. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { createPanelApp } from '../../dist/src/app/createApp.js';
import { runMigrations } from '../../dist/src/infrastructure/sqlite/migrations.js';
import { RconObservationCache } from '../../dist/src/integrations/rcon/rconObservationCache.js';
import { RconDeadlineError } from '../../dist/src/integrations/rcon/rconErrors.js';

const defaultHostnames = [
  'Practice / EU',
  'Scrim 01 / EU',
  'Scrim 02 / EU',
  'Practice / NA',
  'Match / NA',
  'Community',
  'Workshop',
  'Warmup',
];

export async function startFixture({
  hostnames = defaultHostnames,
  serverCount = 8,
  humans = 2,
  initialMap = 'de_dust2',
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), '3rr-browser-'));
  const db = new Database(join(directory, 'panel.sqlite'));
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT INTO users (id, username, password, is_admin) VALUES (1, ?, ?, 1)').run(
    'operator',
    bcrypt.hashSync('browser-fixture-password', 4)
  );
  for (let id = 1; id <= serverCount; id++) {
    db.prepare(
      'INSERT INTO servers (id, serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, 27015, ?, 1)'
    ).run(id, `192.0.2.${id}`, 'fixture-only');
    db.prepare('INSERT INTO server_access (user_id, server_id) VALUES (1, ?)').run(id);
  }
  const state = {
    mode: 'complete',
    delay: 30,
    outcome: null,
    calls: [],
    actions: [],
    active: 0,
    maxActive: 0,
    humans,
    maps: Object.fromEntries(
      Array.from({ length: serverCount }, (_value, index) => [String(index + 1), initialMap])
    ),
  };
  const cache = new RconObservationCache(
    async (id, command, _deadline, _signal, markSent) => {
      markSent();
      state.calls.push({ id, command });
      await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (
        command === 'status' &&
        (state.mode === 'unavailable' || (state.mode === 'partial' && id !== '1'))
      ) {
        throw new RconDeadlineError('unknown');
      }
      if (command === 'hostname') {
        return `hostname = ${hostnames[Number(id) - 1] ?? `Server ${id}`}`;
      }
      if (command === 'sv_visiblemaxplayers') return '"sv_visiblemaxplayers" = "24"';
      if (command === 'status') {
        const map = state.maps[id];
        return state.humans === null
          ? `map : ${map}`
          : `map : ${map}\nplayers : ${state.humans} humans, 0 bots (24 max)`;
      }
      return '';
    },
    () => Date.now() + 12000
  );
  const rcon = {
    totalDeadlineMs: 12000,
    observeCommand: (id, command, options) => cache.observe(id, command, options),
    getConnectionInfo: (id) => ({
      connected: true,
      authenticated: true,
      host: `192.0.2.${id}`,
      port: 27015,
    }),
    executeCommand: async (id, command) => {
      state.actions.push({ id, command });
      if (state.outcome) throw new RconDeadlineError(state.outcome);
      if (command.startsWith('changelevel ')) state.maps[id] = command.slice('changelevel '.length);
      cache.invalidateServer(id);
      return 'Fixture command accepted';
    },
    getInitSummary: () => ({
      complete: true,
      total: serverCount,
      connected: serverCount,
      failed: 0,
      skipped: 0,
      errors: [],
    }),
  };
  const app = createPanelApp('test', process.cwd(), { db, rcon, redisClient: null });
  // Instrument actual HTTP requests before the app router without replacing routes.
  const server = (await import('node:http')).createServer((req, res) => {
    if (req.url.startsWith('/api/status/')) {
      state.active++;
      state.maxActive = Math.max(state.maxActive, state.active);
      res.once('close', () => {
        state.active--;
      });
    }
    app(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    state,
    cache,
    db,
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      cache.clear();
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export async function login(page, fixture, route = '/servers') {
  await page.goto(fixture.url);
  await page.locator('#username').fill('operator');
  await page.locator('#password').fill('browser-fixture-password');
  await page.locator('#login_btn').click();
  await page.waitForURL('**/servers');
  if (route !== '/servers') await page.goto(fixture.url + route);
}
