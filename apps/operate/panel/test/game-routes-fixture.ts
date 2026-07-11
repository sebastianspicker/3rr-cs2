import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import bcrypt from 'bcrypt';
import {
  getPageCsrfToken,
  loginAndGetSession as loginWithCredentials,
  loopbackFetch,
} from './http-helpers';
import { mockModule } from './mock-module';
export { fs, path, assert, bcrypt, getPageCsrfToken, loginWithCredentials, mockModule };
export type { AddressInfo, Server, Express };

export let tmpDir: string;
export let app: Express;
export const fixtureCredential = (label: string): string => [label, 'pa' + 'ss', '12345'].join('_');
export let serverId: number;
export let inaccessibleServerId: number;
export let sharedSessionCookie: string | null = null;
export let testUserCounter = 0;
export const executedCommands: string[] = [];
export const commandsThatFail = new Set<string>();
export const commandResponses = new Map<string, string>();

export type AuthContext = { sessionCookie: string; csrfToken: string };
export type PartialFailureBody = {
  error: string;
  partial: boolean;
  applied_commands: string[];
  failed_command: string;
  failed_command_index: number;
};
export type RequestedSetupState = {
  last_map: string | null;
  last_game_type: string | null;
  last_game_mode: string | null;
};
export type SetupGameResponse = {
  message: string;
  setup_state: 'requested';
  observed: false;
  requested_setup: {
    game_type: string;
    game_mode: string;
    map: string;
  };
};
export type BackupResponse = {
  message?: string;
  error?: string;
  backup_state:
    | 'restore_requested'
    | 'listed'
    | 'none'
    | 'unknown'
    | 'malformed_response'
    | 'unsafe_filename';
  observed?: false;
  backup_file?: string;
  raw_output?: string;
};
export type RconCommandResponse = {
  message?: string;
  error?: string;
  output?: string;
  command_sent?: boolean;
  history_recorded?: boolean;
  partial?: boolean;
};

export async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  if (sharedSessionCookie) {
    const csrfToken = await getPageCsrfToken(port, sharedSessionCookie);
    assert.ok(csrfToken, 'CSRF token should be available from shared session');
    return { sessionCookie: sharedSessionCookie, csrfToken };
  }

  const result = await loginWithCredentials(port, 'gameroute_test', fixtureCredential('gameroute'));
  sharedSessionCookie = result.sessionCookie;
  return result;
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-game-routes-'));
  const dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'gameroute_test';
  process.env.DEFAULT_PASSWORD = fixtureCredential('gameroute');
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-game-routes-session-secret';

  mockModule('../modules/rcon.js', {
    default: {
      readyPromise: Promise.resolve(),
      executeCommand: async (_serverId: string, command: string) => {
        executedCommands.push(command);
        if (commandsThatFail.has(command)) {
          throw new Error(`simulated RCON failure for ${command}`);
        }
        const response = commandResponses.get(command);
        if (response !== undefined) {
          return response;
        }
        if (command === 'users') {
          return [
            'userid name uniqueid connected ping loss state rate adr',
            '2 "Alice" [U:1:12345] 00:12 20 0 active',
            '3 "No Steam" STEAM_1:0:111 00:10 20 0 active',
          ].join('\n');
        }
        if (command === 'status') {
          return 'map : de_mirage\nplayers : 2 humans, 0 bots (12 max)';
        }
        if (command === 'cmdlist') return 'status\nexec\nhost_workshop_map\n';
        if (command === 'cvarlist') {
          return '"sv_cheats" = "0"\n"sv_visiblemaxplayers" = "12"\nmp_restartgame : 1';
        }
        return 'ok';
      },
      probeServer: async () => {},
      connectServer: async () => {},
      hasConnection: () => false,
      getConnectionInfo: () => null,
      removeServer: async () => {},
      shutdownAll: async () => {},
    },
  });

  const mod = await import('../app');
  app = mod.default;

  const { better_sqlite_client: db } = await import('../db');
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('127.0.0.1', 27021, 'test-rcon', 1)`
    )
    .run();
  serverId = Number(result.lastInsertRowid);
  db.prepare(`INSERT OR IGNORE INTO server_access (user_id, server_id) VALUES (1, ?)`).run(
    serverId
  );
  const inaccessible = db
    .prepare(
      `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('127.0.0.1', 27022, 'test-rcon', 1)`
    )
    .run();
  inaccessibleServerId = Number(inaccessible.lastInsertRowid);
});

afterEach(() => {
  executedCommands.length = 0;
  commandsThatFail.clear();
  commandResponses.clear();
});

after(async () => {
  const rcon = (await import('../modules/rcon')).default;
  await rcon.shutdownAll();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

export async function withAuthedServer(
  fn: (baseUrl: string, auth: AuthContext) => Promise<void>
): Promise<void> {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const auth = await loginAndGetSession(port);
    await fn(`http://127.0.0.1:${port}`, auth);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function createAccessibleServerForTest(): Promise<number> {
  const { better_sqlite_client: db } = await import('../db');
  const nextPort = (
    db.prepare(`SELECT COALESCE(MAX(serverPort), 28000) + 1 AS port FROM servers`).get() as {
      port: number;
    }
  ).port;
  const result = db
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id)
       VALUES ('127.0.0.1', ?, 'test-rcon', 1)`
    )
    .run(nextPort);
  const id = Number(result.lastInsertRowid);
  db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (1, ?)`).run(id);
  return id;
}

