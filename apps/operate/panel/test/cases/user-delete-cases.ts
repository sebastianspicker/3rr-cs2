/** User-deletion scenarios, including orphan server and RCON cleanup behavior. */
import { test } from 'node:test';
import type Database from 'better-sqlite3';
import {
  app,
  adminUserId,
  credentialField,
  fixtureCredential,
  withServer,
  assert,
  loginAndGetSession,
  loginAsAdmin,
  postUserApi,
  createUserServerFixture,
  removeServerCalls,
  setRemoveServerShouldFail,
} from '../support/user-management-fixture';

function assertUserAndServerAbsent(db: Database.Database, userId: number, serverId: number): void {
  assert.equal(db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId), undefined);
  assert.equal(db.prepare(`SELECT id FROM servers WHERE id = ?`).get(serverId), undefined);
}

function findServerAccess(db: Database.Database, userId: number, serverId: number): unknown {
  return db
    .prepare(`SELECT 1 FROM server_access WHERE user_id = ? AND server_id = ?`)
    .get(userId, serverId);
}

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
    const res = await postUserApi(port, 'delete', { userId: adminUserId });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.match(body.error ?? '', /own account/);
  });
});

test('POST /api/users/delete deletes a user successfully (admin)', async () => {
  await withServer(app, async (port) => {
    const session = await loginAsAdmin(port);
    // Create a user to delete.
    await postUserApi(
      port,
      'add',
      { username: 'deleteableuser', [credentialField]: fixtureCredential('deleteable') },
      session
    );
    const { better_sqlite_client } = await import('../../db');
    const row = better_sqlite_client
      .prepare(`SELECT id FROM users WHERE username = 'deleteableuser'`)
      .get() as { id: number };

    const res = await postUserApi(port, 'delete', { userId: row.id }, session);
    assert.equal(res.status, 200);
  });
});

test('POST /api/users/delete removes exclusively accessible servers and their RCON state', async () => {
  const { better_sqlite_client: db } = await import('../../db');
  const { userId, serverId } = await createUserServerFixture(
    'exclusive-server-user',
    '198.51.100.71',
    27071
  );

  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'delete', { userId });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.user_deleted, true);
    assert.deepEqual(body.deleted_server_ids, [serverId]);
    assert.equal(body.rcon_cleanup, 'completed');
    assertUserAndServerAbsent(db, userId, serverId);
    assert.deepEqual(removeServerCalls, [String(serverId)]);
  });
});

test('POST /api/users/delete preserves servers still shared with another user', async () => {
  const { better_sqlite_client: db } = await import('../../db');
  const { userId, serverId } = await createUserServerFixture(
    'shared-server-user',
    '198.51.100.72',
    27072,
    true
  );

  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'delete', { userId });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body.deleted_server_ids, []);
    assert.equal(body.rcon_cleanup, 'not_needed');
    assert.ok(db.prepare(`SELECT id FROM servers WHERE id = ?`).get(serverId));
    assert.ok(findServerAccess(db, adminUserId, serverId));
    assert.deepEqual(removeServerCalls, []);
  });
});

test('POST /api/users/delete reports RCON cleanup failure after committing deletion', async () => {
  const { better_sqlite_client: db } = await import('../../db');
  const { userId, serverId } = await createUserServerFixture(
    'cleanup-failure-user',
    '198.51.100.73',
    27073
  );
  setRemoveServerShouldFail(true);

  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'delete', { userId });

    assert.equal(res.status, 500);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.user_deleted, true);
    assert.equal(body.rcon_cleanup, 'failed');
    assert.deepEqual(body.failed_server_ids, [serverId]);
    assertUserAndServerAbsent(db, userId, serverId);
    assert.deepEqual(removeServerCalls, [String(serverId)]);
  });
});

test('POST /api/users/delete rolls back user and access removal when orphan deletion fails', async () => {
  const { better_sqlite_client: db } = await import('../../db');
  const { userId, serverId } = await createUserServerFixture(
    'delete-rollback-user',
    '198.51.100.74',
    27074
  );
  db.exec(`
    CREATE TEMP TRIGGER fail_orphan_delete
    BEFORE DELETE ON main.servers
    WHEN OLD.id = ${serverId}
    BEGIN
      SELECT RAISE(ABORT, 'forced orphan deletion failure');
    END
  `);

  try {
    await withServer(app, async (port) => {
      const res = await postUserApi(port, 'delete', { userId });

      assert.equal(res.status, 500);
      assert.ok(db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId));
      assert.ok(db.prepare(`SELECT id FROM servers WHERE id = ?`).get(serverId));
      assert.ok(findServerAccess(db, userId, serverId));
      assert.deepEqual(removeServerCalls, []);
    });
  } finally {
    db.exec(`DROP TRIGGER IF EXISTS fail_orphan_delete`);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    db.prepare(`DELETE FROM servers WHERE id = ?`).run(serverId);
  }
});

test('deleted user session is rejected on later protected requests', async () => {
  await withServer(app, async (port) => {
    const adminSession = await loginAsAdmin(port);

    await postUserApi(
      port,
      'add',
      { username: 'stalesessionuser', [credentialField]: fixtureCredential('stale') },
      adminSession
    );

    const staleSession = await loginAndGetSession(
      port,
      'stalesessionuser',
      fixtureCredential('stale')
    );
    const { better_sqlite_client } = await import('../../db');
    const row = better_sqlite_client
      .prepare(`SELECT id FROM users WHERE username = ?`)
      .get('stalesessionuser') as { id: number };

    const del = await postUserApi(port, 'delete', { userId: row.id }, adminSession);
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
    const res = await postUserApi(port, 'delete', { userId: 999999 });
    assert.equal(res.status, 404);
  });
});
