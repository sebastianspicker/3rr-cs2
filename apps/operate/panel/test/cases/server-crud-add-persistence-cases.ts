import { test } from 'node:test';
import {
  app,
  assert,
  connectCalls,
  installFailingServerAccessTrigger,
  loginAndGetSession,
  postAddServer,
  seedServerCapacity,
} from '../support/server-crud-fixture';
import type { AddressInfo, Server } from '../support/server-crud-fixture';
import {
  assertEncryptedServerStored,
  assertPersistedAccessibleServer,
  assertSharedServerUpdated,
  createSharedServerFixture,
} from '../support/server-crud-add-assertions';

test('POST /api/add-server persists an accessible server and connects the saved row', async () => {
  const server: Server = app.listen(0);
  try {
    const password = ['test', 'rcon', 'password'].join('-');
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      { server_ip: '203.0.113.1', server_port: 27015, rcon_password: password }
    );

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
    const { _resetCachedKey, decryptRconSecret } = await import('../../utils/rconSecret');
    process.env.RCON_SECRET_KEY = secretKey;
    _resetCachedKey();
    const password = ['encrypted', 'rcon', 'password'].join('-');
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      { server_ip: '203.0.113.12', server_port: 27015, rcon_password: password }
    );

    assert.equal(res.status, 201);
    await assertEncryptedServerStored(password, decryptRconSecret);
  } finally {
    const { _resetCachedKey } = await import('../../utils/rconSecret');
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

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      {
        server_ip: '203.0.113.13',
        server_port: 27015,
        rcon_password: 'shared-password',
      }
    );

    assert.equal(res.status, 201);
    await assertSharedServerUpdated(otherUserId, serverId);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server permits credential refresh at the server limit but blocks new access', async () => {
  const server: Server = app.listen(0);
  let cleanupCapacity: (() => void) | undefined;
  try {
    const capacity = await seedServerCapacity();
    cleanupCapacity = capacity.cleanup;
    const { target } = capacity;
    const { better_sqlite_client: db } = await import('../../db');

    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const session = { sessionCookie, csrfToken };
    const refresh = await postAddServer(port, session, {
      server_ip: target.serverIP,
      server_port: target.serverPort,
      rcon_password: 'refreshed-limit-password',
    });
    assert.equal(refresh.status, 201);
    const stored = db.prepare(`SELECT rconPassword FROM servers WHERE id = ?`).get(target.id) as {
      rconPassword: string;
    };
    assert.equal(stored.rconPassword, 'refreshed-limit-password');

    const blocked = await postAddServer(port, session, {
      server_ip: '198.51.100.251',
      server_port: 28151,
      rcon_password: 'new-limit-password',
    });
    assert.equal(blocked.status, 400);
    assert.deepEqual(await blocked.json(), { error: 'Maximum server limit reached' });
    assert.equal(
      db
        .prepare(`SELECT id FROM servers WHERE serverIP = '198.51.100.251' AND serverPort = 28151`)
        .get(),
      undefined
    );
    assert.equal(connectCalls.length, 1);
  } finally {
    cleanupCapacity?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rolls back a new server when its access grant fails', async () => {
  const server: Server = app.listen(0);
  const { better_sqlite_client: db } = await import('../../db');
  let removeTrigger = () => {};
  try {
    removeTrigger = installFailingServerAccessTrigger(db, 'test_fail_new_server_access');
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      {
        server_ip: '203.0.113.14',
        server_port: 27015,
        rcon_password: 'new-server-password',
      }
    );

    assert.equal(res.status, 500);
    const serverRow = db
      .prepare(`SELECT id FROM servers WHERE serverIP = '203.0.113.14' AND serverPort = 27015`)
      .get();
    assert.equal(serverRow, undefined, 'the server insert must roll back with the access insert');
    assert.deepEqual(connectCalls, [], 'RCON connect must not run after persistence rolls back');
  } finally {
    removeTrigger();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rolls back an existing server update when its access grant fails', async () => {
  const server: Server = app.listen(0);
  const { better_sqlite_client: db } = await import('../../db');
  let removeTrigger = () => {};
  try {
    const { serverId } = await createSharedServerFixture(
      '203.0.113.15',
      27015,
      'existing-server-owner-rollback'
    );
    removeTrigger = installFailingServerAccessTrigger(db, 'test_fail_existing_server_access');
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      {
        server_ip: '203.0.113.15',
        server_port: 27015,
        rcon_password: 'replacement-password',
      }
    );

    assert.equal(res.status, 500);
    const persisted = db.prepare(`SELECT rconPassword FROM servers WHERE id = ?`).get(serverId) as {
      rconPassword: string;
    };
    assert.equal(persisted.rconPassword, 'old-password');
    const access = db
      .prepare(`SELECT COUNT(*) AS count FROM server_access WHERE user_id = 1 AND server_id = ?`)
      .get(serverId) as { count: number };
    assert.equal(access.count, 0, 'the failed access grant must not be persisted');
    assert.deepEqual(connectCalls, [], 'RCON connect must not run after persistence rolls back');
  } finally {
    removeTrigger();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
