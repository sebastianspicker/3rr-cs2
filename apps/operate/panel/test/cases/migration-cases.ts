/** Migration scenario registrations kept separate from the test discovery shell. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertAdminUsernames,
  buildFixture,
  createLegacyVersion1Users,
  openFixture,
  runDbImport,
  verifyMigratedFixture,
} from '../support/migration-fixture';
import {
  assertCurrentSchemaConstraintsIndexesAndCascades,
  tableColumns,
} from '../support/migration-schema-assertions';
import {
  createCurrentSchema,
  createPreVersionedInlineSchema,
  createVersion1Schema,
  createVersion2Schema,
} from '../support/migration-schema-builders';

type DbPathFor = (name: string) => string;

/** Registers the full forward-only migration compatibility matrix. */
export function registerMigrationScenarios(dbPathFor: DbPathFor): void {
  test('migrations create the current schema from an empty user_version 0 database', async () => {
    const dbPath = dbPathFor('fresh-v0');
    openFixture(dbPath).close();

    await verifyMigratedFixture(dbPath, (db) => {
      assert.equal(db.pragma('user_version', { simple: true }), 3);
      assert.ok(tableColumns(db, 'users').includes('is_admin'));
      assert.ok(tableColumns(db, 'workshop_favorites').includes('workshop_id'));
      assert.ok(tableColumns(db, 'rcon_command_history').includes('command'));
    });
  });

  test('migrations upgrade the supported pre-versioned inline schema', async () => {
    const dbPath = dbPathFor('pre-versioned-inline-v0');
    const db = openFixture(dbPath);
    createPreVersionedInlineSchema(db);
    db.prepare(`INSERT INTO users (id, username, password) VALUES (9, 'later', 'hash')`).run();
    db.prepare(`INSERT INTO users (id, username, password) VALUES (3, 'first', 'hash')`).run();
    db.prepare(
      `INSERT INTO servers (id, serverIP, serverPort, rconPassword) VALUES (1, '203.0.113.10', 27015, 'secret')`
    ).run();
    db.close();

    await verifyMigratedFixture(dbPath, (migrated) => {
      assert.equal(migrated.pragma('user_version', { simple: true }), 3);
      assert.ok(tableColumns(migrated, 'servers').includes('owner_id'));
      assert.ok(tableColumns(migrated, 'servers').includes('last_game_mode'));
      assert.ok(tableColumns(migrated, 'users').includes('is_admin'));
      const server = migrated.prepare(`SELECT owner_id FROM servers WHERE id = 1`).get() as {
        owner_id: number;
      };
      assert.equal(server.owner_id, 3);
      const access = migrated
        .prepare(`SELECT COUNT(1) AS count FROM server_access WHERE user_id = 3 AND server_id = 1`)
        .get() as { count: number };
      assert.equal(access.count, 1);
      const admins = migrated
        .prepare(`SELECT id FROM users WHERE is_admin = 1 ORDER BY id`)
        .all() as Array<{
        id: number;
      }>;
      assert.deepEqual(
        admins.map((row) => row.id),
        [3]
      );
    });
  });

  test('migrations create current constraints, indexes, and cascades from an empty database', async () => {
    const dbPath = dbPathFor('fresh-v0-constraints');
    openFixture(dbPath).close();
    await verifyMigratedFixture(dbPath, assertCurrentSchemaConstraintsIndexesAndCascades);
  });

  test('migrations upgrade a supported user_version 1 database and assign first admin', async () => {
    const dbPath = dbPathFor('supported-v1');
    buildFixture(dbPath, (db) => {
      createLegacyVersion1Users(db, ['first', 'second']);
    });
    await verifyMigratedFixture(dbPath, (migrated) => {
      assert.equal(migrated.pragma('user_version', { simple: true }), 3);
      assertAdminUsernames(migrated, ['first']);
    });
  });

  test('migrations preserve constraints, indexes, and cascades after a supported v1 upgrade', async () => {
    const dbPath = dbPathFor('supported-v1-constraints');
    buildFixture(dbPath, (db) => {
      createLegacyVersion1Users(db, ['first']);
    });
    await verifyMigratedFixture(dbPath, assertCurrentSchemaConstraintsIndexesAndCascades);
  });

  test('migrations upgrade a supported user_version 2 database to operator state tables', async () => {
    const dbPath = dbPathFor('supported-v2');
    const db = openFixture(dbPath);
    createVersion2Schema(db);
    db.prepare(
      `INSERT INTO users (id, username, password, is_admin) VALUES (1, 'admin', 'hash', 1)`
    ).run();
    db.close();

    await verifyMigratedFixture(dbPath, (migrated) => {
      assert.equal(migrated.pragma('user_version', { simple: true }), 3);
      assert.ok(tableColumns(migrated, 'workshop_favorites').includes('workshop_id'));
      assert.ok(tableColumns(migrated, 'rcon_command_history').includes('command'));
      const admins = migrated
        .prepare(`SELECT username FROM users WHERE is_admin = 1`)
        .all() as Array<{ username: string }>;
      assert.deepEqual(
        admins.map((row) => row.username),
        ['admin']
      );
    });
  });

  test('migrations accept user_version 1 databases that already have is_admin', async () => {
    const dbPath = dbPathFor('duplicate-is-admin-v1');
    buildFixture(dbPath, (db) => {
      createVersion1Schema(
        db,
        [
          'id INTEGER PRIMARY KEY',
          'username TEXT NOT NULL UNIQUE',
          'password TEXT NOT NULL',
          'is_admin INTEGER NOT NULL DEFAULT 0',
        ].join(', ')
      );
      db.prepare(
        `INSERT INTO users (id, username, password, is_admin) VALUES (1, 'first', 'hash', 0)`
      ).run();
      db.prepare(
        `INSERT INTO users (id, username, password, is_admin) VALUES (2, 'second', 'hash', 1)`
      ).run();
    });

    await verifyMigratedFixture(dbPath, (migrated) => {
      assert.equal(migrated.pragma('user_version', { simple: true }), 3);
      assertAdminUsernames(migrated, ['second']);
    });
  });

  test('current user_version databases open without changing schema version', async () => {
    const dbPath = dbPathFor('current-v3');
    const db = openFixture(dbPath);
    createCurrentSchema(db);
    db.close();
    await verifyMigratedFixture(dbPath, (reopened) => {
      assert.equal(reopened.pragma('user_version', { simple: true }), 3);
    });
  });

  test('unsupported historical schemas fail with a clear migration boundary error', async () => {
    const dbPath = dbPathFor('unsupported-v1');
    const db = openFixture(dbPath);
    createVersion1Schema(db, 'id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE');
    db.prepare(`INSERT INTO users (id, username) VALUES (1, 'first')`).run();
    db.close();

    const result = await runDbImport(dbPath);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr + result.stdout, /Unsupported SQLite schema.*users.*password/);
  });

  test('unsupported future schema versions fail with a clear migration boundary error', async () => {
    const dbPath = dbPathFor('unsupported-future-version');
    const db = openFixture(dbPath);
    db.pragma('user_version = 999');
    db.close();

    const result = await runDbImport(dbPath);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr + result.stdout, /Unsupported SQLite schema version 999/);
    assert.match(result.stderr + result.stdout, /supports up to 3/);
  });
}
