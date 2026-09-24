/** Route-level contract for server add/list/delete, pinned before repository extraction. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  grantAccess,
  insertServer,
  insertUser,
  startTestApp,
  type TestApp,
} from './support/appHarness';
import { loginAs, request } from './support/httpClient';

let app: TestApp;
let ownerSession: { cookie: string; csrf: string };
let otherSession: { cookie: string; csrf: string };

before(async () => {
  app = await startTestApp();
  insertUser(app.database, 1, 'owner', 'owner-password-123', false);
  insertUser(app.database, 2, 'other', 'other-password-123', false);
  ownerSession = await loginAs(app.port, 'owner', 'owner-password-123');
  otherSession = await loginAs(app.port, 'other', 'other-password-123');
});

after(async () => {
  await app.close();
});

test('adding a server persists it, grants access, and connects RCON', async () => {
  const response = await request(app.port, '/api/add-server', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
    body: JSON.stringify({
      server_ip: '203.0.113.20',
      server_port: 27015,
      rcon_password: 'secret',
    }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual(JSON.parse(response.body), { message: 'Server added successfully' });

  const row = app.database
    .prepare('SELECT id, serverIP, serverPort, owner_id FROM servers WHERE serverIP = ?')
    .get('203.0.113.20') as { id: number; serverIP: string; serverPort: number; owner_id: number };
  assert.equal(row.serverPort, 27015);
  assert.equal(row.owner_id, 1);
  const access = app.database
    .prepare('SELECT 1 FROM server_access WHERE user_id = ? AND server_id = ?')
    .get(1, row.id);
  assert.ok(access);
  assert.ok(app.rcon.getConnectionInfo(String(row.id)));
});

test('adding a server the RCON credentials cannot authenticate to returns 400 and does not persist', async () => {
  app.rcon.probeServerShouldFail = true;
  const response = await request(app.port, '/api/add-server', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: otherSession.cookie,
      'x-csrf-token': otherSession.csrf,
    },
    body: JSON.stringify({ server_ip: '203.0.113.21', server_port: 27015, rcon_password: 'bad' }),
  });
  app.rcon.probeServerShouldFail = false;
  assert.equal(response.status, 400);
  const row = app.database.prepare('SELECT id FROM servers WHERE serverIP = ?').get('203.0.113.21');
  assert.equal(row, undefined);
});

test('adding the same ip and port as an existing server shares the server row rather than duplicating it', async () => {
  const response = await request(app.port, '/api/add-server', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: otherSession.cookie,
      'x-csrf-token': otherSession.csrf,
    },
    body: JSON.stringify({
      server_ip: '203.0.113.20',
      server_port: 27015,
      rcon_password: 'secret-again',
    }),
  });
  assert.equal(response.status, 201);

  const rows = app.database
    .prepare('SELECT id FROM servers WHERE serverIP = ? AND serverPort = ?')
    .all('203.0.113.20', 27015) as { id: number }[];
  assert.equal(rows.length, 1);
  const sharedServerId = rows[0]?.id;
  const grants = app.database
    .prepare('SELECT user_id FROM server_access WHERE server_id = ? ORDER BY user_id')
    .all(sharedServerId) as { user_id: number }[];
  assert.deepEqual(
    grants.map((row) => row.user_id),
    [1, 2]
  );
});

test('GET /api/servers only lists servers the caller has access to', async () => {
  insertServer(app.database, 50, '203.0.113.50', 27015, 'password', 1);
  grantAccess(app.database, 1, 50);
  const response = await request(app.port, '/api/servers?observe=0', {
    headers: { accept: 'application/json', cookie: ownerSession.cookie },
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body) as { servers: { id: number }[] };
  const ids = body.servers.map((server) => server.id).sort((a, b) => a - b);
  assert.ok(ids.includes(50));

  const otherResponse = await request(app.port, '/api/servers?observe=0', {
    headers: { accept: 'application/json', cookie: otherSession.cookie },
  });
  const otherIds = (JSON.parse(otherResponse.body) as { servers: { id: number }[] }).servers.map(
    (server) => server.id
  );
  assert.ok(!otherIds.includes(50));
});

test('deleting a server shared by another user only removes the caller access', async () => {
  const sharedServerId = (
    app.database
      .prepare('SELECT id FROM servers WHERE serverIP = ? AND serverPort = ?')
      .get('203.0.113.20', 27015) as { id: number }
  ).id;

  const response = await request(app.port, '/api/delete-server', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: otherSession.cookie,
      'x-csrf-token': otherSession.csrf,
    },
    body: JSON.stringify({ server_id: String(sharedServerId) }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {
    message: 'Server access removed successfully',
    server_deleted: false,
    rcon_cleanup: 'not_needed',
  });
  const stillExists = app.database
    .prepare('SELECT 1 FROM servers WHERE id = ?')
    .get(sharedServerId);
  assert.ok(stillExists);
  assert.ok(!app.rcon.removedServerIds.includes(String(sharedServerId)));

  const finalDelete = await request(app.port, '/api/delete-server', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
    body: JSON.stringify({ server_id: String(sharedServerId) }),
  });
  assert.equal(finalDelete.status, 200);
  assert.deepEqual(JSON.parse(finalDelete.body), {
    message: 'Server deleted successfully',
    server_deleted: true,
    rcon_cleanup: 'completed',
  });
  const orphanGone = app.database.prepare('SELECT 1 FROM servers WHERE id = ?').get(sharedServerId);
  assert.equal(orphanGone, undefined);
  assert.ok(app.rcon.removedServerIds.includes(String(sharedServerId)));
});

test('deleting a server_id the caller never had access to returns 404', async () => {
  const response = await request(app.port, '/api/delete-server', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: otherSession.cookie,
      'x-csrf-token': otherSession.csrf,
    },
    body: JSON.stringify({ server_id: '999999' }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'Server not found' });
});
