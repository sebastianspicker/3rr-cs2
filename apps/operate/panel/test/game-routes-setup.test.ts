import { test } from 'node:test';
import {
  app,
  serverId,
  executedCommands,
  commandsThatFail,
  commandResponses,
  type SetupGameResponse,
  loginAndGetSession,
  createAccessibleServerForTest,
  requestedSetupState,
  assert,
  type AddressInfo,
  type Server,
} from './game-routes-fixture';

test('POST /api/setup-game rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game returns requested-state metadata for a valid payload', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as SetupGameResponse;
    assert.equal(body.message, 'Game setup commands sent.');
    assert.equal(body.setup_state, 'requested');
    assert.equal(body.observed, false);
    assert.deepEqual(body.requested_setup, {
      game_type: 'competitive',
      game_mode: 'competitive',
      map: 'de_dust2',
    });
    assert.deepEqual(executedCommands, ['exec warmup.cfg', 'changelevel de_dust2']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game reports config failure before sending later setup commands', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    commandsThatFail.add('exec oitc.cfg');
    const missingCfgRes = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'fun',
        game_mode: 'oitc',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(missingCfgRes.status, 500);
    assert.deepEqual(executedCommands, ['exec oitc.cfg']);
  } finally {
    commandsThatFail.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game executes cfg and team commands before saving requested state', async () => {
  const server: Server = app.listen(0);
  try {
    const setupServerId = await createAccessibleServerForTest();
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: setupServerId,
        game_type: 'fun',
        game_mode: 'ctf',
        selectedMap: 'workshop/3555531615/ctf_2fort',
        team1: 'Alpha',
        team2: 'Bravo',
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as SetupGameResponse;
    assert.equal(body.setup_state, 'requested');
    assert.equal(body.observed, false);
    assert.deepEqual(body.requested_setup, {
      game_type: 'fun',
      game_mode: 'ctf',
      map: 'workshop/3555531615/ctf_2fort',
    });
    assert.deepEqual(executedCommands, [
      'exec ctf.cfg',
      'mp_teamname_1 "Alpha"',
      'mp_teamname_2 "Bravo"',
      'changelevel workshop/3555531615/ctf_2fort',
    ]);
    assert.deepEqual(await requestedSetupState(setupServerId), {
      last_map: 'workshop/3555531615/ctf_2fort',
      last_game_type: 'fun',
      last_game_mode: 'ctf',
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game does not persist requested state when a late command rejects', async () => {
  const server: Server = app.listen(0);
  try {
    const setupServerId = await createAccessibleServerForTest();
    const failingCommand = 'changelevel de_mirage';
    commandsThatFail.add(failingCommand);
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: setupServerId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_mirage',
        team1: 'Alpha',
      }),
    });

    assert.equal(res.status, 500);
    assert.deepEqual(executedCommands, [
      'exec warmup.cfg',
      'mp_teamname_1 "Alpha"',
      failingCommand,
    ]);
    assert.deepEqual(await requestedSetupState(setupServerId), {
      last_map: null,
      last_game_type: null,
      last_game_mode: null,
    });
  } finally {
    commandsThatFail.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game treats resolved RCON output as requested, not observed state', async () => {
  const server: Server = app.listen(0);
  try {
    const setupServerId = await createAccessibleServerForTest();
    const mapCommand = 'changelevel de_mirage';
    commandResponses.set(mapCommand, 'Unknown command: changelevel');
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: setupServerId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_mirage',
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as SetupGameResponse;
    assert.equal(body.message, 'Game setup commands sent.');
    assert.equal(body.setup_state, 'requested');
    assert.equal(body.observed, false);
    assert.deepEqual(body.requested_setup, {
      game_type: 'competitive',
      game_mode: 'competitive',
      map: 'de_mirage',
    });
    assert.deepEqual(executedCommands, ['exec warmup.cfg', mapCommand]);
    assert.deepEqual(await requestedSetupState(setupServerId), {
      last_map: 'de_mirage',
      last_game_type: 'competitive',
      last_game_mode: 'competitive',
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game rejects unknown game type', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'notavalidgametype',
        game_mode: 'competitive',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Unknown game type/);
    assert.deepEqual(executedCommands, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game rejects map not in allowed list', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: serverId,
        game_type: 'competitive',
        game_mode: 'competitive',
        selectedMap: 'de_notamap',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
    assert.deepEqual(executedCommands, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── /api/workshop-map ─────────────────────────────────────────────────────────

test('POST /api/workshop-map rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, workshop_id: '12345678901' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/workshop-map succeeds with a valid workshop id', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-map`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, workshop_id: '12345678901' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(executedCommands, ['host_workshop_map 12345678901']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/workshop-map rejects non-numeric workshop id', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-map`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, workshop_id: 'notanid' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /workshop_id must be/);
    assert.deepEqual(executedCommands, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── /api/rcon ─────────────────────────────────────────────────────────────────
