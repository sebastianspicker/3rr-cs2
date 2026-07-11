import { test } from 'node:test';
import {
  app,
  serverId,
  executedCommands,
  loginAndGetSession,
  assert,
  type AddressInfo,
  type Server,
} from './game-routes-fixture';

test('workshop favorite update distinguishes duplicate conflicts from persistence failures', async () => {
  const server: Server = app.listen(0);
  const { better_sqlite_client: db } = await import('../db');
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const base = `http://127.0.0.1:${port}/api/workshop-favorites/${serverId}`;

    const first = await fetch(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ workshop_id: '32345678901', name: 'First Favorite' }),
    });
    assert.equal(first.status, 201);
    const firstBody = (await first.json()) as { favorite: { id: number } };

    const second = await fetch(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ workshop_id: '42345678901', name: 'Second Favorite' }),
    });
    assert.equal(second.status, 201);
    const secondBody = (await second.json()) as { favorite: { id: number } };

    const duplicate = await fetch(`${base}/${firstBody.favorite.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ workshop_id: '42345678901' }),
    });
    assert.equal(duplicate.status, 409);
    const duplicateBody = (await duplicate.json()) as { error: string };
    assert.match(duplicateBody.error, /already exists/);

    db.exec(`
      CREATE TEMP TRIGGER fail_workshop_favorite_update
      BEFORE UPDATE ON workshop_favorites
      BEGIN
        SELECT RAISE(FAIL, 'simulated generic persistence failure');
      END;
    `);
    const failed = await fetch(`${base}/${firstBody.favorite.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ name: 'Generic Failure' }),
    });
    assert.equal(failed.status, 500);
    const failedBody = (await failed.json()) as { error: string };
    assert.match(failedBody.error, /update failed/);

    db.exec(`DROP TRIGGER IF EXISTS fail_workshop_favorite_update`);
    for (const favoriteId of [firstBody.favorite.id, secondBody.favorite.id]) {
      const cleanup = await fetch(`${base}/${favoriteId}`, {
        method: 'DELETE',
        headers: { cookie: sessionCookie, 'x-csrf-token': csrfToken },
      });
      assert.equal(cleanup.status, 200);
    }
  } finally {
    db.exec(`DROP TRIGGER IF EXISTS fail_workshop_favorite_update`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── /api/rcon/history ────────────────────────────────────────────────────────

test('RCON sent-command history stores dispatched commands only and prunes to 50 unique commands', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const historyUrl = `http://127.0.0.1:${port}/api/rcon/history/${serverId}`;

    await fetch(historyUrl, {
      method: 'DELETE',
      headers: { cookie: sessionCookie, 'x-csrf-token': csrfToken },
    });

    for (let i = 0; i < 55; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: serverId, command: `status ${i}` }),
      });
      assert.equal(res.status, 200);
    }

    await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: 'not stored in history' }),
    });

    const list = await fetch(historyUrl, { headers: { cookie: sessionCookie } });
    assert.equal(list.status, 200);
    const body = (await list.json()) as {
      commands: Array<{ command: string }>;
      history_state: 'available';
    };
    assert.equal(body.history_state, 'available');
    assert.equal(body.commands.length, 50);
    assert.equal(body.commands[0]?.command, 'status 54');
    assert.equal(body.commands.at(-1)?.command, 'status 5');
    assert.equal(
      body.commands.some((item) => item.command.includes('not stored')),
      false
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── /api/say-admin ────────────────────────────────────────────────────────────

test('POST /api/say-admin rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, message: 'hello' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/say-admin sends the sanitized message as one quoted say command', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: 'Server will "restart"; {soon}|' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message: string };
    assert.equal(body.message, 'Say command sent.');
    assert.deepEqual(executedCommands, ['say "Server will restart soon"']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/say-admin rejects an empty message', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: '' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /message is required/);
    assert.deepEqual(executedCommands, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/say-admin rejects a message that sanitizes to empty', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    // All chars stripped by sanitizeString: control chars + semicolons + quotes
    const allStripped = '\x00\x01\x02;|{}';
    const res = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: allStripped }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(executedCommands, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
