/** Lifecycle and HTTP mechanics for status-route integration tests. */
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import { grantTestServerAccess, insertLoopbackTestServer } from './database-fixture';
import { loginAndGetSession, loopbackFetch } from './http-helpers';
import { mockModule } from './mock-module';

const TEST_USERNAME = 'statustest';
const TEST_PASSWORD = ['status', 'pass', '12345'].join('');
const CONNECTED_RCON_INFO = {
  host: '127.0.0.1',
  port: 27020,
  connected: true,
  authenticated: true,
};

export interface StatusFixture {
  readonly app: Express;
  readonly serverId: number;
  close(): Promise<void>;
  getAuthenticatedStatus(port: number, id?: number): Promise<Response>;
  getUnauthenticatedStatus(port: number, id?: number): Promise<Response>;
  resetRcon(): void;
  setFailingRconCommands(commands: readonly string[]): void;
  setRconUnavailable(): void;
  withServer(fn: (port: number) => Promise<void>): Promise<void>;
}

/** Creates the mocked app and isolated database used by the status endpoint scenarios. */
export async function createStatusFixture(): Promise<StatusFixture> {
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-status-'));
  const dbPath = path.join(tmpDir, '3rr.db');
  let failingRconCommands = new Set<string>();
  let rconConnectionInfo: typeof CONNECTED_RCON_INFO | null = CONNECTED_RCON_INFO;

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = TEST_USERNAME;
  process.env.DEFAULT_PASSWORD = TEST_PASSWORD;
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-status-session-secret-xyz';

  mockModule('../../modules/rcon.js', {
    default: {
      readyPromise: Promise.resolve(),
      executeCommand: async (_serverId: string, command: string) => {
        if (failingRconCommands.has(command)) throw new Error(`RCON unavailable: ${command}`);
        if (command === 'status') return 'players : 4 humans, 1 bots (not hibernating)';
        if (command === 'hostname') return 'hostname = Test Status Server';
        if (command === 'sv_visiblemaxplayers') return 'sv_visiblemaxplayers = 12 ( def. -1 )';
        return 'ok';
      },
      probeServer: async () => {},
      connectServer: async () => {},
      hasConnection: () => false,
      getConnectionInfo: () => rconConnectionInfo,
      removeServer: async () => {},
      shutdownAll: async () => {},
    },
  });

  const app = (await import('../../app')).default;
  const { better_sqlite_client: db } = await import('../../db');
  const serverId = insertLoopbackTestServer(db, 27020);
  grantTestServerAccess(db, serverId);

  return {
    app,
    serverId,
    async close(): Promise<void> {
      const rcon = (await import('../../modules/rcon')).default;
      await rcon.shutdownAll();
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    },
    async getAuthenticatedStatus(port: number, id = serverId): Promise<Response> {
      const { sessionCookie } = await loginAndGetSession(port, TEST_USERNAME, TEST_PASSWORD);
      return loopbackFetch(`http://127.0.0.1:${port}/api/status/${id}`, {
        headers: { cookie: sessionCookie },
      });
    },
    getUnauthenticatedStatus(port: number, id = serverId): Promise<Response> {
      return loopbackFetch(`http://127.0.0.1:${port}/api/status/${id}`);
    },
    resetRcon(): void {
      failingRconCommands = new Set();
      rconConnectionInfo = CONNECTED_RCON_INFO;
    },
    setFailingRconCommands(commands: readonly string[]): void {
      failingRconCommands = new Set(commands);
    },
    setRconUnavailable(): void {
      rconConnectionInfo = null;
    },
    async withServer(fn: (port: number) => Promise<void>): Promise<void> {
      const server: Server = app.listen(0);
      try {
        const { port } = server.address() as AddressInfo;
        await fn(port);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  };
}
