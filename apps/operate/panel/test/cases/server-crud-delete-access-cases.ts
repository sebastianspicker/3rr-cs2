/** Server-list authorization, shared-access removal, and delete-input validation scenarios. */
import { test } from 'node:test';
import {
  assert,
  insertAccessibleServer,
  postDeleteServer,
  removeServerCalls,
  withPanelServer,
} from '../support/server-crud-fixture';

export function registerServerListAuthenticationCase(): void {
  test('GET /api/servers rejects unauthenticated request', async () => {
    await withPanelServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
        headers: { accept: 'application/json' },
      });
      assert.equal(res.status, 401);
    });
  });
}

export function registerServerDeleteAccessCases(): void {
  test('POST /api/delete-server removes only caller access for a shared server', async () => {
    const { better_sqlite_client: db } = await import('../../db');
    const sharedId = await insertAccessibleServer('198.51.100.31', 27031);
    const otherUser = db
      .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, 'hash', 0)`)
      .run('shared-delete-user');
    const otherUserId = Number(otherUser.lastInsertRowid);
    db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
      otherUserId,
      sharedId
    );

    await withPanelServer(async (port) => {
      const res = await postDeleteServer(port, sharedId);

      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.message, 'Server access removed successfully');
      assert.equal(body.server_deleted, false);
      assert.equal(body.rcon_cleanup, 'not_needed');
      assert.deepEqual(removeServerCalls, []);
      const serverRow = db.prepare(`SELECT id FROM servers WHERE id = ?`).get(sharedId);
      assert.ok(serverRow, 'shared server row must remain');
      const accessRows = db
        .prepare(
          `SELECT user_id
             FROM server_access
            WHERE server_id = ?
            ORDER BY user_id`
        )
        .all(sharedId) as Array<{ user_id: number }>;
      assert.deepEqual(
        accessRows.map((row) => row.user_id),
        [otherUserId]
      );
    });
  });
}

export function registerServerDeleteValidationCases(): void {
  test('POST /api/delete-server rejects malformed server_id', async () => {
    await withPanelServer(async (port) => {
      const res = await postDeleteServer(port, 'abc');
      assert.equal(res.status, 400);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, 'Missing or invalid server_id');
    });
  });

  test('POST /api/delete-server returns 404 for non-existent server', async () => {
    await withPanelServer(async (port) => {
      const res = await postDeleteServer(port, 99999);
      assert.equal(res.status, 404);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, 'Server not found');
    });
  });
}

export function registerServerDeleteAuthenticationCase(): void {
  test('POST /api/delete-server rejects unauthenticated request', async () => {
    await withPanelServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ server_id: 1 }),
      });
      assert.equal(res.status, 401);
    });
  });
}
