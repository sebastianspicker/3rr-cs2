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

test('deleted user session is rejected on later protected requests', async () => {
  await withServer(app, async (port) => {
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
        username: 'stalesessionuser',
        [credentialField]: fixtureCredential('stale'),
      }),
    });

    const staleSession = await loginAndGetSession(
      port,
      'stalesessionuser',
      fixtureCredential('stale')
    );
    const { better_sqlite_client } = await import('../db');
    const row = better_sqlite_client
      .prepare(`SELECT id FROM users WHERE username = ?`)
      .get('stalesessionuser') as { id: number };

    const del = await fetch(`http://127.0.0.1:${port}/api/users/delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
      },
      body: JSON.stringify({ userId: row.id }),
    });
    assert.equal(del.status, 200);

    const staleRes = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: {
        accept: 'application/json',
        cookie: staleSession.sessionCookie,
      },
    });
    assert.equal(staleRes.status, 401);
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

test('stale admin session is revalidated after admin rights are removed', async () => {
  const { better_sqlite_client } = await import('../db');
  await withServer(app, async (port) => {
    const { sessionCookie } = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('admin')
    );

    try {
      better_sqlite_client.prepare(`UPDATE users SET is_admin = 0 WHERE id = ?`).run(adminUserId);
      const res = await fetch(`http://127.0.0.1:${port}/api/users/list`, {
        headers: {
          accept: 'application/json',
          cookie: sessionCookie,
        },
      });
      assert.equal(res.status, 403);
    } finally {
      better_sqlite_client.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).run(adminUserId);
    }
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
