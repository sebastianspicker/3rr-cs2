import fs from 'fs';
import path from 'path';
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Express } from 'express';

let tmpDir: string;
let app: Express;
let serverId: number;
let rconShouldFail = false;

async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  const loginPageRes = await fetch(`http://127.0.0.1:${port}/`);
  const setCookie = loginPageRes.headers.get('set-cookie');
  assert.ok(setCookie, 'Login page must set a session cookie');
  const preCookie = setCookie.split(';')[0]!;
  const loginPageText = await loginPageRes.text();
  const m = loginPageText.match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(m, 'CSRF token not found in login page');

  const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: preCookie,
      'x-csrf-token': m[1]!,
    },
    body: JSON.stringify({ username: 'statustest', password: 'statuspass12345' }),
  });
  assert.equal(loginRes.status, 200);

  const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
  const serversRes = await fetch(`http://127.0.0.1:${port}/servers`, {
    headers: { cookie: sessionCookie },
  });
  const cm = (await serversRes.text()).match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(cm, 'CSRF token not found on /servers page');
  return { sessionCookie, csrfToken: cm[1]! };
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-status-'));
  const dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'statustest';
  process.env.DEFAULT_PASSWORD = 'statuspass12345';
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-status-session-secret-xyz';

  mock.module('../modules/rcon.js', {
    defaultExport: {
      readyPromise: Promise.resolve(),
      executeCommand: async (_serverId: string, command: string) => {
        if (rconShouldFail) throw new Error('RCON unavailable');
        if (command === 'status') return 'players : 4 humans, 1 bots (not hibernating)';
        if (command === 'sv_visiblemaxplayers') return 'sv_visiblemaxplayers = 12 ( def. -1 )';
        return 'ok';
      },
      probeServer: async () => {},
      connectServer: async () => {},
      hasConnection: () => false,
      getConnectionInfo: () => null,
      removeServer: async () => {},
      shutdownAll: async () => {},
    },
  });

  const mod = await import('../app');
  app = mod.default;

  const { better_sqlite_client: db } = await import('../db');
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('127.0.0.1', 27020, 'test-rcon', 1)`
    )
    .run();
  serverId = Number(result.lastInsertRowid);
  db.prepare(`INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (1, ?)`).run(
    serverId
  );
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
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/status/${serverId}`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/status/:server_id returns 404 for non-existent server', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/status/99999`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Server not found');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/status/:server_id returns player counts when RCON is available', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/status/${serverId}`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      humans: number | null;
      bots: number | null;
      max_players: number | null;
    };
    assert.equal(body.humans, 4);
    assert.equal(body.bots, 1);
    assert.equal(body.max_players, 12);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/status/:server_id returns null counts when RCON is unavailable', async () => {
  rconShouldFail = true;
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/status/${serverId}`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(res.status, 200, 'RCON failure must not surface as an error to the client');
    const body = (await res.json()) as {
      humans: number | null;
      bots: number | null;
      max_players: number | null;
    };
    assert.equal(body.humans, null);
    assert.equal(body.bots, null);
    assert.equal(body.max_players, null);
  } finally {
    rconShouldFail = false;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
