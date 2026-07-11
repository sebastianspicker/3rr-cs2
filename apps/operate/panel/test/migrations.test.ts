import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';

let tmpDir: string;

type ChildResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

before(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-migrations-'));
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

function dbPathFor(name: string): string {
  return path.join(tmpDir, `${name}.db`);
}

function runDbImport(dbPath: string): Promise<ChildResult> {
  const dbModulePath = path.resolve('dist/db.js');
  const child = spawn(process.execPath, ['-e', `require(${JSON.stringify(dbModulePath)})`], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  return new Promise((resolve) => {
    child.once('exit', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function expectImportSuccess(dbPath: string): Promise<void> {
  const result = await runDbImport(dbPath);
  assert.equal(
    result.code,
    0,
    `db import failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function openFixture(dbPath: string): Database.Database {
  return new Database(dbPath);
}

import {
  assertCurrentSchemaConstraintsIndexesAndCascades,
  tableColumns,
} from './migration-schema-assertions';
import {
  createCurrentSchema,
  createPreVersionedInlineSchema,
  createVersion1Schema,
  createVersion2Schema,
} from './migration-schema-builders';

test('migrations create the current schema from an empty user_version 0 database', async () => {
  const dbPath = dbPathFor('fresh-v0');
  openFixture(dbPath).close();

  await expectImportSuccess(dbPath);

  const db = openFixture(dbPath);
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 3);
    assert.ok(tableColumns(db, 'users').includes('is_admin'));
    assert.ok(tableColumns(db, 'workshop_favorites').includes('workshop_id'));
    assert.ok(tableColumns(db, 'rcon_command_history').includes('command'));
  } finally {
    db.close();
  }
});

test('migrations upgrade the supported pre-versioned inline schema', async () => {
  const dbPath = dbPathFor('pre-versioned-inline-v0');
  const db = openFixture(dbPath);
  createPreVersionedInlineSchema(db);
  db.prepare(`INSERT INTO users (id, username, password) VALUES (1, 'first', 'hash')`).run();
  db.prepare(
    `INSERT INTO servers (id, serverIP, serverPort, rconPassword) VALUES (1, '203.0.113.10', 27015, 'secret')`
  ).run();
  db.close();

  await expectImportSuccess(dbPath);

  const migrated = openFixture(dbPath);
  try {
    assert.equal(migrated.pragma('user_version', { simple: true }), 3);
    assert.ok(tableColumns(migrated, 'servers').includes('owner_id'));
    assert.ok(tableColumns(migrated, 'servers').includes('last_game_mode'));
    assert.ok(tableColumns(migrated, 'users').includes('is_admin'));
    const server = migrated.prepare(`SELECT owner_id FROM servers WHERE id = 1`).get() as {
      owner_id: number;
    };
    assert.equal(server.owner_id, 1);
    const access = migrated
      .prepare(`SELECT COUNT(1) AS count FROM server_access WHERE user_id = 1 AND server_id = 1`)
      .get() as { count: number };
    assert.equal(access.count, 1);
  } finally {
    migrated.close();
  }
});

test('migrations create current constraints, indexes, and cascades from an empty database', async () => {
  const dbPath = dbPathFor('fresh-v0-constraints');
  openFixture(dbPath).close();

  await expectImportSuccess(dbPath);

  const db = openFixture(dbPath);
  try {
    assertCurrentSchemaConstraintsIndexesAndCascades(db);
  } finally {
    db.close();
  }
});

test('migrations upgrade a supported user_version 1 database and assign first admin', async () => {
  const dbPath = dbPathFor('supported-v1');
  const db = openFixture(dbPath);
  createVersion1Schema(
    db,
    'id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL'
  );
  db.prepare(`INSERT INTO users (id, username, password) VALUES (1, 'first', 'hash')`).run();
  db.prepare(`INSERT INTO users (id, username, password) VALUES (2, 'second', 'hash')`).run();
  db.close();

  await expectImportSuccess(dbPath);

  const migrated = openFixture(dbPath);
  try {
    assert.equal(migrated.pragma('user_version', { simple: true }), 3);
    const admins = migrated
      .prepare(`SELECT username FROM users WHERE is_admin = 1 ORDER BY id`)
      .all() as Array<{ username: string }>;
    assert.deepEqual(
      admins.map((row) => row.username),
      ['first']
    );
  } finally {
    migrated.close();
  }
});

test('migrations preserve constraints, indexes, and cascades after a supported v1 upgrade', async () => {
  const dbPath = dbPathFor('supported-v1-constraints');
  const db = openFixture(dbPath);
  createVersion1Schema(
    db,
    'id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL'
  );
  db.prepare(`INSERT INTO users (id, username, password) VALUES (1, 'first', 'hash')`).run();
  db.close();

  await expectImportSuccess(dbPath);

  const migrated = openFixture(dbPath);
  try {
    assertCurrentSchemaConstraintsIndexesAndCascades(migrated);
  } finally {
    migrated.close();
  }
});

test('migrations upgrade a supported user_version 2 database to operator state tables', async () => {
  const dbPath = dbPathFor('supported-v2');
  const db = openFixture(dbPath);
  createVersion2Schema(db);
  db.prepare(
    `INSERT INTO users (id, username, password, is_admin) VALUES (1, 'admin', 'hash', 1)`
  ).run();
  db.close();

  await expectImportSuccess(dbPath);

  const migrated = openFixture(dbPath);
  try {
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
  } finally {
    migrated.close();
  }
});

test('migrations accept user_version 1 databases that already have is_admin', async () => {
  const dbPath = dbPathFor('duplicate-is-admin-v1');
  const db = openFixture(dbPath);
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
  db.close();

  await expectImportSuccess(dbPath);

  const migrated = openFixture(dbPath);
  try {
    assert.equal(migrated.pragma('user_version', { simple: true }), 3);
    const admins = migrated
      .prepare(`SELECT username FROM users WHERE is_admin = 1 ORDER BY id`)
      .all() as Array<{ username: string }>;
    assert.deepEqual(
      admins.map((row) => row.username),
      ['second']
    );
  } finally {
    migrated.close();
  }
});

test('current user_version databases open without changing schema version', async () => {
  const dbPath = dbPathFor('current-v3');
  const db = openFixture(dbPath);
  createCurrentSchema(db);
  db.close();

  await expectImportSuccess(dbPath);

  const reopened = openFixture(dbPath);
  try {
    assert.equal(reopened.pragma('user_version', { simple: true }), 3);
  } finally {
    reopened.close();
  }
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
