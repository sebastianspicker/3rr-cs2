import { test } from 'node:test';
import {
  app,
  credentialField,
  fixtureCredential,
  withServer,
  assert,
  loginAndGetSession,
  loginAsAdmin,
  postUserApi,
  createAdminServerFixture,
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
    const session = await loginAsAdmin(port);
    const res = await postUserApi(
      port,
      'change-password',
      {
        currentPassword: fixtureCredential('admin'),
        newPassword: fixtureCredential('newadmin'),
      },
      session
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message?: string };
    assert.equal(body.message, 'Password updated');

    // Restore password for subsequent tests.
    const updatedSession = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('newadmin')
    );
    await postUserApi(
      port,
      'change-password',
      {
        currentPassword: fixtureCredential('newadmin'),
        newPassword: fixtureCredential('admin'),
      },
      updatedSession
    );
  });
});

test('POST /api/users/change-password returns 401 on wrong current password', async () => {
  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'change-password', {
      currentPassword: fixtureCredential('wrong'),
      newPassword: fixtureCredential('new'),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/change-password returns 400 when new password is too short', async () => {
  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'change-password', {
      currentPassword: fixtureCredential('admin'),
      newPassword: 'short',
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
    const res = await postUserApi(port, 'add', {
      username: 'newuser',
      [credentialField]: fixtureCredential('newuser'),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { message?: string };
    assert.equal(body.message, 'User created');
  });
});

test('POST /api/users/add rejects whitespace-only username', async () => {
  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'add', {
      username: '   ',
      [credentialField]: fixtureCredential('blankuser'),
    });
    assert.equal(res.status, 400);

    const { better_sqlite_client } = await import('../db');
    const row = better_sqlite_client.prepare(`SELECT id FROM users WHERE username = ?`).get('');
    assert.equal(row, undefined);
  });
});

test('POST /api/users/add can grant initial access to an admin-accessible server', async () => {
  const { better_sqlite_client } = await import('../db');
  const serverId = await createAdminServerFixture('203.0.113.31', 27031);

  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'add', {
      username: 'servergrantuser',
      [credentialField]: fixtureCredential('servergrant'),
      serverId,
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
    const res = await postUserApi(port, 'add', {
      username: 'badgrantuser',
      [credentialField]: fixtureCredential('badgrant'),
      serverId: 999999,
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
    const session = await loginAsAdmin(port);
    const request = { username: 'dupeuser', [credentialField]: fixtureCredential('dupe') };
    await postUserApi(port, 'add', request, session);
    const res = await postUserApi(port, 'add', request, session);
    assert.equal(res.status, 409);
  });
});

test('POST /api/users/add returns 403 for non-admin user', async () => {
  await withServer(app, async (port) => {
    // Create a non-admin user first.
    await postUserApi(port, 'add', {
      username: 'nonadminuser',
      [credentialField]: fixtureCredential('nonadmin'),
    });

    // Login as non-admin
    const nonAdminSession = await loginAndGetSession(
      port,
      'nonadminuser',
      fixtureCredential('nonadmin')
    );
    const res = await postUserApi(
      port,
      'add',
      {
        username: 'anotheruser',
        [credentialField]: fixtureCredential('another'),
      },
      nonAdminSession
    );
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// delete user (admin only)
// ---------------------------------------------------------------------------
