/** Route-level contract for /api/health, pinned before the health check moves into infrastructure. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { insertUser, startTestApp, type TestApp } from './support/appHarness';
import { loginAs, request } from './support/httpClient';

let app: TestApp;

before(async () => {
  app = await startTestApp();
  insertUser(app.database, 1, 'admin', 'admin-password-123', true);
});

after(async () => {
  await app.close();
});

test('an unauthenticated caller receives the minimal health payload', async () => {
  const response = await request(app.port, '/api/health');
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(Object.keys(body).sort(), ['ok', 'ready']);
  assert.equal(body.ok, true);
  assert.equal(body.ready, true);
});

test('an authenticated caller receives the verbose health payload', async () => {
  const session = await loginAs(app.port, 'admin', 'admin-password-123');
  const response = await request(app.port, '/api/health', {
    headers: { accept: 'application/json', cookie: session.cookie },
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.db, true);
  assert.equal(body.redis, null);
  assert.equal(body.rcon.ready, true);
});
