import { test } from 'node:test';
import {
  app,
  serverId,
  executedCommands,
  loginAndGetSession,
  withAuthedServer,
  createAccessibleServerForTest,
  createUserWithServerAccess,
  assertSecondCommandPartialFailures,
  assert,
  loginWithCredentials,
  type AddressInfo,
  type Server,
} from './game-routes-fixture';
import { loopbackFetch } from './http-helpers';

test('multi-command routes report partial failure when the second command fails', async () => {
  await assertSecondCommandPartialFailures([
    {
      path: '/api/respawn-toggle',
      body: { value: '1' },
      appliedCommands: ['mp_respawn_on_death_ct 1'],
      failedCommand: 'mp_respawn_on_death_t 1',
    },
    {
      path: '/api/set-startmoney',
      body: { value: 800 },
      appliedCommands: ['mp_startmoney 800'],
      failedCommand: 'mp_maxmoney 16000',
    },
    {
      path: '/api/set-roundtime',
      body: { value: 5 },
      appliedCommands: ['mp_roundtime 5'],
      failedCommand: 'mp_roundtime_defuse 5',
    },
    {
      path: '/api/set-overtime',
      body: { enable: '1', ot_rounds: 3 },
      appliedCommands: ['mp_overtime_enable 1'],
      failedCommand: 'mp_overtime_maxrounds 3',
    },
    {
      path: '/api/start-warmup',
      body: {},
      appliedCommands: ['mp_restartgame 1'],
      failedCommand: 'exec warmup.cfg',
    },
  ]);
});

test('preset routes reject malformed numeric values before sending RCON', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const cases: Array<{ label: string; value: unknown }> = [
      { label: 'suffix junk', value: '5abc' },
      { label: 'prefix junk', value: 'abc5' },
      { label: 'decimal string', value: '5.5' },
      { label: 'empty string', value: '' },
      { label: 'out of range', value: 999 },
    ];

    for (const { label, value } of cases) {
      const res = await loopbackFetch(`${baseUrl}/api/set-freezetime`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: auth.sessionCookie,
          'x-csrf-token': auth.csrfToken,
        },
        body: JSON.stringify({ server_id: serverId, value }),
      });
      assert.equal(res.status, 400, label);
      assert.deepEqual(executedCommands, [], label);
    }
  });
});

test('preset routes accept strict allowed integer values including zero', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await loopbackFetch(`${baseUrl}/api/set-freezetime`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: auth.sessionCookie,
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, value: '0' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(executedCommands, ['mp_freezetime 0']);
  });
});

test('multi-command preset routes reject malformed numeric values before sending RCON', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const scenarios: Array<{ path: string; body: Record<string, unknown> }> = [
      { path: '/api/set-roundtime', body: { value: '5abc' } },
      { path: '/api/set-overtime', body: { enable: '1', ot_rounds: '3abc' } },
    ];

    for (const scenario of scenarios) {
      const res = await loopbackFetch(`${baseUrl}${scenario.path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: auth.sessionCookie,
          'x-csrf-token': auth.csrfToken,
        },
        body: JSON.stringify({ server_id: serverId, ...scenario.body }),
      });
      assert.equal(res.status, 400, scenario.path);
      assert.deepEqual(executedCommands, [], scenario.path);
    }
  });
});

// ── /api/workshop-favorites ──────────────────────────────────────────────────

interface FavoriteAuth {
  sessionCookie: string;
  csrfToken: string;
}

async function assertFavoriteHiddenAndImmutable(
  base: string,
  favoriteId: number,
  auth: FavoriteAuth,
  updateName: string
): Promise<void> {
  const list = await loopbackFetch(base, { headers: { cookie: auth.sessionCookie } });
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()) as { favorites: unknown[] }, { favorites: [] });

  const update = await loopbackFetch(`${base}/${favoriteId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: auth.sessionCookie,
      'x-csrf-token': auth.csrfToken,
    },
    body: JSON.stringify({ name: updateName }),
  });
  assert.equal(update.status, 404);

  const deletion = await loopbackFetch(`${base}/${favoriteId}`, {
    method: 'DELETE',
    headers: { cookie: auth.sessionCookie, 'x-csrf-token': auth.csrfToken },
  });
  assert.equal(deletion.status, 404);
}

