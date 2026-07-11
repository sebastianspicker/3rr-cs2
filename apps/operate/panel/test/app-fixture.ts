import fs from 'node:fs';
import path from 'node:path';
import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import {
  getLoginPageCsrfAndCookie,
  getPageCsrfToken,
  loginAndGetSession as loginWithCredentials,
} from './http-helpers';
import { mockModule } from './mock-module';
export {
  fs,
  path,
  assert,
  getLoginPageCsrfAndCookie,
  getPageCsrfToken,
  loginWithCredentials,
  mockModule,
};
export type { AddressInfo, Server, Express };

export let tmpDir: string;
export let dbPath: string;
export let app: Express;
export let sharedSessionCookie: string | null = null;
export const rconCommands: string[] = [];
export let failingRconCommands = new Set<string>();
export let rconInitSummary = {
  complete: true,
  total: 0,
  connected: 0,
  failed: 0,
  skipped: 0,
  errors: [] as Array<{ server_id?: string; serverIP?: string; message: string }>,
};

export function resetRconCommands(): void {
  rconCommands.length = 0;
}

export function setFailingRconCommands(commands: string[]): void {
  failingRconCommands = new Set(commands);
}

export function setRconInitSummary(summary: typeof rconInitSummary): void {
  rconInitSummary = summary;
}

export async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  return loginWithCredentials(port, 'testuser', ['test', 'pass', '12345'].join(''));
}

export async function loginOrReuseSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  if (sharedSessionCookie) {
    const csrfToken = await getPageCsrfToken(port, sharedSessionCookie);
    assert.ok(csrfToken, 'CSRF token should be available from shared session');
    return { sessionCookie: sharedSessionCookie, csrfToken };
  }
  const result = await loginAndGetSession(port);
  sharedSessionCookie = result.sessionCookie;
  return result;
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'testuser';
  process.env.DEFAULT_PASSWORD = ['test', 'pass', '12345'].join('');
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.ENABLE_E2E_TEST_ROUTES = 'true';

  mockModule('../modules/rcon.js', {
    default: {
      readyPromise: Promise.resolve(),
      executeCommand: async (_serverId: string, command: string) => {
        rconCommands.push(command);
        if (failingRconCommands.has(command)) {
          throw new Error(`Mocked RCON failure for ${command}`);
        }
        if (command === 'hostname') return 'hostname = Test Server';
        if (command === 'status') return 'players : 0 humans, 0 bots';
        if (command === 'sv_visiblemaxplayers') return 'sv_visiblemaxplayers = 10';
        return 'ok';
      },
      probeServer: async () => {},
      connectServer: async () => {},
      hasConnection: () => false,
      getConnectionInfo: () => null,
      getInitSummary: () => rconInitSummary,
      removeServer: async () => {},
      shutdownAll: async () => {},
    },
  });

  const mod = await import('../app');
  app = mod.default;

  // Create a test server (id=1) and grant the test user access so game route
  // authorization checks pass. The RCON connection will fail (no real server)
  // but input validation tests run before RCON is reached.
  const { better_sqlite_client: db } = await import('../db');
  db.prepare(
    `INSERT OR IGNORE INTO servers (id, serverIP, serverPort, rconPassword, owner_id) VALUES (1, '203.0.113.1', 27015, 'test', 1)`
  ).run();
  db.prepare(`INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (1, 1)`).run();
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
