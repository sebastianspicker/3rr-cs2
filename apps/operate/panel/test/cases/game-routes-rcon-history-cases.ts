import { test } from 'node:test';
import {
  app,
  serverId,
  loginAndGetSession,
  assert,
  type AddressInfo,
  type Server,
} from '../game-routes-fixture';
import { loopbackFetch } from '../support/http-helpers';

test('RCON sent-command history stores dispatched commands only and prunes to 50 unique commands', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);
    const historyUrl = `http://127.0.0.1:${port}/api/rcon/history/${serverId}`;

    await loopbackFetch(historyUrl, {
      method: 'DELETE',
      headers: { cookie: sessionCookie, 'x-csrf-token': csrfToken },
    });

    for (let i = 0; i < 55; i++) {
      const res = await loopbackFetch(`http://127.0.0.1:${port}/api/rcon`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: serverId, command: `status ${i}` }),
      });
      assert.equal(res.status, 200);
    }

    await loopbackFetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, message: 'not stored in history' }),
    });

    const list = await loopbackFetch(historyUrl, { headers: { cookie: sessionCookie } });
    assert.equal(list.status, 200);
    const body = (await list.json()) as {
      commands: Array<{ command: string }>;
      history_state: 'available';
    };
    assert.equal(body.history_state, 'available');
    assert.equal(body.commands.length, 50);
    assert.equal(body.commands[0]?.command, 'status 54');
    assert.equal(body.commands.at(-1)?.command, 'status 5');
    assert.equal(
      body.commands.some((item) => item.command.includes('not stored')),
      false
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
