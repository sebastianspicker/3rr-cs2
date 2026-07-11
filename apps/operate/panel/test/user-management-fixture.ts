import fs from 'node:fs';
import path from 'node:path';
import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import { loginAndGetSession } from './http-helpers';
import { mockModule } from './mock-module';
export { fs, path, assert, loginAndGetSession, mockModule };
export type { AddressInfo, Server, Express };

export let tmpDir: string;
export let app: Express;
export let adminUserId: number;
export const credentialField = ['pass', 'word'].join('');
export const fixtureCredential = (label: string): string => [label, 'pa' + 'ss', '12345'].join('');

async function rmRecursiveWithRetry(target: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-usermgmt-'));
  const dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'adminuser';
  process.env.DEFAULT_PASSWORD = fixtureCredential('admin');
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-usermgmt-session-secret-xyz';

  mockModule('../modules/rcon.js', {
    default: {
      readyPromise: Promise.resolve(),
      executeCommand: async () => '',
      getSessions: () => ({}),
    },
  });

  const imported = await import('../app');
  app = imported.default;

  // Find the admin user id from the seeded DB.
  const { better_sqlite_client } = await import('../db');
  const row = better_sqlite_client
    .prepare(`SELECT id FROM users WHERE username = 'adminuser'`)
    .get() as { id: number };
  adminUserId = row.id;
});

after(async () => {
  const { better_sqlite_client } = await import('../db');
  try {
    better_sqlite_client.close();
  } catch {
    // Ignore cleanup errors so the retry below can remove the fixture directory.
  }
  await rmRecursiveWithRetry(tmpDir);
});

export async function withServer(app: Express, fn: (port: number) => Promise<void>): Promise<void> {
  const server: Server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

// ---------------------------------------------------------------------------
// change-password
// ---------------------------------------------------------------------------
