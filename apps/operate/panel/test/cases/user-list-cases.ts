/** Administrator-only user-list and user-management-page scenarios. */
import { test } from 'node:test';
import {
  app,
  adminUserId,
  createAdminServerFixture,
  withServer,
  assert,
  loginAsAdmin,
} from '../support/user-management-fixture';

test('GET /api/users/list returns 401 when not authenticated', async () => {
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/list`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/users/list returns user list for admin', async () => {
  await withServer(app, async (port) => {
    const { sessionCookie, csrfToken } = await loginAsAdmin(port);
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
  const { better_sqlite_client } = await import('../../db');
  await withServer(app, async (port) => {
    const { sessionCookie } = await loginAsAdmin(port);

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
  await createAdminServerFixture('203.0.113.32', 27032);

  await withServer(app, async (port) => {
    const { sessionCookie } = await loginAsAdmin(port);
    const res = await fetch(`http://127.0.0.1:${port}/admin/users`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="new-user-server"/);
    assert.match(html, /203\.0\.113\.32:27032/);
  });
});
