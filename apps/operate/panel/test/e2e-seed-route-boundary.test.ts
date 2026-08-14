import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import session from 'express-session';
import type { Express } from 'express';
import { mockModule } from './mock-module';

let tmpDir: string;
let dbPath: string;
let app: Express;

const fakeRedisClient = {
  isReady: true,
  on: (_event: string, _listener: (...args: unknown[]) => void) => fakeRedisClient,
  connect: async () => undefined,
  quit: async () => undefined,
  sendCommand: async (_args: string[]) => null,
};

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-e2e-seed-boundary-'));
  dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'production';
  process.env.DB_PATH = dbPath;
  process.env.SESSION_SECRET = 'prod-session-secret-strong-value-123456';
  process.env.RCON_SECRET_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'false';
  process.env.ENABLE_E2E_TEST_ROUTES = 'true';

  mockModule('connect-redis', {
    RedisStore: session.MemoryStore,
  });
  mockModule('../utils/redis.js', {
    redisClient: fakeRedisClient,
    makeRateLimitStore: () => undefined,
  });

  const mod = await import('../app');
  app = mod.default;
});

after(async () => {
  try {
    const { better_sqlite_client } = await import('../db');
    better_sqlite_client.close();
  } catch {
    // ignore cleanup errors
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('production app does not expose the legacy E2E seed route', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/test/servers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 404);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Not found');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
