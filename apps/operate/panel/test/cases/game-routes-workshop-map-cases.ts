import { test } from 'node:test';
import {
  app,
  serverId,
  executedCommands,
  assert,
  type AddressInfo,
  type Server,
  withAuthedServer,
  postAuthedJson,
} from '../game-routes-fixture';

test('POST /api/workshop-map rejects unauthenticated requests', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/workshop-map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: serverId, workshop_id: '12345678901' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/workshop-map succeeds with a valid workshop id', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await postAuthedJson(baseUrl, auth, '/api/workshop-map', {
      server_id: serverId,
      workshop_id: '12345678901',
    });
    assert.equal(res.status, 200);
    assert.deepEqual(executedCommands, ['host_workshop_map 12345678901']);
  });
});

test('POST /api/workshop-map rejects non-numeric workshop id', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await postAuthedJson(baseUrl, auth, '/api/workshop-map', {
      server_id: serverId,
      workshop_id: 'notanid',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /workshop_id must be/);
    assert.deepEqual(executedCommands, []);
  });
});
