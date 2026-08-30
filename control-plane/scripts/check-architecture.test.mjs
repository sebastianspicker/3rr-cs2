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
