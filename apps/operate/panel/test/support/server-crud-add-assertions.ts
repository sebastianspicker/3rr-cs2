import { assert, connectCalls, probeCalls } from './server-crud-fixture';
import type { ServerListItem } from './server-crud-fixture';
import { loopbackFetch } from './http-helpers';

export async function assertPersistedAccessibleServer(
  port: number,
  sessionCookie: string,
  password: string
): Promise<void> {
  const { better_sqlite_client: db } = await import('../../db');
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

export async function createSharedServerFixture(
  serverIP = '203.0.113.13',
  serverPort = 27015,
  username = 'existing-server-owner'
): Promise<{ otherUserId: number; serverId: number }> {
  const { better_sqlite_client: db } = await import('../../db');
  const otherUser = db
    .prepare(`INSERT INTO users (username, password, is_admin) VALUES (?, 'hash', 0)`)
    .run(username);
  const otherUserId = Number(otherUser.lastInsertRowid);
  const existing = db
    .prepare(
      `INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id)
       VALUES (?, ?, 'old-password', ?)`
    )
    .run(serverIP, serverPort, otherUserId);
  const serverId = Number(existing.lastInsertRowid);
  db.prepare(`INSERT INTO server_access (user_id, server_id) VALUES (?, ?)`).run(
    otherUserId,
    serverId
  );
  return { otherUserId, serverId };
}

export async function assertSharedServerUpdated(
  otherUserId: number,
  serverId: number
): Promise<void> {
  const { better_sqlite_client: db } = await import('../../db');
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

export async function assertEncryptedServerStored(
  password: string,
  decryptRconSecret: (value: string) => string
): Promise<void> {
  const { better_sqlite_client: db } = await import('../../db');
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
