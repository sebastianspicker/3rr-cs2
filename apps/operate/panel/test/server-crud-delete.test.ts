import { test } from 'node:test';
import type { AddressInfo, Server } from './server-crud-fixture';
import {
  app,
  assert,
  loginAndGetSession,
  insertAccessibleServer,
  removeServerCalls,
  setRemoveServerShouldFail,
} from './server-crud-fixture';

test('GET /api/servers rejects unauthenticated request', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: { accept: 'application/json' },
    });

    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server removes only caller access for a shared server', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../db');
    const sharedId = await insertAccessibleServer('198.51.100.31', 27031);
    const otherUser = db
      .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, 'hash', 0)`)
      .run('shared-delete-user');
    const otherUserId = Number(otherUser.lastInsertRowid);
    db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
      otherUserId,
      sharedId
    );

    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: sharedId }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Server access removed successfully');
    assert.equal(body.server_deleted, false);
    assert.equal(body.rcon_cleanup, 'not_needed');
    assert.deepEqual(removeServerCalls, []);
    const serverRow = db.prepare(`SELECT id FROM servers WHERE id = ?`).get(sharedId);
    assert.ok(serverRow, 'shared server row must remain');
    const accessRows = db
      .prepare(
        `SELECT user_id
           FROM server_access
          WHERE server_id = ?
          ORDER BY user_id`
      )
      .all(sharedId) as Array<{ user_id: number }>;
    assert.deepEqual(
      accessRows.map((row) => row.user_id),
      [otherUserId]
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server deletes an orphan server and cleans up RCON state', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../db');
    const orphanId = await insertAccessibleServer('198.51.100.32', 27032);

    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: orphanId }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Server deleted successfully');
    assert.equal(body.server_deleted, true);
    assert.equal(body.rcon_cleanup, 'completed');
    assert.deepEqual(removeServerCalls, [String(orphanId)]);
    const serverRow = db.prepare(`SELECT id FROM servers WHERE id = ?`).get(orphanId);
    assert.equal(serverRow, undefined);
    const access = db
      .prepare(`SELECT COUNT(*) AS count FROM server_access WHERE server_id = ?`)
      .get(orphanId) as { count: number };
    assert.equal(access.count, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server reports RCON cleanup failure after orphan deletion', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../db');
    const orphanId = await insertAccessibleServer('198.51.100.33', 27033);
    setRemoveServerShouldFail(true);

    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: orphanId }),
    });

    assert.equal(res.status, 500);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Server deleted, but RCON cleanup failed');
    assert.equal(body.server_deleted, true);
    assert.equal(body.rcon_cleanup, 'failed');
    assert.deepEqual(removeServerCalls, [String(orphanId)]);
    const serverRow = db.prepare(`SELECT id FROM servers WHERE id = ?`).get(orphanId);
    assert.equal(serverRow, undefined);
  } finally {
    setRemoveServerShouldFail(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server rejects malformed server_id', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 'abc' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Missing or invalid server_id');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server returns 404 for non-existent server', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 99999 }),
    });

    assert.equal(res.status, 404);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Server not found');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/delete-server rejects unauthenticated request', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/delete-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ server_id: 1 }),
    });

    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
