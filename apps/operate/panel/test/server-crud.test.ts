import fs from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Express } from 'express';

let tmpDir: string;
let dbPath: string;
let app: Express;

async function getLoginPageCsrfAndCookie(
  port: number
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Login page should set a cookie');
  const cookie = setCookie.split(';')[0]!;
  const text = await res.text();
  const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(m, 'CSRF token not found in login page');
  return { cookie, csrfToken: m[1]! };
}

async function getPageCsrfToken(
  port: number,
  cookie?: string | null,
  pagePath = '/servers'
): Promise<string | null> {
  const res = await fetch(`http://127.0.0.1:${port}${pagePath}`, {
    headers: cookie ? { cookie } : {},
  });
  const text = await res.text();
  const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  return m?.[1] || null;
}

async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  const { cookie, csrfToken: initialCsrfToken } = await getLoginPageCsrfAndCookie(port);
  const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': initialCsrfToken,
    },
    body: JSON.stringify({ username: 'testuser', password: 'testpass12345' }),
  });
  assert.equal(loginRes.status, 200);
  const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
  const csrfToken = await getPageCsrfToken(port, sessionCookie);
  assert.ok(csrfToken, 'CSRF token should exist after login');
  return { sessionCookie, csrfToken };
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'testuser';
  process.env.DEFAULT_PASSWORD = 'testpass12345';
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-session-secret';

  const mod = await import('../app');
  app = mod.default;
});

after(async () => {
  // Shut down the singleton RCON manager so background connections don't keep
  // the Node process alive (the add-server test fires off a connect).
  const rcon = (await import('../modules/rcon')).default;
  await rcon.shutdownAll();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('POST /api/add-server succeeds with valid data', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.1',
        server_port: 27015,
        rcon_password: 'test-rcon-password',
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Server added successfully');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server accepts private LAN IPs for self-hosted servers', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '192.168.1.10',
        server_port: 27016,
        rcon_password: 'test-rcon-password',
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Server added successfully');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects invalid IP', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '',
        server_port: 27015,
        rcon_password: 'test-rcon-password',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body.error === 'string');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects invalid port', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.2',
        server_port: 99999,
        rcon_password: 'test-rcon-password',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'server_port must be an integer between 1 and 65535');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects missing password', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.3',
        server_port: 27015,
        rcon_password: '',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body.error === 'string');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects unauthenticated request', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        server_ip: '203.0.113.4',
        server_port: 27015,
        rcon_password: 'test-rcon-password',
      }),
    });

    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/servers returns server list for authenticated user', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: unknown[] };
    assert.ok(Array.isArray(body.servers));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/servers rejects unauthenticated request', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: { accept: 'application/json' },
    });

    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server returns 404 for non-existent server', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 99999 }),
    });

    assert.equal(res.status, 404);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Server not found');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server rejects unauthenticated request', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ server_id: 1 }),
    });

    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
