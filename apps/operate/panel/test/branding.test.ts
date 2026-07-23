/** Locks the public 3RR identity across operator and deployment surfaces. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const panelRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(panelRoot, '..', '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('public package, UI, storage, updater, and deployment names use 3RR', () => {
  const packageJson = JSON.parse(read('apps/operate/panel/package.json')) as {
    name: string;
    private: boolean;
    version: string;
  };
  const packageLock = JSON.parse(read('apps/operate/panel/package-lock.json')) as {
    name: string;
    packages: Record<string, { name?: string }>;
  };

  assert.equal(packageJson.name, '3rr-operate-panel');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.version, '1.1.0-alpha.1');
  assert.equal(packageLock.name, '3rr-operate-panel');
  assert.equal(packageLock.packages['']?.name, '3rr-operate-panel');

  assert.match(read('README.md'), /^# 3RR$/m);
  assert.match(read('apps/operate/panel/views/login.ejs'), /3RR/);
  assert.match(read('apps/operate/panel/views/partials/navbar.ejs'), />\/\/\/<\/span>/);
  assert.match(read('apps/operate/panel/public/3rr-mark.svg'), /aria-label="3RR"/);
  assert.match(read('apps/operate/panel/app.ts'), /'3rr\.sid'/);
  assert.match(read('apps/operate/panel/db.ts'), /data\/3rr\.db/);
  assert.match(read('configs/examples/compose/panel.compose.yaml'), /data\/3rr\.db/);
  assert.match(read('configs/examples/startup/server-start.sh'), /3rr-secrets\.cfg/);
  assert.match(
    read('apps/operate/panel/Dockerfile'),
    /COPY --from=builder \/build\/LICENSE \.\/LICENSE/
  );

  const updaterScript = 'apps/maintain/updater/3rr-update.sh';
  const updaterConfig = 'apps/maintain/updater/3rr-update.conf.example';
  const updaterService = 'configs/examples/systemd/3rr-update.service';
  const updaterTimer = 'configs/examples/systemd/3rr-update.timer';
  for (const relativePath of [updaterScript, updaterConfig, updaterService, updaterTimer]) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, relativePath);
  }
  assert.match(read(updaterService), /\/opt\/3rr\/apps\/maintain\/updater/);
  assert.match(read(updaterTimer), /3RR updater/);
});
