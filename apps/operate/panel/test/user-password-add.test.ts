import { test } from 'node:test';
import {
  app,
  adminUserId,
  credentialField,
  fixtureCredential,
  withServer,
  assert,
  loginAndGetSession,
} from './user-management-fixture';

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
