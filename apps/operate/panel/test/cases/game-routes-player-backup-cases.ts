import { test } from 'node:test';
import {
  app,
  serverId,
  inaccessibleServerId,
  executedCommands,
  loginAndGetSession,
  withAuthedServer,
  assertLatestBackupParsing,
  assertBackupListStates,
  assert,
  type AddressInfo,
  type Server,
} from '../game-routes-fixture';
import { loopbackFetch } from '../support/http-helpers';

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
