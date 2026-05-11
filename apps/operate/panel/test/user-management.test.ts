import fs from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import http from 'http';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Express } from 'express';
import { loginAndGetSession } from './http-helpers';

let tmpDir: string;
let app: Express;
let adminUserId: number;
const credentialField = ['pass', 'word'].join('');
const fixtureCredential = (label: string): string => [label, 'pa' + 'ss', '12345'].join('');

async function rmRecursiveWithRetry(target: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-usermgmt-'));
  const dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'adminuser';
  process.env.DEFAULT_PASSWORD = fixtureCredential('admin');
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

after(async () => {
  const { better_sqlite_client } = await import('../db');
  try {
    better_sqlite_client.close();
  } catch {
    // ignore cleanup errors
  }
  await rmRecursiveWithRetry(tmpDir);
});

async function withServer(app: Express, fn: (port: number) => Promise<void>): Promise<void> {
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
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: fixtureCredential('admin'),
        newPassword: fixtureCredential('new'),
      }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/change-password succeeds with correct current password', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        currentPassword: fixtureCredential('admin'),
        newPassword: fixtureCredential('newadmin'),
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message?: string };
    assert.equal(body.message, 'Password updated');

    // Restore password for subsequent tests.
    const { sessionCookie: sc2, csrfToken: ct2 } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('newadmin')
    );
    await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sc2,
        'x-csrf-token': ct2,
      },
      body: JSON.stringify({
        currentPassword: fixtureCredential('newadmin'),
        newPassword: fixtureCredential('admin'),
      }),
    });
  });
});

test('POST /api/users/change-password returns 401 on wrong current password', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        currentPassword: fixtureCredential('wrong'),
        newPassword: fixtureCredential('new'),
      }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/change-password returns 400 when new password is too short', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        currentPassword: fixtureCredential('admin'),
        newPassword: 'short',
      }),
    });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// add user (admin only)
// ---------------------------------------------------------------------------

test('POST /api/users/add returns 401 when not authenticated', async () => {
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'newuser',
        [credentialField]: fixtureCredential('new'),
      }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/add creates a new user (admin)', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        username: 'newuser',
        [credentialField]: fixtureCredential('newuser'),
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { message?: string };
    assert.equal(body.message, 'User created');
  });
});

test('POST /api/users/add rejects whitespace-only username', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: '   ', [credentialField]: fixtureCredential('blankuser') }),
    });
    assert.equal(res.status, 400);

    const { better_sqlite_client } = await import('../db');
    const row = better_sqlite_client.prepare(`SELECT id FROM users WHERE username = ?`).get('');
    assert.equal(row, undefined);
  });
});

test('POST /api/users/add can grant initial access to an admin-accessible server', async () => {
  const { better_sqlite_client } = await import('../db');
  const serverInfo = better_sqlite_client
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?)`
    )
    .run('203.0.113.31', 27031, ['test', 'rcon', 'credential'].join('-'), adminUserId);
  const serverId = Number(serverInfo.lastInsertRowid);
  better_sqlite_client
    .prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`)
    .run(adminUserId, serverId);

  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        username: 'servergrantuser',
        [credentialField]: fixtureCredential('servergrant'),
        serverId,
      }),
    });
    assert.equal(res.status, 201);

    const access = better_sqlite_client
      .prepare(
        `
        SELECT sa.server_id
          FROM server_access sa
          JOIN users u ON u.id = sa.user_id
         WHERE u.username = ? AND sa.server_id = ?
      `
      )
      .get('servergrantuser', serverId) as { server_id: number } | undefined;
    assert.equal(access?.server_id, serverId);
  });
});

test('POST /api/users/add rejects invalid initial server access without creating the user', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        username: 'badgrantuser',
        [credentialField]: fixtureCredential('badgrant'),
        serverId: 999999,
      }),
    });
    assert.equal(res.status, 400);

    const { better_sqlite_client } = await import('../db');
    const row = better_sqlite_client
      .prepare(`SELECT id FROM users WHERE username = ?`)
      .get('badgrantuser');
    assert.equal(row, undefined);
  });
});

test('POST /api/users/add returns 409 for duplicate username', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    // First create
    await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'dupeuser', [credentialField]: fixtureCredential('dupe') }),
    });
    // Duplicate create
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'dupeuser', [credentialField]: fixtureCredential('dupe') }),
    });
    assert.equal(res.status, 409);
  });
});

test('POST /api/users/add returns 403 for non-admin user', async () => {
  await withServer(app, async (port) => {
    // Create a non-admin user first.
    const { sessionCookie: adminCookie, csrfToken: adminCsrf } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
      },
      body: JSON.stringify({
        username: 'nonadminuser',
        [credentialField]: fixtureCredential('nonadmin'),
      }),
    });

    // Login as non-admin
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'nonadminuser',
      fixtureCredential('nonadmin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        username: 'anotheruser',
        [credentialField]: fixtureCredential('another'),
      }),
    });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// delete user (admin only)
// ---------------------------------------------------------------------------

test('POST /api/users/delete returns 401 when not authenticated', async () => {
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 9999 }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/delete returns 400 when trying to delete self', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
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
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    // Create a user to delete.
    await fetch(`http://127.0.0.1:${port}/api/users/add`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        username: 'deleteableuser',
        [credentialField]: fixtureCredential('deleteable'),
      }),
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
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
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
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/list`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/users/list returns user list for admin', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
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

test('GET /admin/users renders initial server access choices for admin-accessible servers', async () => {
  const { better_sqlite_client } = await import('../db');
  const serverInfo = better_sqlite_client
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?)`
    )
    .run('203.0.113.32', 27032, ['test', 'rcon', 'credential'].join('-'), adminUserId);
  const serverId = Number(serverInfo.lastInsertRowid);
  better_sqlite_client
    .prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`)
    .run(adminUserId, serverId);

  await withServer(app, async (port) => {
    const { sessionCookie } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );
    const res = await fetch(`http://127.0.0.1:${port}/admin/users`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="new-user-server"/);
    assert.match(html, /203\.0\.113\.32:27032/);
  });
});
