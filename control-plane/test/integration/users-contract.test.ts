/** Route-level contract for admin user management and self-service password change. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  grantAccess,
  insertServer,
  insertUser,
  startTestApp,
  type TestApp,
} from './support/appHarness';
import { freshCsrf, loginAs, request } from './support/httpClient';

let app: TestApp;
let adminSession: { cookie: string; csrf: string };

before(async () => {
  app = await startTestApp();
  insertUser(app.database, 1, 'admin', 'admin-password-123', true);
  insertUser(app.database, 2, 'member', 'member-password-123', false);
  insertServer(app.database, 5, '203.0.113.30', 27015, 'password', 1);
  grantAccess(app.database, 1, 5);
  adminSession = await loginAs(app.port, 'admin', 'admin-password-123');
  adminSession.csrf = await freshCsrf(app.port, adminSession.cookie);
});

after(async () => {
  await app.close();
});

test('a non-admin cannot list users', async () => {
  const memberSession = await loginAs(app.port, 'member', 'member-password-123');
  const response = await request(app.port, '/api/users/list', {
    headers: { accept: 'application/json', cookie: memberSession.cookie },
  });
  assert.equal(response.status, 403);
});

let createdUserId: number;

test('an admin creates a user with initial server access', async () => {
  const response = await request(app.port, '/api/users/add', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: adminSession.cookie,
      'x-csrf-token': adminSession.csrf,
    },
    body: JSON.stringify({
      username: 'newoperator',
      password: 'operator-password-123',
      serverId: 5,
    }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual(JSON.parse(response.body), { message: 'User created' });

  const row = app.database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('newoperator') as {
    id: number;
  };
  createdUserId = row.id;
  const access = app.database
    .prepare('SELECT 1 FROM server_access WHERE user_id = ? AND server_id = ?')
    .get(createdUserId, 5);
  assert.ok(access);
});

test('creating a user with a username that already exists returns 409', async () => {
  const response = await request(app.port, '/api/users/add', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: adminSession.cookie,
      'x-csrf-token': adminSession.csrf,
    },
    body: JSON.stringify({ username: 'newoperator', password: 'operator-password-123' }),
  });
  assert.equal(response.status, 409);
});

test('GET /api/users/list returns every user', async () => {
  const response = await request(app.port, '/api/users/list', {
    headers: { accept: 'application/json', cookie: adminSession.cookie },
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body) as { users: { username: string }[] };
  assert.ok(body.users.some((user) => user.username === 'newoperator'));
});

test('an admin cannot delete their own account', async () => {
  const response = await request(app.port, '/api/users/delete', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: adminSession.cookie,
      'x-csrf-token': adminSession.csrf,
    },
    body: JSON.stringify({ userId: 1 }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Cannot delete your own account' });
});

test('deleting a user also deletes servers only that user could access', async () => {
  insertServer(app.database, 6, '203.0.113.31', 27015, 'password', createdUserId);
  grantAccess(app.database, createdUserId, 6);

  const response = await request(app.port, '/api/users/delete', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: adminSession.cookie,
      'x-csrf-token': adminSession.csrf,
    },
    body: JSON.stringify({ userId: createdUserId }),
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.user_deleted, true);
  assert.deepEqual(body.deleted_server_ids, [6]);
  assert.equal(body.rcon_cleanup, 'completed');

  const userGone = app.database.prepare('SELECT 1 FROM users WHERE id = ?').get(createdUserId);
  assert.equal(userGone, undefined);
  const exclusiveServerGone = app.database.prepare('SELECT 1 FROM servers WHERE id = ?').get(6);
  assert.equal(exclusiveServerGone, undefined);
  const sharedServerRemains = app.database.prepare('SELECT 1 FROM servers WHERE id = ?').get(5);
  assert.ok(sharedServerRemains);
  assert.ok(app.rcon.removedServerIds.includes('6'));
});

test('deleting an unknown user id returns 404', async () => {
  const response = await request(app.port, '/api/users/delete', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: adminSession.cookie,
      'x-csrf-token': adminSession.csrf,
    },
    body: JSON.stringify({ userId: 999999 }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'User not found' });
});

test('a user changes their own password with the correct current password', async () => {
  const memberSession = await loginAs(app.port, 'member', 'member-password-123');
  const csrf = await freshCsrf(app.port, memberSession.cookie);
  const response = await request(app.port, '/api/users/change-password', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: memberSession.cookie,
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({
      currentPassword: 'member-password-123',
      newPassword: 'member-password-456',
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { message: 'Password updated' });

  const relogin = await loginAs(app.port, 'member', 'member-password-456');
  assert.ok(relogin.cookie);
});

test('changing password with an incorrect current password returns 401', async () => {
  const memberSession = await loginAs(app.port, 'member', 'member-password-456');
  const csrf = await freshCsrf(app.port, memberSession.cookie);
  const response = await request(app.port, '/api/users/change-password', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: memberSession.cookie,
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({
      currentPassword: 'wrong-password',
      newPassword: 'another-password-123',
    }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Current password is incorrect' });
});
