import { test } from 'node:test';
import {
  serverId,
  executedCommands,
  postAuthedJson,
  postJson,
  assert,
  withAuthedServer,
  withServer,
} from '../game-routes-fixture';

test('POST /api/say-admin rejects unauthenticated requests', async () => {
  await withServer(async (baseUrl) => {
    const res = await postJson(baseUrl, '/api/say-admin', {
      server_id: serverId,
      message: 'hello',
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/say-admin sends the sanitized message as one quoted say command', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await postAuthedJson(baseUrl, auth, '/api/say-admin', {
      server_id: serverId,
      message: 'Server will "restart"; {soon}|',
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message: string };
    assert.equal(body.message, 'Say command sent.');
    assert.deepEqual(executedCommands, ['say "Server will restart soon"']);
  });
});

test('POST /api/say-admin rejects an empty message', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await postAuthedJson(baseUrl, auth, '/api/say-admin', {
      server_id: serverId,
      message: '',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /message is required/);
    assert.deepEqual(executedCommands, []);
  });
});

test('POST /api/say-admin rejects a message that sanitizes to empty', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    // All chars stripped by sanitizeString: control chars + semicolons + quotes
    const allStripped = '\x00\x01\x02;|{}';
    const res = await postAuthedJson(baseUrl, auth, '/api/say-admin', {
      server_id: serverId,
      message: allStripped,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(executedCommands, []);
  });
});
