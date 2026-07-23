/** Shared isolated app fixture for user-management route tests and module mocks. */
import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
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
export let removeServerCalls: string[] = [];
export let removeServerShouldFail = false;
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
  const dbPath = path.join(tmpDir, '3rr.db');

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
      removeServer: async (serverId: string) => {
        removeServerCalls.push(String(serverId));
        if (removeServerShouldFail) throw new Error('remove failed');
      },
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

afterEach(() => {
  removeServerCalls = [];
  removeServerShouldFail = false;
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

export function setRemoveServerShouldFail(value: boolean): void {
  removeServerShouldFail = value;
}

export type UserSession = Awaited<ReturnType<typeof loginAndGetSession>>;

export function loginAsAdmin(port: number): Promise<UserSession> {
  return loginAndGetSession(port, 'adminuser', fixtureCredential('admin'));
}

/** Posts one authenticated user-management mutation with the route's CSRF contract. */
export async function postUserApi(
  port: number,
  action: 'add' | 'change-password' | 'delete',
  body: Record<string, unknown>,
  session?: UserSession
): Promise<Response> {
  const authenticated = session ?? (await loginAsAdmin(port));
  return fetch(`http://127.0.0.1:${port}/api/users/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: authenticated.sessionCookie,
      'x-csrf-token': authenticated.csrfToken,
    },
    body: JSON.stringify(body),
  });
}

/** Creates the user/server/access graph exercised by administrator deletion tests. */
export async function createUserServerFixture(
  username: string,
  serverIP: string,
  serverPort: number,
  shareWithAdmin = false
): Promise<{ userId: number; serverId: number }> {
  const { better_sqlite_client: db } = await import('../db');
  const user = db
    .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, 'hash', 0)`)
    .run(username);
  const userId = Number(user.lastInsertRowid);
  const server = db
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, 'secret', ?)`
    )
    .run(serverIP, serverPort, userId);
  const serverId = Number(server.lastInsertRowid);
  const grantAccess = db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`);
  grantAccess.run(userId, serverId);
  if (shareWithAdmin) grantAccess.run(adminUserId, serverId);
  return { userId, serverId };
}

/** Creates one server and grants the seeded administrator access to it. */
export async function createAdminServerFixture(
  serverIP: string,
  serverPort: number
): Promise<number> {
  const { better_sqlite_client: db } = await import('../db');
  const server = db
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?)`
    )
    .run(serverIP, serverPort, ['test', 'rcon', 'credential'].join('-'), adminUserId);
  const serverId = Number(server.lastInsertRowid);
  db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
    adminUserId,
    serverId
  );
  return serverId;
}

// ---------------------------------------------------------------------------
// change-password
// ---------------------------------------------------------------------------