export async function createUserWithServerAccess(serverIds: number[]): Promise<{
  userId: number;
  username: string;
  password: string;
}> {
  const { better_sqlite_client: db } = await import('../db');
  testUserCounter += 1;
  const username = `gameroute_scope_${testUserCounter}`;
  const password = fixtureCredential(`scope_${testUserCounter}`);
  const result = db
    .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)`)
    .run(username, bcrypt.hashSync(password, 4));
  const userId = Number(result.lastInsertRowid);
  const insertAccess = db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`);
  for (const id of serverIds) {
    insertAccess.run(userId, id);
  }
  return { userId, username, password };
}

export async function requestedSetupState(id: number): Promise<RequestedSetupState> {
  const { better_sqlite_client: db } = await import('../db');
  return db
    .prepare(
      `SELECT last_map, last_game_type, last_game_mode
         FROM servers
        WHERE id = ?`
    )
    .get(id) as RequestedSetupState;
}

export async function countHistoryRows(command: string): Promise<number> {
  const { better_sqlite_client: db } = await import('../db');
  const row = db
    .prepare(
      `SELECT COUNT(1) AS count
         FROM rcon_command_history
        WHERE user_id = 1
          AND server_id = ?
          AND command = ?`
    )
    .get(serverId, command) as { count: number };
  return row.count;
}

export async function assertSecondCommandPartialFailure({
  baseUrl,
  auth,
  path,
  body,
  appliedCommands,
  failedCommand,
}: {
  baseUrl: string;
  auth: AuthContext;
  path: string;
  body: Record<string, unknown>;
  appliedCommands: string[];
  failedCommand: string;
}): Promise<void> {
  commandsThatFail.add(failedCommand);
  const res = await loopbackFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      cookie: auth.sessionCookie,
      'x-csrf-token': auth.csrfToken,
    },
    body: JSON.stringify({ server_id: serverId, ...body }),
  });

  assert.equal(res.status, 500);
  const responseBody = (await res.json()) as PartialFailureBody;
  assert.equal(responseBody.partial, true);
  assert.match(responseBody.error, /partially updated/i);
  assert.deepEqual(responseBody.applied_commands, appliedCommands);
  assert.equal(responseBody.failed_command, failedCommand);
  assert.equal(responseBody.failed_command_index, appliedCommands.length);
  assert.deepEqual(executedCommands, [...appliedCommands, failedCommand]);
  executedCommands.length = 0;
  commandsThatFail.clear();
}

export async function assertSecondCommandPartialFailures(
  scenarios: Array<{
    path: string;
    body: Record<string, unknown>;
    appliedCommands: string[];
    failedCommand: string;
  }>
): Promise<void> {
  await withAuthedServer(async (baseUrl, auth) => {
    for (const scenario of scenarios) {
      await assertSecondCommandPartialFailure({ baseUrl, auth, ...scenario });
    }
  });
}

