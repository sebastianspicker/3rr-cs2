/** Middleware must not send Redis initialization commands before connection. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { mockModule } from '../unit/support/mock-module';
import type { composePanelRuntime } from '../../src/main';
import * as sqlite from '../../src/infrastructure/sqlite';

const { createPanelDatabase } = sqlite;

let release!: () => void;
const connected = new Promise<void>((resolve) => {
  release = resolve;
});
class RedisFixture extends EventEmitter {
  isOpen = false;
  isReady = false;
  calls = 0;
  async connect() {
    this.isOpen = true;
    await connected;
    this.isReady = true;
  }
  async sendCommand() {
    assert.ok(this.isReady, 'rate-limit Lua commands must wait for Redis readiness');
    this.calls += 1;
    return 'fixture-script-sha';
  }
  destroy() {
    this.isOpen = false;
    this.isReady = false;
  }
}
const client = new RedisFixture();
let failConstruction = false;
let lastDatabase: ReturnType<typeof createPanelDatabase> | undefined;
mockModule('redis', {
  createClient: () => {
    if (failConstruction) throw new TypeError('Invalid URL');
    return client;
  },
});
mockModule(require.resolve('../../src/infrastructure/sqlite'), {
  ...sqlite,
  createPanelDatabase: (...args: Parameters<typeof createPanelDatabase>) => {
    lastDatabase = createPanelDatabase(...args);
    return lastDatabase;
  },
});

test('composition connects Redis before constructing real session and rate-limit middleware', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '3rr-redis-startup-'));
  const previousPath = process.env.DB_PATH;
  const previousUrl = process.env.REDIS_URL;
  process.env.DB_PATH = path.join(directory, 'panel.db');
  process.env.REDIS_URL = 'redis://fixture.invalid';
  let runtime: Awaited<ReturnType<typeof composePanelRuntime>> | undefined;
  try {
    const { composePanelRuntime } = await import('../../src/main');
    const composing = composePanelRuntime('test');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(client.calls, 0);
    release();
    runtime = await composing;
    assert.equal(client.isReady, true);
    assert.equal(client.calls, 8);
    await runtime.rcon.shutdownAll();
    runtime.db.close();
    runtime = undefined;
    failConstruction = true;
    await assert.rejects(composePanelRuntime('test'), /Invalid URL/);
    assert.equal(lastDatabase?.open, false, 'malformed Redis config must release SQLite');
  } finally {
    release();
    await runtime?.rcon.shutdownAll();
    runtime?.db.close();
    client.destroy();
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
