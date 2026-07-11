import { test } from 'node:test';
import {
  app,
  serverId,
  inaccessibleServerId,
  executedCommands,
  commandsThatFail,
  commandResponses,
  type RconCommandResponse,
  loginAndGetSession,
  withAuthedServer,
  createAccessibleServerForTest,
  countHistoryRows,
  assertLatestBackupParsing,
  assertBackupListStates,
  assert,
  type AddressInfo,
  type Server,
} from './game-routes-fixture';
import { loopbackFetch } from './http-helpers';

test('POST /api/rcon rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, command: 'status' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon reports command and history success separately', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const command = 'status srp010-success';
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as RconCommandResponse;
    assert.equal(body.message, 'Command sent.');
    assert.equal(body.command_sent, true);
    assert.equal(body.history_recorded, true);
    assert.equal(body.partial, false);
    assert.equal(await countHistoryRows(command), 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon reports partial success when history persistence fails after dispatch', async () => {
  const server: Server = app.listen(0);
  const { better_sqlite_client: db } = await import('../db');
  db.exec(`
    DROP TRIGGER IF EXISTS fail_rcon_history_insert;
    CREATE TEMP TRIGGER fail_rcon_history_insert
    BEFORE INSERT ON rcon_command_history
    BEGIN
      SELECT RAISE(ABORT, 'simulated history write failure');
    END;
  `);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const command = 'status srp010-history-failure';
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as RconCommandResponse;
    assert.equal(body.message, 'Command sent, but history was not recorded.');
    assert.equal(body.command_sent, true);
    assert.equal(body.history_recorded, false);
    assert.equal(body.partial, true);
    assert.deepEqual(executedCommands, [command]);
    assert.equal(await countHistoryRows(command), 0);
  } finally {
    db.exec(`DROP TRIGGER IF EXISTS fail_rcon_history_insert`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon does not record history when command dispatch fails', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const command = 'status srp010-rcon-failure';
    commandsThatFail.add(command);
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as RconCommandResponse;
    assert.match(body.error ?? '', /RCON/);
    assert.equal(body.command_sent, undefined);
    assert.equal(await countHistoryRows(command), 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon rejects a blocked command', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command: 'exec config.cfg' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Command not allowed/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon rejects a command containing non-ASCII characters', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, command: 'status\u013B' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('game-control success messages report command dispatch, not verified state changes', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const post = async (path: string, body: Record<string, unknown>) => {
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
      assert.equal(res.status, 200, path);
      return (await res.json()) as { message: string };
    };
    const definitiveStateClaim =
      /\b(created|restarted|paused|unpaused|kicked|muted|unmuted|enabled|disabled|started|loaded|restored|set to|assigned|gave)\b/i;

    commandResponses.set('mp_restartgame 1', 'Unknown command: mp_restartgame');
    const restart = await post('/api/restart', {});
    assert.equal(restart.message, 'Restart command sent.');
    assert.doesNotMatch(restart.message, definitiveStateClaim);
    assert.deepEqual(executedCommands, ['mp_restartgame 1']);

    executedCommands.length = 0;
    commandResponses.set('kickid 10000', 'userid not found');
    const kick = await post('/api/player-kick', { userid: '10000' });
    assert.equal(kick.message, 'Kick command sent for player 10000.');
    assert.doesNotMatch(kick.message, definitiveStateClaim);
    assert.deepEqual(executedCommands, ['kickid 10000']);
  });
});

// ── /api/players ─────────────────────────────────────────────────────────────

test('GET /api/players/:server_id rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/players/${serverId}`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/players/:server_id enforces server access', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/players/${inaccessibleServerId}`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/players/:server_id parses player identities and live slot counts', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await loopbackFetch(`${baseUrl}/api/players/${serverId}`, {
      headers: { cookie: auth.sessionCookie },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      players: Array<{ userid: string; name: string; steam_id64: string | null }>;
      humans: number | null;
      bots: number | null;
      max_players: number | null;
      error: string | null;
    };
    assert.equal(body.players.length, 2);
    assert.equal(body.players[0]?.userid, '2');
    assert.equal(body.players[0]?.steam_id64, '76561197960278073');
    assert.equal(body.players[1]?.steam_id64, null);
    assert.equal(body.humans, 2);
    assert.equal(body.bots, 0);
    assert.equal(body.max_players, 12);
    assert.equal(body.error, null);
  });
});

test('POST /api/player-kick sends one kickid command for bounded userids', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const kickRes = await loopbackFetch(`${baseUrl}/api/player-kick`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: auth.sessionCookie,
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, userid: '10000' }),
    });
    assert.equal(kickRes.status, 200);
    assert.deepEqual(executedCommands, ['kickid 10000']);
  });
});

test('POST /api/player-kick rejects oversized userids without sending RCON', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const invalidKickRes = await loopbackFetch(`${baseUrl}/api/player-kick`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: auth.sessionCookie,
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, userid: '100000' }),
    });
    assert.equal(invalidKickRes.status, 400);
    assert.deepEqual(executedCommands, []);
  });
});

test('POST /api/restore-latest-backup classifies latest-backup output before restore', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    await assertLatestBackupParsing(baseUrl, auth);
  });
});

test('POST /api/list-backups distinguishes listed, none, and unknown backup states', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    await assertBackupListStates(baseUrl, auth);
  });
});

// ── /api/rcon/autocomplete ───────────────────────────────────────────────────

test('GET /api/rcon/autocomplete/:server_id filters suggestions and reports cache hits truthfully', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);
    const policyRes = await fetch(
      `http://127.0.0.1:${port}/api/rcon/autocomplete/${serverId}?q=sv&limit=10&refresh=1`,
      { headers: { cookie: sessionCookie } }
    );
    assert.equal(policyRes.status, 200);
    const policyBody = (await policyRes.json()) as { suggestions: string[]; error: string | null };
    assert.deepEqual(policyBody.suggestions, ['sv_visiblemaxplayers']);
    assert.equal(policyBody.error, null);
    executedCommands.length = 0;

    const autocompleteServerId = await createAccessibleServerForTest();
    const baseUrl = `http://127.0.0.1:${port}`;
    const requestAutocomplete = async (query = '') => {
      const res = await fetch(
        `${baseUrl}/api/rcon/autocomplete/${autocompleteServerId}?q=sv&limit=10${query}`,
        { headers: { cookie: sessionCookie } }
      );
      assert.equal(res.status, 200);
      return (await res.json()) as {
        suggestions: string[];
        cached: boolean;
        error: string | null;
      };
    };

    const first = await requestAutocomplete();
    assert.equal(first.cached, false);
    assert.deepEqual(first.suggestions, ['sv_visiblemaxplayers']);
    assert.deepEqual(executedCommands, ['cmdlist', 'cvarlist']);
    executedCommands.length = 0;

    const second = await requestAutocomplete();
    assert.equal(second.cached, true);
    assert.deepEqual(second.suggestions, ['sv_visiblemaxplayers']);
    assert.deepEqual(executedCommands, []);

    const refreshed = await requestAutocomplete('&refresh=1');
    assert.equal(refreshed.cached, false);
    assert.deepEqual(refreshed.suggestions, ['sv_visiblemaxplayers']);
    assert.deepEqual(executedCommands, ['cmdlist', 'cvarlist']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── multi-command controls ───────────────────────────────────────────────────
