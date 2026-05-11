import fs from 'fs';
import path from 'path';
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Express } from 'express';
import { loginAndGetSession as loginWithCredentials } from './http-helpers';

let tmpDir: string;
let app: Express;
const fixtureCredential = (label: string): string => [label, 'pa' + 'ss', '12345'].join('_');
let serverId: number;

async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  return loginWithCredentials(port, 'gameroute_test', fixtureCredential('gameroute'));
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-game-routes-'));
  const dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'gameroute_test';
  process.env.DEFAULT_PASSWORD = fixtureCredential('gameroute');
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-game-routes-session-secret';

  mock.module('../modules/rcon.js', {
    defaultExport: {
      readyPromise: Promise.resolve(),
      executeCommand: async (_serverId: string, _command: string) => 'ok',
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
      `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('127.0.0.1', 27021, 'test-rcon', 1)`
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

// ── /api/setup-game ──────────────────────────────────────────────────────────

test('POST /api/setup-game rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game succeeds with valid payload', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message: string };
    assert.equal(body.message, 'Game Created!');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game rejects unknown game type', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'notavalidgametype',
        game_mode: 'competitive',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Unknown game type/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game rejects map not in allowed list', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_notamap',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── /api/workshop-map ─────────────────────────────────────────────────────────

test('POST /api/workshop-map rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, workshop_id: '12345678901' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/workshop-map succeeds with a valid workshop id', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-map`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, workshop_id: '12345678901' }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/workshop-map rejects non-numeric workshop id', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-map`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, workshop_id: 'notanid' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /workshop_id must be/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── /api/rcon ─────────────────────────────────────────────────────────────────

test('POST /api/rcon rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, command: 'status' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon succeeds with an allowed command', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command: 'status' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message: string };
    assert.equal(body.message, 'Command sent.');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon rejects a blocked command', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command: 'exec config.cfg' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Command not allowed/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon rejects a command containing non-ASCII characters', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command: 'status\u013B' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── /api/say-admin ────────────────────────────────────────────────────────────

test('POST /api/say-admin rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, message: 'hello' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/say-admin succeeds with a valid message', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: 'Server will restart shortly' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message: string };
    assert.equal(body.message, 'Message sent!');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/say-admin rejects an empty message', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: '' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /message is required/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/say-admin rejects a message that sanitizes to empty', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    // All chars stripped by sanitizeString: control chars + semicolons + quotes
    const allStripped = '\x00\x01\x02;|{}';
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: allStripped }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