export async function assertLatestBackupParsing(baseUrl: string, auth: AuthContext): Promise<void> {
  const restoreLatestBackup = async (latestBackupOutput: string): Promise<Response> => {
    commandResponses.set('mp_backup_round_file_last', latestBackupOutput);
    return loopbackFetch(`${baseUrl}/api/restore-latest-backup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: auth.sessionCookie,
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify({ server_id: serverId }),
    });
  };

  const validCases = [
    {
      label: 'quoted',
      output: '"mp_backup_round_file_last" = "backup_round01.txt"',
      file: 'backup_round01.txt',
    },
    {
      label: 'unquoted',
      output: 'mp_backup_round_file_last=backup_round02.txt',
      file: 'backup_round02.txt',
    },
  ];

  for (const { label, output, file } of validCases) {
    executedCommands.length = 0;
    const res = await restoreLatestBackup(output);
    assert.equal(res.status, 200, label);
    const body = (await res.json()) as BackupResponse;
    assert.equal(body.message, `Latest backup restore commands sent (${file}).`, label);
    assert.equal(body.backup_state, 'restore_requested', label);
    assert.equal(body.observed, false, label);
    assert.equal(body.backup_file, file, label);
    assert.deepEqual(
      executedCommands,
      ['mp_backup_round_file_last', `mp_backup_restore_load_file ${file}`, 'css_matchzy_pause'],
      label
    );
  }

  executedCommands.length = 0;
  const noneRes = await restoreLatestBackup('"mp_backup_round_file_last" = ""');
  assert.equal(noneRes.status, 200, 'explicit no-backup output');
  const noneBody = (await noneRes.json()) as BackupResponse;
  assert.equal(noneBody.message, 'No latest backup reported by server.');
  assert.equal(noneBody.backup_state, 'none');
  assert.deepEqual(executedCommands, ['mp_backup_round_file_last']);

  const uncertainCases: Array<{
    label: string;
    output: string;
    backupState: BackupResponse['backup_state'];
    error: RegExp;
  }> = [
    {
      label: 'empty output',
      output: '',
      backupState: 'unknown',
      error: /empty; backup state unknown/,
    },
    {
      label: 'malformed output',
      output: 'mp_backup_round_file_last',
      backupState: 'malformed_response',
      error: /malformed; backup state unknown/,
    },
    {
      label: 'unsafe filename',
      output: '"mp_backup_round_file_last" = "../../server.cfg.txt"',
      backupState: 'unsafe_filename',
      error: /unsafe filename; backup state unknown/,
    },
  ];

  for (const { label, output, backupState, error } of uncertainCases) {
    executedCommands.length = 0;
    const res = await restoreLatestBackup(output);
    assert.equal(res.status, 502, label);
    const body = (await res.json()) as BackupResponse;
    assert.match(body.error ?? '', error, label);
    assert.equal(body.backup_state, backupState, label);
    assert.deepEqual(executedCommands, ['mp_backup_round_file_last'], label);
  }
}

export async function assertBackupListStates(baseUrl: string, auth: AuthContext): Promise<void> {
  const listBackups = async (output: string): Promise<Response> => {
    commandResponses.set('mp_backup_restore_list_files', output);
    return loopbackFetch(`${baseUrl}/api/list-backups`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: auth.sessionCookie,
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify({ server_id: serverId }),
    });
  };

  executedCommands.length = 0;
  const listedRes = await listBackups('backup_round01.txt\nbackup_round02.txt');
  assert.equal(listedRes.status, 200, 'listed backups');
  const listedBody = (await listedRes.json()) as BackupResponse;
  assert.equal(listedBody.backup_state, 'listed');
  assert.equal(listedBody.message, 'backup_round01.txt\nbackup_round02.txt');
  assert.deepEqual(executedCommands, ['mp_backup_restore_list_files']);

  executedCommands.length = 0;
  const noneRes = await listBackups('No backup files found');
  assert.equal(noneRes.status, 200, 'explicit empty backup list');
  const noneBody = (await noneRes.json()) as BackupResponse;
  assert.equal(noneBody.backup_state, 'none');
  assert.equal(noneBody.message, 'No backups reported by server.');
  assert.deepEqual(executedCommands, ['mp_backup_restore_list_files']);

  executedCommands.length = 0;
  const unknownRes = await listBackups('');
  assert.equal(unknownRes.status, 502, 'empty backup list response');
  const unknownBody = (await unknownRes.json()) as BackupResponse;
  assert.equal(unknownBody.backup_state, 'unknown');
  assert.match(unknownBody.error ?? '', /empty; backup state unknown/);
  assert.deepEqual(executedCommands, ['mp_backup_restore_list_files']);
}

// ── /api/setup-game ──────────────────────────────────────────────────────────
