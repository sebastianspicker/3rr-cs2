import { test } from 'node:test';
import type { AddressInfo, Server, ServerListItem } from './server-crud-fixture';
import { app, assert, loginAndGetSession, probeCalls, connectCalls } from './server-crud-fixture';
import { loopbackFetch } from './http-helpers';

async function assertPersistedAccessibleServer(
  port: number,
  sessionCookie: string,
  password: string
): Promise<void> {
  const { better_sqlite_client: db } = await import('../db');
  const row = db
    .prepare(
      `SELECT id, serverIP, serverPort, rconPassword, owner_id
         FROM servers
        WHERE serverIP = '203.0.113.1' AND serverPort = 27015`
    )
    .get() as
    | { id: number; serverIP: string; serverPort: number; rconPassword: string; owner_id: number }
    | undefined;
  assert.ok(row, 'server row must be persisted');
  assert.equal(row.owner_id, 1);
  assert.equal(row.rconPassword, password);
  const access = db
    .prepare(`SELECT COUNT(*) AS count FROM server_access WHERE user_id = 1 AND server_id = ?`)
    .get(row.id) as { count: number };
  assert.equal(access.count, 1);
  assert.deepEqual(probeCalls, [
    { id: 0, serverIP: '203.0.113.1', serverPort: 27015, rconPassword: password },
  ]);
  assert.deepEqual(connectCalls, [
    { id: row.id, serverIP: '203.0.113.1', serverPort: 27015, rconPassword: password },
  ]);

  const listRes = await loopbackFetch(`http://127.0.0.1:${port}/api/servers`, {
    headers: { accept: 'application/json', cookie: sessionCookie },
  });
  assert.equal(listRes.status, 200);
  const listBody = (await listRes.json()) as { servers: ServerListItem[] };
  assert.ok(listBody.servers.some((item) => item.id === row.id));
}

async function createSharedServerFixture(): Promise<{ otherUserId: number; serverId: number }> {
  const { better_sqlite_client: db } = await import('../db');
  const otherUser = db
    .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, 'hash', 0)`)
    .run('existing-server-owner');
  const otherUserId = Number(otherUser.lastInsertRowid);
  const existing = db
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id)
       VALUES ('203.0.113.13', 27015, 'old-password', ?)`
    )
    .run(otherUserId);
  const serverId = Number(existing.lastInsertRowid);
  db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
    otherUserId,
    serverId
  );
  return { otherUserId, serverId };
}

async function assertSharedServerUpdated(otherUserId: number, serverId: number): Promise<void> {
  const { better_sqlite_client: db } = await import('../db');
  const rowCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM servers WHERE serverIP = '203.0.113.13' AND serverPort = 27015`
    )
    .get() as { count: number };
  assert.equal(rowCount.count, 1);
  const accessRows = db
    .prepare(`SELECT user_id FROM server_access WHERE server_id = ? ORDER BY user_id`)
    .all(serverId) as Array<{ user_id: number }>;
  assert.deepEqual(
    accessRows.map((row) => row.user_id),
    [1, otherUserId].sort((a, b) => a - b)
  );
  const stored = db.prepare(`SELECT rconPassword FROM servers WHERE id = ?`).get(serverId) as {
    rconPassword: string;
  };
  assert.equal(stored.rconPassword, 'shared-password');
  const expected = {
    id: serverId,
    serverIP: '203.0.113.13',
    serverPort: 27015,
    rconPassword: 'shared-password',
  };
  assert.deepEqual(probeCalls, [expected]);
  assert.deepEqual(connectCalls, [expected]);
}

async function assertEncryptedServerStored(
  password: string,
  decryptRconSecret: (value: string) => string
): Promise<void> {
  const { better_sqlite_client: db } = await import('../db');
  const row = db
    .prepare(
      `SELECT id, rconPassword
         FROM servers
        WHERE serverIP = '203.0.113.12' AND serverPort = 27015`
    )
    .get() as { id: number; rconPassword: string } | undefined;
  assert.ok(row, 'server row must be persisted');
  assert.notEqual(row.rconPassword, password);
  assert.match(row.rconPassword, /^enc:v1:/);
  assert.equal(decryptRconSecret(row.rconPassword), password);
  assert.equal(probeCalls[0]?.rconPassword, password);
  assert.equal(connectCalls[0]?.id, row.id);
  assert.equal(connectCalls[0]?.rconPassword, row.rconPassword);
}

test('POST /api/add-server persists an accessible server and connects the saved row', async () => {
  const server: Server = app.listen(0);
  try {
    const password = ['test', 'rcon', 'password'].join('-');
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.1',
        server_port: 27015,
        rcon_password: password,
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Server added successfully');

    await assertPersistedAccessibleServer(port, sessionCookie, password);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server encrypts stored RCON password when a secret key is configured', async () => {
  const server: Server = app.listen(0);
  const secretKey = [
    '0123456789abcdef',
    '0123456789abcdef',
    '0123456789abcdef',
    '0123456789abcdef',
  ].join('');
  try {
    const { _resetCachedKey, decryptRconSecret } = await import('../utils/rconSecret');
    process.env.RCON_SECRET_KEY = secretKey;
    _resetCachedKey();
    const password = ['encrypted', 'rcon', 'password'].join('-');
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.12',
        server_port: 27015,
        rcon_password: password,
      }),
    });

    assert.equal(res.status, 201);
    await assertEncryptedServerStored(password, decryptRconSecret);
  } finally {
    const { _resetCachedKey } = await import('../utils/rconSecret');
    delete process.env.RCON_SECRET_KEY;
    _resetCachedKey();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server grants access to an existing server without duplicating the server row', async () => {
  const server: Server = app.listen(0);
  try {
    const { otherUserId, serverId } = await createSharedServerFixture();

    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.13',
        server_port: 27015,
        rcon_password: 'shared-password',
      }),
    });

    assert.equal(res.status, 201);
    await assertSharedServerUpdated(otherUserId, serverId);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server accepts private LAN IPs for self-hosted servers', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '192.168.1.10',
        server_port: 27016,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Server added successfully');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects invalid IP', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '',
        server_port: 27015,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body.error === 'string');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects invalid port', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.2',
        server_port: 99999,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'server_port must be an integer between 1 and 65535');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects missing password', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.3',
        server_port: 27015,
        rcon_password: '',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body.error === 'string');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
