import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectArchitectureViolations } from './check-architecture.mjs';

async function architectureFixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), '3rr-architecture-'));
  const sourceRoot = path.join(root, 'src');
  const webRoot = path.join(root, 'web', 'client');
  await mkdir(path.join(sourceRoot, 'shared'), { recursive: true });
  await mkdir(webRoot, { recursive: true });

  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source, 'utf8');
  }

  return {
    root,
    violations: await collectArchitectureViolations({ sourceRoot, webRoot }),
  };
}

test('detects every TypeScript module-edge syntax at guarded boundaries', async (t) => {
  const fixture = await architectureFixture({
    'src/infrastructure/adapter.ts': `
      import '../app/setup';
      export * from '../features/servers';
      export async function loadIntegration() { return import('../integrations/rcon'); }
    `,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  assert.equal(fixture.violations.length, 3);
  assert.match(fixture.violations.join('\n'), /must not import app/);
  assert.match(fixture.violations.join('\n'), /must not import features/);
  assert.match(fixture.violations.join('\n'), /must not import integrations/);
});

test('detects cycles between otherwise permitted feature dependencies', async (t) => {
  const fixture = await architectureFixture({
    'src/features/alpha/index.ts': `export * from '../beta';`,
    'src/features/beta/index.ts': `export * from '../alpha';`,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  assert.deepEqual(fixture.violations, ['feature dependency cycle: alpha -> beta -> alpha']);
});

test('blocks reaching an integration through anything deeper than its entry point', async (t) => {
  const fixture = await architectureFixture({
    'src/integrations/rcon/index.ts': `export const publicApi = 1;`,
    'src/integrations/rcon/internal.ts': `export const internal = 1;`,
    'src/features/console/router.ts': `
      import { publicApi } from '../../integrations/rcon';
      import { publicApi as viaIndex } from '../../integrations/rcon/index';
      import { internal } from '../../integrations/rcon/internal';
      void publicApi; void viaIndex; void internal;
    `,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  assert.deepEqual(fixture.violations, [
    'features/console/router.ts: must import the rcon integration only through src/integrations/rcon (../../integrations/rcon/internal)',
  ]);
});

test('blocks the RCON integration from reaching SQLite persistence directly', async (t) => {
  const fixture = await architectureFixture({
    'src/integrations/rcon/store.ts': `
      import Database from 'better-sqlite3';
      import { createPanelDatabase } from '../../infrastructure/sqlite';
      void Database; void createPanelDatabase;
    `,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  assert.deepEqual(fixture.violations, [
    'integrations/rcon/store.ts: integrations must not import SQLite persistence directly (better-sqlite3)',
    'integrations/rcon/store.ts: integrations must not import SQLite persistence directly (../../infrastructure/sqlite)',
  ]);
});

test('blocks SQL statements outside a repository module or src/infrastructure/sqlite', async (t) => {
  const fixture = await architectureFixture({
    'src/features/workshop/router.ts': `
      import type Database from 'better-sqlite3';
      export function createWorkshopRouter(db: Database.Database) {
        const stmt = db.prepare('SELECT 1');
        const txn = db.transaction(() => {});
        void stmt; void txn;
      }
    `,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  assert.deepEqual(fixture.violations, [
    'features/workshop/router.ts: SQL statements belong only in a repository.ts module or src/infrastructure/sqlite (.prepare(...))',
    'features/workshop/router.ts: SQL statements belong only in a repository.ts module or src/infrastructure/sqlite (.transaction(...))',
  ]);
});

test('allows SQL statements in a feature repository module and in src/infrastructure/sqlite', async (t) => {
  const fixture = await architectureFixture({
    'src/features/workshop/repository.ts': `
      import type Database from 'better-sqlite3';
      export function createWorkshopRepository(db: Database.Database) {
        const stmt = db.prepare('SELECT 1');
        void stmt;
      }
    `,
    'src/features/users/routes/usersRepository.ts': `
      import type Database from 'better-sqlite3';
      export function createUsersRepository(db: Database.Database) {
        const stmt = db.prepare('SELECT 1');
        void stmt;
      }
    `,
    'src/infrastructure/sqlite/migrations.ts': `
      import type Database from 'better-sqlite3';
      export function runMigrations(db: Database.Database) {
        db.pragma('user_version');
      }
    `,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  assert.deepEqual(fixture.violations, []);
});

test('keeps browser code out of server layers while permitting shared pure code', async (t) => {
  const fixture = await architectureFixture({
    'web/client/console.ts': `
      import { clean } from '../../src/shared/display';
      import { connect } from '../../src/integrations/rcon/client';
      void clean; void connect;
    `,
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  assert.deepEqual(fixture.violations, [
    'console.ts: browser code may import only browser code or src/shared (../../src/integrations/rcon/client)',
  ]);
});
