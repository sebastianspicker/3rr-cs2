import { test } from 'node:test';
import type { AddressInfo, Server, ServerListItem } from './server-crud-fixture';
import {
  app,
  assert,
  loginAndGetSession,
  probeCalls,
  connectCalls,
  connectedServerIds,
  failingHostnameServerIds,
  hangingHostnameServerIds,
  hostnameByServerId,
  connectionInfoByServerId,
  insertAccessibleServer,
  setProbeShouldFail,
  setConnectShouldFail,
} from './server-crud-fixture';

test('POST /api/add-server returns a generic auth failure for existing servers', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../db');
    db.prepare(
      `INSERT OR IGNORE INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('203.0.113.9', 27015, 'stored-password', 1)`
    ).run();
    const existing = db
      .prepare(`SELECT id FROM servers WHERE serverIP = '203.0.113.9' AND serverPort = 27015`)
      .get() as { id: number };

    setProbeShouldFail(true);
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
        server_ip: '203.0.113.9',
        server_port: 27015,
        rcon_password: 'wrong-password',
      }),
    });

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

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_ip: '203.0.113.10',
        server_port: 27015,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }),
    });

    assert.equal(res.status, 502);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(
      body.error,
      'Server saved, but the panel could not establish an authenticated RCON connection'
    );
    const { better_sqlite_client: db } = await import('../db');
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
    const { better_sqlite_client: db } = await import('../db');
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
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
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

test('GET /api/servers returns only accessible servers and preserves unobserved status as unknown', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../db');
    const accessibleId = await insertAccessibleServer('198.51.100.21', 27021);
    const otherUser = db
      .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, 'hash', 0)`)
      .run('serverlist-other-user');
    const otherUserId = Number(otherUser.lastInsertRowid);
    const inaccessible = db
      .prepare(
        `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES ('198.51.100.22', 27022, 'stored-password', ?)`
      )
      .run(otherUserId);
    db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
      otherUserId,
      Number(inaccessible.lastInsertRowid)
    );

    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    assert.ok(Array.isArray(body.servers));
    const accessible = body.servers.find((item) => item.id === accessibleId);
    assert.ok(accessible, 'accessible server must be listed');
    assert.equal(
      body.servers.some((item) => item.serverIP === '198.51.100.22'),
      false,
      'server without access must not be listed'
    );
    assert.equal(accessible.hostname, '-');
    assert.equal(accessible.status, 'unknown');
    assert.equal(accessible.status_source, 'not_observed');
    assert.equal(accessible.observed_at, null);
    assert.equal(accessible.timed_out, false);
    assert.equal(accessible.error, null);
    assert.equal(accessible.connected, false);
    assert.equal(accessible.authenticated, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/servers reports observed connected RCON status from hostname probe', async () => {
  const server: Server = app.listen(0);
  try {
    const observedId = await insertAccessibleServer('198.51.100.23', 27023);
    const sid = String(observedId);
    connectedServerIds.add(sid);
    hostnameByServerId.set(sid, 'Observed Server');
    connectionInfoByServerId.set(sid, {
      host: '198.51.100.23',
      port: 27023,
      connected: true,
      authenticated: true,
    });

    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    const observed = body.servers.find((item) => item.id === observedId);
    assert.ok(observed, 'observed server must be listed');
    assert.equal(observed.hostname, 'Observed Server');
    assert.equal(observed.status, 'connected');
    assert.equal(observed.status_source, 'rcon_hostname');
    assert.match(observed.observed_at ?? '', /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(observed.timed_out, false);
    assert.equal(observed.error, null);
    assert.equal(observed.connected, true);
    assert.equal(observed.authenticated, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/servers reports timed-out hostname probe without marking status disconnected', async () => {
  const server: Server = app.listen(0);
  try {
    const timedOutId = await insertAccessibleServer('198.51.100.24', 27024);
    const sid = String(timedOutId);
    connectedServerIds.add(sid);
    hangingHostnameServerIds.add(sid);
    connectionInfoByServerId.set(sid, {
      host: '198.51.100.24',
      port: 27024,
      connected: true,
      authenticated: true,
    });

    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    const timedOut = body.servers.find((item) => item.id === timedOutId);
    assert.ok(timedOut, 'timed-out server must be listed');
    assert.equal(timedOut.status, 'unknown');
    assert.notEqual(timedOut.status, 'disconnected');
    assert.equal(timedOut.status_source, 'rcon_hostname');
    assert.equal(timedOut.observed_at, null);
    assert.equal(timedOut.timed_out, true);
    assert.equal(timedOut.error, 'hostname probe timed out');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/servers reports failed hostname probe without marking status disconnected', async () => {
  const server: Server = app.listen(0);
  try {
    const failedId = await insertAccessibleServer('198.51.100.25', 27025);
    const sid = String(failedId);
    connectedServerIds.add(sid);
    failingHostnameServerIds.add(sid);
    connectionInfoByServerId.set(sid, {
      host: '198.51.100.25',
      port: 27025,
      connected: true,
      authenticated: true,
    });

    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    const failed = body.servers.find((item) => item.id === failedId);
    assert.ok(failed, 'failed-probe server must be listed');
    assert.equal(failed.status, 'error');
    assert.notEqual(failed.status, 'disconnected');
    assert.equal(failed.status_source, 'rcon_hostname');
    assert.equal(failed.observed_at, null);
    assert.equal(failed.timed_out, false);
    assert.equal(failed.error, 'hostname unavailable');
    assert.equal(failed.connected, true);
    assert.equal(failed.authenticated, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
