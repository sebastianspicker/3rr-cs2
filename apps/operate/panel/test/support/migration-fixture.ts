/** Isolated database and child-process mechanics for migration scenarios. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { createVersion1Schema } from './migration-schema-builders';

export type ChildResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export function createMigrationWorkspace(): { close(): void; dbPathFor(name: string): string } {
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-migrations-'));
  return {
    close(): void {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    },
    dbPathFor(name: string): string {
      return path.join(tmpDir, `${name}.db`);
    },
  };
}

export function runDbImport(dbPath: string): Promise<ChildResult> {
  const dbModulePath = path.resolve('dist/db.js');
  const child = spawn(process.execPath, ['-e', `require(${JSON.stringify(dbModulePath)})`], {
    env: { ...process.env, NODE_ENV: 'test', DB_PATH: dbPath, ALLOW_DEFAULT_CREDENTIALS: 'false' },
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
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

export async function expectImportSuccess(dbPath: string): Promise<void> {
  const result = await runDbImport(dbPath);
  assert.equal(
    result.code,
    0,
    `db import failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

export function openFixture(dbPath: string): Database.Database {
  return new Database(dbPath);
}

export function buildFixture(dbPath: string, setup: (db: Database.Database) => void): void {
  const db = openFixture(dbPath);
  try {
    setup(db);
  } finally {
    db.close();
  }
}

export async function verifyMigratedFixture(
  dbPath: string,
  verify: (db: Database.Database) => void
): Promise<void> {
  await expectImportSuccess(dbPath);
  const db = openFixture(dbPath);
  try {
    verify(db);
  } finally {
    db.close();
  }
}

export function createLegacyVersion1Users(
  db: Database.Database,
  usernames: readonly string[]
): void {
  createVersion1Schema(
    db,
    'id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL'
  );
  const insert = db.prepare(`INSERT INTO users (id, username, password) VALUES (?, ?, 'hash')`);
  usernames.forEach((username, index) => {
    insert.run(index + 1, username);
  });
}

export function assertAdminUsernames(db: Database.Database, expected: readonly string[]): void {
  const admins = db
    .prepare(`SELECT username FROM users WHERE is_admin = 1 ORDER BY id`)
    .all() as Array<{ username: string }>;
  assert.deepEqual(
    admins.map((row) => row.username),
    expected
  );
}