async function assertOwnerFavoriteAndDelete(
  base: string,
  favorite: { id: number; name: string; workshop_id: string },
  auth: FavoriteAuth
): Promise<void> {
  const ownerList = await loopbackFetch(base, { headers: { cookie: auth.sessionCookie } });
  assert.equal(ownerList.status, 200);
  const ownerBody = (await ownerList.json()) as {
    favorites: Array<{ id: number; name: string; workshop_id: string }>;
  };
  assert.deepEqual(
    ownerBody.favorites.map(({ id, name, workshop_id }) => ({ id, name, workshop_id })),
    [favorite]
  );

  const cleanup = await loopbackFetch(`${base}/${favorite.id}`, {
    method: 'DELETE',
    headers: { cookie: auth.sessionCookie, 'x-csrf-token': auth.csrfToken },
  });
  assert.equal(cleanup.status, 200);
}

test('workshop favorites CRUD is scoped to the authenticated user and server', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const base = `http://127.0.0.1:${port}/api/workshop-favorites/${serverId}`;

    const create = await fetch(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ workshop_id: '12345678901', name: 'Aim Map' }),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as { favorite: { id: number; name: string } };
    assert.equal(created.favorite.name, 'Aim Map');

    const list = await fetch(base, { headers: { cookie: sessionCookie } });
    assert.equal(list.status, 200);
    const listed = (await list.json()) as { favorites: Array<{ name: string }> };
    assert.deepEqual(
      listed.favorites.map((favorite) => favorite.name),
      ['Aim Map']
    );

    const update = await fetch(`${base}/${created.favorite.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ name: 'Updated Aim Map' }),
    });
    assert.equal(update.status, 200);
    const updated = (await update.json()) as { favorite: { name: string } };
    assert.equal(updated.favorite.name, 'Updated Aim Map');

    const del = await fetch(`${base}/${created.favorite.id}`, {
      method: 'DELETE',
      headers: {
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
    });
    assert.equal(del.status, 200);
    const afterDelete = await fetch(base, { headers: { cookie: sessionCookie } });
    const deletedList = (await afterDelete.json()) as { favorites: unknown[] };
    assert.equal(deletedList.favorites.length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('workshop favorites cannot be listed, updated, or deleted outside owning scope', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const ownerAuth = await loginAndGetSession(port);
    const otherServerId = await createAccessibleServerForTest();
    const otherUser = await createUserWithServerAccess([serverId]);
    const otherAuth = await loginWithCredentials(port, otherUser.username, otherUser.password);

    const ownerBase = `http://127.0.0.1:${port}/api/workshop-favorites/${serverId}`;
    const otherServerBase = `http://127.0.0.1:${port}/api/workshop-favorites/${otherServerId}`;
    const create = await fetch(ownerBase, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerAuth.sessionCookie,
        'x-csrf-token': ownerAuth.csrfToken,
      },
      body: JSON.stringify({ workshop_id: '22345678901', name: 'Owner Favorite' }),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as {
      favorite: { id: number; name: string; workshop_id: string };
    };
    const expectedFavorite = {
      id: created.favorite.id,
      name: created.favorite.name,
      workshop_id: created.favorite.workshop_id,
    };

    await assertFavoriteHiddenAndImmutable(
      ownerBase,
      created.favorite.id,
      otherAuth,
      'Cross User Update'
    );
    await assertFavoriteHiddenAndImmutable(
      otherServerBase,
      created.favorite.id,
      ownerAuth,
      'Cross Server Update'
    );
    await assertOwnerFavoriteAndDelete(ownerBase, expectedFavorite, ownerAuth);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
