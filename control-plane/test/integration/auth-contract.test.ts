/** Route-level contract for login/logout and session-user revalidation against SQLite. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { insertUser, startTestApp, type TestApp } from './support/appHarness';
import { csrfToken, loginAs, request, sessionCookie } from './support/httpClient';

let app: TestApp;

before(async () => {
  app = await startTestApp();
  insertUser(app.database, 1, 'admin', 'admin-password-123', true);
});

after(async () => {
  await app.close();
});

test('logging in with the correct credentials returns 200 and a session cookie', async () => {
  const session = await loginAs(app.port, 'admin', 'admin-password-123');
  assert.ok(session.cookie);
});

test('logging in with an incorrect password returns 401', async () => {
  const initial = await request(app.port, '/');
  const response = await request(app.port, '/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: sessionCookie(initial),
      'x-csrf-token': csrfToken(initial),
    },
    body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Invalid credentials' });
});

test('logging in with an unknown username returns 401', async () => {
  const initial = await request(app.port, '/');
  const response = await request(app.port, '/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: sessionCookie(initial),
      'x-csrf-token': csrfToken(initial),
    },
    body: JSON.stringify({ username: 'nobody', password: 'anything-at-all' }), // ggignore: deliberately wrong test credential
  });
  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Invalid credentials' });
});

test('a session user deleted from the database is rejected on the next protected request', async () => {
  insertUser(app.database, 2, 'transient', 'placeholder-password-123', false);
  const session = await loginAs(app.port, 'transient', 'placeholder-password-123');
  app.database.prepare('DELETE FROM users WHERE id = ?').run(2);
  const response = await request(app.port, '/api/servers', {
    headers: { accept: 'application/json', cookie: session.cookie },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), { error: 'Unauthorized' });
});

test('logging out destroys the session', async () => {
  const session = await loginAs(app.port, 'admin', 'admin-password-123');
  const logout = await request(app.port, '/auth/logout', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      cookie: session.cookie,
      'x-csrf-token': session.csrf,
    },
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(JSON.parse(logout.body), { message: 'Logged out' });

  const afterLogout = await request(app.port, '/api/servers', {
    headers: { accept: 'application/json', cookie: session.cookie },
  });
  assert.equal(afterLogout.status, 401);
});
