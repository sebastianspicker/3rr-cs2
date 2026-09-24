/** Route-level contract for Workshop favorite persistence, pinned before repository extraction. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  insertServer,
  insertUser,
  grantAccess,
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
  insertServer(app.database, 9, '203.0.113.9', 27015, 'password', 1);
  insertServer(app.database, 10, '203.0.113.10', 27015, 'password', 2);
  grantAccess(app.database, 1, 9);
  grantAccess(app.database, 2, 10);
  ownerSession = await loginAs(app.port, 'owner', 'owner-password-123');
  otherSession = await loginAs(app.port, 'other', 'other-password-123');
});

after(async () => {
  await app.close();
});

test('an authorized owner lists an empty favorites collection', async () => {
  const response = await request(app.port, '/api/workshop-favorites/9', {
    headers: { accept: 'application/json', cookie: ownerSession.cookie },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { favorites: [] });
});

let createdFavoriteId: number;

test('creating a favorite returns 201 with the stored row', async () => {
  const response = await request(app.port, '/api/workshop-favorites/9', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
    body: JSON.stringify({ workshop_id: '123456', name: 'de_dust2 remix' }),
  });
  assert.equal(response.status, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.favorite.workshop_id, '123456');
  assert.equal(body.favorite.name, 'de_dust2 remix');
  assert.equal(typeof body.favorite.id, 'number');
  createdFavoriteId = body.favorite.id;
});

test('creating a favorite with the same workshop_id upserts rather than duplicating', async () => {
  const response = await request(app.port, '/api/workshop-favorites/9', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
    body: JSON.stringify({ workshop_id: '123456', name: 'de_dust2 renamed' }),
  });
  assert.equal(response.status, 201);
  const body = JSON.parse(response.body);
  assert.equal(body.favorite.id, createdFavoriteId);
  assert.equal(body.favorite.name, 'de_dust2 renamed');

  const list = await request(app.port, '/api/workshop-favorites/9', {
    headers: { accept: 'application/json', cookie: ownerSession.cookie },
  });
  assert.equal(JSON.parse(list.body).favorites.length, 1);
});

test('renaming a favorite via PATCH persists the new name', async () => {
  const response = await request(app.port, `/api/workshop-favorites/9/${createdFavoriteId}`, {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
    body: JSON.stringify({ name: 'Renamed favorite' }),
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).favorite.name, 'Renamed favorite');
});

test('updating a favorite to a workshop_id that already exists returns 409', async () => {
  await request(app.port, '/api/workshop-favorites/9', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
    body: JSON.stringify({ workshop_id: '654321', name: 'Second favorite' }),
  });
  const response = await request(app.port, `/api/workshop-favorites/9/${createdFavoriteId}`, {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
    body: JSON.stringify({ workshop_id: '654321' }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'A favorite with that workshop_id already exists',
  });
});

test('another user cannot list favorites on a server they cannot access', async () => {
  const response = await request(app.port, '/api/workshop-favorites/9', {
    headers: { accept: 'application/json', cookie: otherSession.cookie },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), { error: 'Access denied to this server' });
});

test('another user cannot delete a favorite belonging to a server they cannot access', async () => {
  const response = await request(app.port, `/api/workshop-favorites/9/${createdFavoriteId}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      cookie: otherSession.cookie,
      'x-csrf-token': otherSession.csrf,
    },
  });
  assert.equal(response.status, 403);
});

test('deleting an unknown favorite id returns 404', async () => {
  const response = await request(app.port, '/api/workshop-favorites/9/999999', {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
  });
  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'Favorite not found' });
});

test('the owner deletes their own favorite', async () => {
  const response = await request(app.port, `/api/workshop-favorites/9/${createdFavoriteId}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      cookie: ownerSession.cookie,
      'x-csrf-token': ownerSession.csrf,
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { message: 'Favorite deleted' });
});
