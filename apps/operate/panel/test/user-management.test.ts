import fs from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Express } from 'express';

let tmpDir: string;
let app: Express;
let adminUserId: number;

async function loginAndGetSession(
  port: number,
  username: string,
  password: string
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
    body: JSON.stringify({ username, password }),
  });
  assert.equal(loginRes.status, 200, `Login failed for ${username}`);

  const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
  const serversRes = await fetch(`http://127.0.0.1:${port}/servers`, {
    headers: { cookie: sessionCookie },
  });
  const cm = (await serversRes.text()).match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(cm, 'CSRF token not found on /servers page');
  return { sessionCookie, csrfToken: cm[1]! };
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-usermgmt-'));
  const dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'adminuser';
  process.env.DEFAULT_PASSWORD = 'adminpass12345';
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-usermgmt-session-secret-xyz';

  mock.module('../modules/rcon.js', {
    defaultExport: {
      readyPromise: Promise.resolve(),
      executeCommand: async () => '',
      getSessions: () => ({}),
    },
  });

  const imported = await import('../app');
  app = imported.default;

  // Find the admin user id from the seeded DB.
  const { better_sqlite_client } = await import('../db');
  const row = better_sqlite_client
    .prepare(`SELECT id FROM users WHERE username = 'adminuser'`)
    .get() as { id: number };
  adminUserId = row.id;
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---- helper: start a temporary HTTP server around the Express app ----

async function withServer(
  fn: (port: number) => Promise<void>
): Promise<void> {
  const http = await import('http');
  const server: Server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

// ---------------------------------------------------------------------------
// change-password
// ---------------------------------------------------------------------------

test('POST /api/users/change-password returns 401 when not authenticated', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'adminpass12345', newPassword: 'newpassword12345' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/change-password succeeds with correct current password', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        currentPassword: 'adminpass12345',
        newPassword: 'newadminpass12345',
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message?: string };
    assert.equal(body.message, 'Password updated');

    // Restore password for subsequent tests.
    const { sessionCookie: sc2, csrfToken: ct2 } = await loginAndGetSession(
      port,
      'adminuser',
      'newadminpass12345'
    );
    await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sc2,
        'x-csrf-token': ct2,
      },
      body: JSON.stringify({
        currentPassword: 'newadminpass12345',
        newPassword: 'adminpass12345',
      }),
    });
  });
});

test('POST /api/users/change-password returns 401 on wrong current password', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ currentPassword: 'wrongpassword', newPassword: 'newpassword12345' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/change-password returns 400 when new password is too short', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ currentPassword: 'adminpass12345', newPassword: 'short' }),
    });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// add user (admin only)
// ---------------------------------------------------------------------------

test('POST /api/users/add returns 401 when not authenticated', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'newuser', password: 'newpassword12345' }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/add creates a new user (admin)', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'newuser', password: 'newuserpass12345' }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { message?: string };
    assert.equal(body.message, 'User created');
  });
});

test('POST /api/users/add returns 409 for duplicate username', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    // First create
    await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'dupeuser', password: 'dupepass12345' }),
    });
    // Duplicate create
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'dupeuser', password: 'dupepass12345' }),
    });
    assert.equal(res.status, 409);
  });
});

test('POST /api/users/add returns 403 for non-admin user', async () => {
  await withServer(async (port) => {
    // Create a non-admin user first.
    const { sessionCookie: adminCookie, csrfToken: adminCsrf } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
      },
      body: JSON.stringify({ username: 'nonadminuser', password: 'nonadminpass12345' }),
    });

    // Login as non-admin
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'nonadminuser',
      'nonadminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'anotheruser', password: 'anotherpass12345' }),
    });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// delete user (admin only)
// ---------------------------------------------------------------------------

test('POST /api/users/delete returns 401 when not authenticated', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 9999 }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/delete returns 400 when trying to delete self', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ userId: adminUserId }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.match(body.error ?? '', /own account/);
  });
});

test('POST /api/users/delete deletes a user successfully (admin)', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    // Create a user to delete.
    await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'deleteableuser', password: 'deleteablepass12345' }),
    });
    const { better_sqlite_client } = await import('../db');
    const row = better_sqlite_client
      .prepare(`SELECT id FROM users WHERE username = 'deleteableuser'`)
      .get() as { id: number };

    const res = await fetch(`http://127.0.0.1:${port}/api/users/delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ userId: row.id }),
    });
    assert.equal(res.status, 200);
  });
});

test('POST /api/users/delete returns 404 for non-existent user', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ userId: 999999 }),
    });
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
// list users (admin only)
// ---------------------------------------------------------------------------

test('GET /api/users/list returns 401 when not authenticated', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/list`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/users/list returns user list for admin', async () => {
  await withServer(async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      'adminpass12345'
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/list`, {
      headers: { cookie: sessionCookie, 'x-csrf-token': csrfToken },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { users?: { id: number; username: string }[] };
    assert.ok(Array.isArray(body.users));
    assert.ok(body.users.some((u) => u.username === 'adminuser'));
  });
});
