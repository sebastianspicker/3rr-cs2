import { test } from 'node:test';
import {
  app,
  rconCommands,
  resetRconCommands,
  setFailingRconCommands,
  loginAndGetSession,
  assert,
  withAppServer,
  postJson,
  type AddressInfo,
  type Server,
} from './app-fixture';
import { assertSetupGameMapCase, submitSetupGame } from './app-setup-game-helpers';

test('POST /api/test/servers is not mounted when the legacy E2E route flag is present', async () => {
  await withAppServer(async (baseUrl) => {
    const res = await postJson(baseUrl, '/api/test/servers', {});
    assert.equal(res.status, 404);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Not found');
  });
});

// ─── Quick-wins: auth guard for all 12 new routes ───────────────────────────
const QUICK_WIN_ROUTES = [
  '/api/matchzy-abort',
  '/api/matchzy-coach',
  '/api/matchzy-load-match-file',
  '/api/player-kick',
  '/api/player-mute',
  '/api/player-unmute',
  '/api/set-mapgroup',
  '/api/workshop-collection',
  '/api/damage-print-toggle',
  '/api/set-buytime',
  '/api/noclip',
  '/api/rethrow-grenade',
];

for (const route of QUICK_WIN_ROUTES) {
  test(`POST ${route} returns 401 without session`, async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ server_id: 1 }),
      });
      assert.equal(res.status, 401);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}

// ─── Quick-wins: input validation (authenticated) ────────────────────────────
test('POST /api/matchzy-coach returns 400 for invalid side', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/matchzy-coach`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, side: 'invalid' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/matchzy-load-match-file returns 400 for non-.json filename', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/matchzy-load-match-file`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, filename: '../../etc/passwd' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/player-kick returns 400 for non-numeric userid', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/player-kick`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, userid: 'badid' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/player-mute returns 400 for non-SteamID64 value', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/player-mute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, steamid: '12345' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/set-mapgroup returns 400 for unknown group', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/set-mapgroup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, group: 'nonexistent_group' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/workshop-collection returns 400 for too-short id', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-collection`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, collection_id: '123' }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/set-buytime returns 400 for invalid preset value', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/set-buytime`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, value: 999 }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: wingman rejects active-duty map (de_mirage not in mg_wingman)', async () => {
  await assertSetupGameMapCase({
    name: 'wingman rejects active-duty map',
    gameType: 'competitive',
    gameMode: 'wingman',
    selectedMap: 'de_mirage',
    expectedStatus: 400,
  });
});

test('POST /api/setup-game: wingman accepts wingman map', async () => {
  await assertSetupGameMapCase({
    name: 'wingman accepts wingman map',
    gameType: 'competitive',
    gameMode: 'wingman',
    selectedMap: 'de_overpass',
    expectedStatus: 200,
  });
});

test('POST /api/setup-game does not change map when execCfg fails', async () => {
  try {
    resetRconCommands();
    setFailingRconCommands(['exec wingman.cfg']);
    const res = await submitSetupGame({
      gameType: 'competitive',
      gameMode: 'wingman',
      selectedMap: 'de_overpass',
      team1: 'Alpha',
      team2: 'Bravo',
    });

    assert.equal(res.status, 500);
    assert.equal(rconCommands.includes('exec wingman.cfg'), true);
    assert.equal(
      rconCommands.some((command) => command.startsWith('changelevel ')),
      false
    );
  } finally {
    setFailingRconCommands([]);
    resetRconCommands();
  }
});

test('POST /api/setup-game: ctf rejects non-ctf map', async () => {
  await assertSetupGameMapCase({
    name: 'ctf rejects non-ctf map',
    gameType: 'fun',
    gameMode: 'ctf',
    selectedMap: 'de_mirage',
    expectedStatus: 400,
  });
});

test('POST /api/setup-game: ctf accepts ctf map', async () => {
  await assertSetupGameMapCase({
    name: 'ctf accepts ctf map',
    gameType: 'fun',
    gameMode: 'ctf',
    selectedMap: 'workshop/3555531615/ctf_2fort',
    expectedStatus: 200,
  });
});
