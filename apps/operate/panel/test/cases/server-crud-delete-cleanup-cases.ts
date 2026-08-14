/** Orphan-server deletion transaction and RCON cleanup scenarios. */
import { test } from 'node:test';
import {
  assert,
  insertAccessibleServer,
  postDeleteServer,
  removeServerCalls,
  setRemoveServerShouldFail,
  withPanelServer,
} from '../support/server-crud-fixture';

export function registerServerDeleteCleanupCases(): void {
  test('POST /api/delete-server deletes an orphan server and cleans up RCON state', async () => {
    const { better_sqlite_client: db } = await import('../../db');
    const orphanId = await insertAccessibleServer('198.51.100.32', 27032);

    await withPanelServer(async (port) => {
      const res = await postDeleteServer(port, orphanId);

      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.message, 'Server deleted successfully');
      assert.equal(body.server_deleted, true);
      assert.equal(body.rcon_cleanup, 'completed');
      assert.deepEqual(removeServerCalls, [String(orphanId)]);
      const serverRow = db.prepare(`SELECT id FROM servers WHERE id = ?`).get(orphanId);
      assert.equal(serverRow, undefined);
      const access = db
        .prepare(`SELECT COUNT(*) AS count FROM server_access WHERE server_id = ?`)
        .get(orphanId) as { count: number };
      assert.equal(access.count, 0);
    });
  });

  test('POST /api/delete-server rolls back access removal when orphan deletion fails', async () => {
    const { better_sqlite_client: db } = await import('../../db');
    const orphanId = await insertAccessibleServer('198.51.100.34', 27034);
    db.exec(`
      CREATE TRIGGER test_fail_orphan_server_delete
      BEFORE DELETE ON servers
      WHEN OLD.id = ${orphanId}
      BEGIN
        SELECT RAISE(ABORT, 'forced orphan delete failure');
      END
    `);

    try {
      await withPanelServer(async (port) => {
        const res = await postDeleteServer(port, orphanId);

        assert.equal(res.status, 500);
        const serverRow = db.prepare(`SELECT id FROM servers WHERE id = ?`).get(orphanId);
        assert.ok(serverRow, 'the server must remain when the orphan delete fails');
        const access = db
          .prepare(
            `SELECT COUNT(*) AS count FROM server_access WHERE user_id = 1 AND server_id = ?`
          )
          .get(orphanId) as { count: number };
        assert.equal(access.count, 1, 'the caller access delete must be rolled back');
        assert.deepEqual(removeServerCalls, []);
      });
    } finally {
      db.exec(`DROP TRIGGER IF EXISTS test_fail_orphan_server_delete`);
    }
  });

  test('POST /api/delete-server reports RCON cleanup failure after orphan deletion', async () => {
    const { better_sqlite_client: db } = await import('../../db');
    const orphanId = await insertAccessibleServer('198.51.100.33', 27033);
    setRemoveServerShouldFail(true);

    try {
      await withPanelServer(async (port) => {
        const res = await postDeleteServer(port, orphanId);

        assert.equal(res.status, 500);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body.error, 'Server deleted, but RCON cleanup failed');
        assert.equal(body.server_deleted, true);
        assert.equal(body.rcon_cleanup, 'failed');
        assert.deepEqual(removeServerCalls, [String(orphanId)]);
        const serverRow = db.prepare(`SELECT id FROM servers WHERE id = ?`).get(orphanId);
        assert.equal(serverRow, undefined);
      });
    } finally {
      setRemoveServerShouldFail(false);
    }
  });
}
