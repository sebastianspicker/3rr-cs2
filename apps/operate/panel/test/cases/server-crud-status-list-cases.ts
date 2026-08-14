import { test } from 'node:test';
import {
  app,
  assert,
  connectedServerIds,
  connectionInfoByServerId,
  failingHostnameServerIds,
  getAccessibleServers,
  hangingHostnameServerIds,
  hostnameByServerId,
  insertAccessibleServer,
  loginAndGetSession,
} from '../support/server-crud-fixture';
import type { AddressInfo, Server, ServerListItem } from '../support/server-crud-fixture';
import {
  assertConnectedHostnameStatus,
  assertFailedHostnameStatus,
  assertTimedOutHostnameStatus,
  assertUnobservedServerStatus,
  findListedServer,
} from '../support/server-crud-status-assertions';

test('GET /api/servers returns only accessible servers and preserves unobserved status as unknown', async () => {
  const server: Server = app.listen(0);
  try {
    const { better_sqlite_client: db } = await import('../../db');
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
    const res = await getAccessibleServers(port, sessionCookie);

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    assert.ok(Array.isArray(body.servers));
    const accessible = findListedServer(
      body.servers,
      accessibleId,
      'accessible server must be listed'
    );
    assert.equal(
      body.servers.some((item) => item.serverIP === '198.51.100.22'),
      false,
      'server without access must not be listed'
    );
    assertUnobservedServerStatus(accessible);
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
    const res = await getAccessibleServers(port, sessionCookie);

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    assertConnectedHostnameStatus(
      findListedServer(body.servers, observedId, 'observed server must be listed')
    );
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
    const res = await getAccessibleServers(port, sessionCookie);

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    assertTimedOutHostnameStatus(
      findListedServer(body.servers, timedOutId, 'timed-out server must be listed')
    );
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
    const res = await getAccessibleServers(port, sessionCookie);

    assert.equal(res.status, 200);
    const body = (await res.json()) as { servers: ServerListItem[] };
    assertFailedHostnameStatus(
      findListedServer(body.servers, failedId, 'failed-probe server must be listed')
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
