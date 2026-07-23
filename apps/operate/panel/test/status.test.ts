import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import { loginAndGetSession as loginWithCredentials } from './http-helpers';
import { mockModule } from './mock-module';
import { grantTestServerAccess, insertLoopbackTestServer } from './database-fixture';

interface StatusBody {
  hostname: string | null;
  humans: number | null;
  bots: number | null;
  max_players: number | null;
  connected: boolean;
  authenticated: boolean;
  partial: boolean;
  complete: boolean;
  observed_at: string | null;
  error: string | null;
}

const CONNECTED_RCON_INFO = {
  host: '127.0.0.1',
  port: 27020,
  connected: true,
  authenticated: true,
};

let tmpDir: string;
let app: Express;
let serverId: number;
let failingRconCommands = new Set<string>();
let rconConnectionInfo: typeof CONNECTED_RCON_INFO | null = CONNECTED_RCON_INFO;

async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  return loginWithCredentials(port, 'statustest', ['status', 'pass', '12345'].join(''));
}

async function withStatusServer(fn: (port: number) => Promise<void>): Promise<void> {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function getAuthenticatedStatus(port: number, id = serverId): Promise<Response> {
  const { sessionCookie } = await loginAndGetSession(port);
  return fetch(`http://127.0.0.1:${port}/api/status/${id}`, {
    headers: { cookie: sessionCookie },
  });
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-status-'));
  const dbPath = path.join(tmpDir, '3rr.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'statustest';
  process.env.DEFAULT_PASSWORD = ['status', 'pass', '12345'].join('');
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-status-session-secret-xyz';

  mockModule('../modules/rcon.js', {
    default: {
      readyPromise: Promise.resolve(),
      executeCommand: async (_serverId: string, command: string) => {
        if (failingRconCommands.has(command)) throw new Error(`RCON unavailable: ${command}`);
        if (command === 'status') return 'players : 4 humans, 1 bots (not hibernating)';
        if (command === 'hostname') return 'hostname = Test Status Server';
        if (command === 'sv_visiblemaxplayers') return 'sv_visiblemaxplayers = 12 ( def. -1 )';
        return 'ok';
      },
      probeServer: async () => {},
      connectServer: async () => {},
      hasConnection: () => false,
      getConnectionInfo: () => rconConnectionInfo,
      removeServer: async () => {},
      shutdownAll: async () => {},
    },
  });

  const mod = await import('../app');
  app = mod.default;

  const { better_sqlite_client: db } = await import('../db');
  serverId = insertLoopbackTestServer(db, 27020);
  grantTestServerAccess(db, serverId);
});

afterEach(() => {
  failingRconCommands = new Set();
  rconConnectionInfo = CONNECTED_RCON_INFO;
});

after(async () => {
  const rcon = (await import('../modules/rcon')).default;
  await rcon.shutdownAll();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('GET /api/status/:server_id rejects unauthenticated requests', async () => {
  await withStatusServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/status/${serverId}`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/status/:server_id returns 404 for non-existent server', async () => {
  await withStatusServer(async (port) => {
    const res = await getAuthenticatedStatus(port, 99999);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Server not found');
  });
});

test('GET /api/status/:server_id returns player counts when RCON is available', async () => {
  await withStatusServer(async (port) => {
    const res = await getAuthenticatedStatus(port);
    assert.equal(res.status, 200);
    const body = (await res.json()) as StatusBody;
    assert.equal(body.hostname, 'Test Status Server');
    assert.equal(body.humans, 4);
    assert.equal(body.bots, 1);
    assert.equal(body.max_players, 12);
    assert.equal(body.connected, true);
    assert.equal(body.authenticated, true);
    assert.equal(body.partial, false);
    assert.equal(body.complete, true);
    assert.match(body.observed_at ?? '', /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(body.error, null);
  });
});

test('GET /api/status/:server_id reports partial RCON observations explicitly', async () => {
  failingRconCommands = new Set(['status']);
  await withStatusServer(async (port) => {
    const res = await getAuthenticatedStatus(port);
    assert.equal(res.status, 200);
    const body = (await res.json()) as StatusBody;
    assert.equal(body.hostname, 'Test Status Server');
    assert.equal(body.humans, null);
    assert.equal(body.bots, null);
    assert.equal(body.max_players, 12);
    assert.equal(body.connected, true);
    assert.equal(body.authenticated, true);
    assert.equal(body.partial, true);
    assert.equal(body.complete, false);
    assert.match(body.observed_at ?? '', /^\d{4}-\d{2}-\d{2}T/);
    assert.match(body.error ?? '', /status unavailable/);
  });
});

test('GET /api/status/:server_id returns explicit error fields when RCON is unavailable', async () => {
  failingRconCommands = new Set(['status', 'hostname', 'sv_visiblemaxplayers']);
  rconConnectionInfo = null;
  await withStatusServer(async (port) => {
    const res = await getAuthenticatedStatus(port);
    assert.equal(res.status, 200, 'RCON failure must be represented in the response body');
    const body = (await res.json()) as StatusBody;
    assert.equal(body.humans, null);
    assert.equal(body.bots, null);
    assert.equal(body.max_players, null);
    assert.equal(body.connected, false);
    assert.equal(body.authenticated, false);
    assert.equal(body.partial, false);
    assert.equal(body.complete, false);
    assert.equal(body.observed_at, null);
    assert.match(body.error ?? '', /status unavailable/);
  });
});
