import { test } from 'node:test';
import {
  app,
  assert,
  connectCalls,
  loginAndGetSession,
  postAddServer,
  probeCalls,
  setConnectShouldFail,
  setProbeShouldFail,
} from '../support/server-crud-fixture';
import type { AddressInfo, Server } from '../support/server-crud-fixture';

test('POST /api/add-server returns a generic auth failure for existing servers', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../../db');
    db.prepare(
      `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('203.0.113.9', 27015, 'stored-password', 1)`
    ).run();
    const existing = db
      .prepare(`SELECT id FROM servers WHERE serverIP = '203.0.113.9' AND serverPort = 27015`)
      .get() as { id: number };

    setProbeShouldFail(true);
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      { server_ip: '203.0.113.9', server_port: 27015, rcon_password: 'wrong-password' }
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(
      body.error,
      'Unable to authenticate to the server with the provided RCON credentials'
    );
    assert.deepEqual(probeCalls, [
      {
        id: existing.id,
        serverIP: '203.0.113.9',
        serverPort: 27015,
        rconPassword: 'wrong-password',
      },
    ]);
    assert.deepEqual(connectCalls, []);
    const access = db
      .prepare(`SELECT COUNT(*) AS count FROM server_access WHERE user_id = 1 AND server_id = ?`)
      .get(existing.id) as { count: number };
    assert.equal(access.count, 0);
  } finally {
    setProbeShouldFail(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server reports post-probe RCON connection failure', async () => {
  const server: Server = app.listen(0);
  try {
    setConnectShouldFail(true);
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      {
        server_ip: '203.0.113.10',
        server_port: 27015,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }
    );

    assert.equal(res.status, 502);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(
      body.error,
      'Server saved, but the panel could not establish an authenticated RCON connection'
    );
    const { better_sqlite_client: db } = await import('../../db');
    const row = db
      .prepare(
        `SELECT id
           FROM servers
          WHERE serverIP = '203.0.113.10' AND serverPort = 27015`
      )
      .get() as { id: number } | undefined;
    assert.ok(row, 'server row is saved before failed managed connection is reported');
    assert.equal(probeCalls.length, 1);
    assert.equal(connectCalls.length, 1);
    assert.equal(connectCalls[0]?.id, row.id);
  } finally {
    setConnectShouldFail(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/reconnect-server reports RCON connection failure', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../../db');
    const inserted = db
      .prepare(
        `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('203.0.113.11', 27015, 'stored-password', 1)`
      )
      .run();
    const serverId = Number(inserted.lastInsertRowid);
    db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (1, ?)`).run(serverId);

    setConnectShouldFail(true);
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/reconnect-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId }),
    });

    assert.equal(res.status, 502);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(
      body.error,
      'Unable to establish an authenticated RCON connection for this server'
    );
  } finally {
    setConnectShouldFail(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects unauthenticated request', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        server_ip: '203.0.113.4',
        server_port: 27015,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }),
    });

    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
