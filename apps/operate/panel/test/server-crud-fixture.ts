import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import { loginAndGetSession as loginWithCredentials } from './http-helpers';
import { mockModule } from './mock-module';

export { assert };
export type { AddressInfo, Server };

export let tmpDir: string;
export let dbPath: string;
export let app: Express;
export let probeShouldFail = false;
export let connectShouldFail = false;
export let removeServerShouldFail = false;
export let probeCalls: RconServerArg[] = [];
export let connectCalls: RconServerArg[] = [];
export let removeServerCalls: string[] = [];
export let connectedServerIds = new Set<string>();
export let failingHostnameServerIds = new Set<string>();
export let hangingHostnameServerIds = new Set<string>();
export let hostnameByServerId = new Map<string, string>();
export let connectionInfoByServerId = new Map<
  string,
  { host: string; port: number; connected: boolean; authenticated: boolean }
>();

export interface RconServerArg {
  id: number;
  serverIP: string;
  serverPort: number;
  rconPassword: string;
}

export interface ServerListItem {
  id: number;
  serverIP: string;
  serverPort: number;
  hostname: string;
  connected: boolean;
  authenticated: boolean;
  status: 'connected' | 'disconnected' | 'unknown' | 'error';
  observed_at: string | null;
  status_source: 'not_observed' | 'rcon_connection' | 'rcon_hostname';
  timed_out: boolean;
  error: string | null;
}

export async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  return loginWithCredentials(port, 'testuser', ['test', 'pass', '12345'].join(''));
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

  mockModule('../modules/rcon.js', {
    default: {
      readyPromise: Promise.resolve(),
      executeCommand: async (serverId: string, command: string) => {
        const sid = String(serverId);
        if (command === 'hostname') {
          if (hangingHostnameServerIds.has(sid)) {
            return await new Promise<string>(() => {});
          }
          if (failingHostnameServerIds.has(sid)) {
            throw new Error('hostname failed');
          }
          return `hostname = ${hostnameByServerId.get(sid) ?? 'Test Server'}`;
        }
        return 'ok';
      },
      probeServer: async (serverRecord: RconServerArg) => {
        probeCalls.push({ ...serverRecord });
        if (probeShouldFail) {
          throw new Error('probe failed');
        }
      },
      connectServer: async (serverRecord: RconServerArg) => {
        connectCalls.push({ ...serverRecord });
        return !connectShouldFail;
      },
      hasConnection: (serverId: string) => connectedServerIds.has(String(serverId)),
      getConnectionInfo: (serverId: string) =>
        connectionInfoByServerId.get(String(serverId)) ?? null,
      removeServer: async (serverId: string) => {
        removeServerCalls.push(String(serverId));
        if (removeServerShouldFail) {
          throw new Error('remove failed');
        }
      },
      shutdownAll: async () => {},
    },
  });

  const mod = await import('../app');
  app = mod.default;
});

afterEach(() => {
  probeShouldFail = false;
  connectShouldFail = false;
  removeServerShouldFail = false;
  probeCalls = [];
  connectCalls = [];
  removeServerCalls = [];
  connectedServerIds = new Set<string>();
  failingHostnameServerIds = new Set<string>();
  hangingHostnameServerIds = new Set<string>();
  hostnameByServerId = new Map<string, string>();
  connectionInfoByServerId = new Map<
    string,
    { host: string; port: number; connected: boolean; authenticated: boolean }
  >();
  delete process.env.RCON_SECRET_KEY;
});

after(async () => {
  // Shut down the singleton RCON manager so background connections don't keep
  // the Node process alive (the add-server test fires off a connect).
  const rcon = (await import('../modules/rcon')).default;
  await rcon.shutdownAll();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

export async function insertAccessibleServer(
  serverIP: string,
  serverPort: number
): Promise<number> {
  const { better_sqlite_client: db } = await import('../db');
  const inserted = db
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, 'stored-password', 1)`
    )
    .run(serverIP, serverPort);
  const serverId = Number(inserted.lastInsertRowid);
  db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (1, ?)`).run(serverId);
  return serverId;
}

export function setProbeShouldFail(value: boolean): void {
  probeShouldFail = value;
}

export function setConnectShouldFail(value: boolean): void {
  connectShouldFail = value;
}

export function setRemoveServerShouldFail(value: boolean): void {
  removeServerShouldFail = value;
}
