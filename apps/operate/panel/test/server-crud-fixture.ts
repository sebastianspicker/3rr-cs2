import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import {
  configurePanelTestEnvironment,
  loginAndGetSession as loginWithCredentials,
  loopbackFetch,
} from './http-helpers';
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

export interface AddServerRequest {
  server_ip: string;
  server_port: number;
  rcon_password: string;
}

export type AuthenticatedPanelSession = {
  sessionCookie: string;
  csrfToken: string;
};

export async function loginAndGetSession(port: number): Promise<AuthenticatedPanelSession> {
  return loginWithCredentials(port, 'testuser', ['test', 'pass', '12345'].join(''));
}

/** Runs one callback against an ephemeral listener for the shared panel fixture. */
export async function withPanelServer(fn: (port: number) => Promise<void>): Promise<void> {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Posts an authenticated add-server request using the panel's CSRF contract. */
export function postAddServer(
  port: number,
  session: AuthenticatedPanelSession,
  body: AddServerRequest
): Promise<Response> {
  return loopbackFetch(`http://127.0.0.1:${port}/api/add-server`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: session.sessionCookie,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify(body),
  });
}

/** Retrieves the caller's server list using its authenticated session cookie. */
export function getAccessibleServers(port: number, sessionCookie: string): Promise<Response> {
  return loopbackFetch(`http://127.0.0.1:${port}/api/servers`, {
    headers: { accept: 'application/json', cookie: sessionCookie },
  });
}

/** Posts an authenticated delete-server request using the panel's CSRF contract. */
export async function postDeleteServer(
  port: number,
  serverId: unknown,
  session?: AuthenticatedPanelSession
): Promise<Response> {
  const authenticated = session ?? (await loginAndGetSession(port));
  return loopbackFetch(`http://127.0.0.1:${port}/api/delete-server`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: authenticated.sessionCookie,
      'x-csrf-token': authenticated.csrfToken,
    },
    body: JSON.stringify({ server_id: serverId }),
  });
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-3rr-'));
  dbPath = path.join(tmpDir, '3rr.db');

  configurePanelTestEnvironment(dbPath, {
    username: 'testuser',
    password: ['test', 'pass', '12345'].join(''),
    sessionSecret: 'test-session-secret',
  });

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

/** Seeds user one's access list to the limit, returning the refreshed record and its cleanup. */
export async function seedServerCapacity(): Promise<{
  target: { id: number; serverIP: string; serverPort: number };
  cleanup: () => void;
}> {
  const { better_sqlite_client: db } = await import('../db');
  const current = db
    .prepare(`SELECT COUNT(*) AS count FROM server_access WHERE user_id = 1`)
    .get() as { count: number };
  assert.ok(current.count < 50, 'fixture must start below the server limit');
  const serverIds: number[] = [];
  for (let index = current.count; index < 50; index += 1) {
    const inserted = db
      .prepare(
        `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id)
         VALUES ('198.51.100.250', ?, 'old-limit-password', 1)`
      )
      .run(28100 + index);
    const serverId = Number(inserted.lastInsertRowid);
    serverIds.push(serverId);
    db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (1, ?)`).run(serverId);
  }
  const targetId = serverIds[0];
  assert.ok(targetId !== undefined, 'capacity fixture must create a target server');
  const target = db
    .prepare(`SELECT id, serverIP, serverPort FROM servers WHERE id = ?`)
    .get(targetId) as { id: number; serverIP: string; serverPort: number };
  return {
    target,
    cleanup: () => {
      for (const serverId of serverIds)
        db.prepare(`DELETE FROM servers WHERE id = ?`).run(serverId);
    },
  };
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

/** Installs the deterministic access-insert failure used by transaction rollback tests. */
export function installFailingServerAccessTrigger(
  db: Database.Database,
  triggerName: 'test_fail_new_server_access' | 'test_fail_existing_server_access'
): () => void {
  db.exec(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON server_access
    WHEN NEW.user_id = 1
    BEGIN
      SELECT RAISE(ABORT, 'forced server access failure');
    END
  `);
  return () => db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`);
}
