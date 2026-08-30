/** File-backed migration contract for empty, current, and future SQLite schemas. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, test } from 'node:test';
import { runMigrations } from '../../src/infrastructure/sqlite/migrations';

const temporaryDirectories: string[] = [];

function temporaryDatabase(): Database.Database {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '3rr-migrations-'));
  temporaryDirectories.push(directory);
  return new Database(path.join(directory, 'panel.db'));
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('fresh file migrates to schema version 3', () => {
  const database = temporaryDatabase();
  try {
    runMigrations(database);
    assert.equal(database.pragma('user_version', { simple: true }), 3);
    assert.equal(
      (
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rcon_command_history'"
          )
          .get() as { name: string } | undefined
      )?.name,
      'rcon_command_history'
    );
  } finally {
    database.close();
  }
});

test('current file is accepted without changing user_version', () => {
  const database = temporaryDatabase();
  try {
    runMigrations(database);
    database
      .prepare('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)')
      .run('operator', 'hash');
    runMigrations(database);
    assert.equal(database.pragma('user_version', { simple: true }), 3);
    assert.equal(
      (database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count,
      1
    );
  } finally {
    database.close();
  }
});

test('future user_version is rejected before mutation', () => {
  const database = temporaryDatabase();
  try {
    database.pragma('user_version = 4');
    assert.throws(() => runMigrations(database), /supports up to 3/);
    assert.equal(database.pragma('user_version', { simple: true }), 4);
  } finally {
    database.close();
  }
});
