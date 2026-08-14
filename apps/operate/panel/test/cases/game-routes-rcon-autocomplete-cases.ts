import { test } from 'node:test';
import {
  app,
  serverId,
  executedCommands,
  loginAndGetSession,
  createAccessibleServerForTest,
  assert,
  type AddressInfo,
  type Server,
} from '../game-routes-fixture';

test('GET /api/rcon/autocomplete/:server_id filters suggestions and reports cache hits truthfully', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginAndGetSession(port);
    const policyRes = await fetch(
      `http://127.0.0.1:${port}/api/rcon/autocomplete/${serverId}?q=sv&limit=10&refresh=1`,
      { headers: { cookie: sessionCookie } }
    );
    assert.equal(policyRes.status, 200);
    const policyBody = (await policyRes.json()) as { suggestions: string[]; error: string | null };
    assert.deepEqual(policyBody.suggestions, ['sv_visiblemaxplayers']);
    assert.equal(policyBody.error, null);
    executedCommands.length = 0;

    const autocompleteServerId = await createAccessibleServerForTest();
    const baseUrl = `http://127.0.0.1:${port}`;
    const requestAutocomplete = async (query = '') => {
      const res = await fetch(
        `${baseUrl}/api/rcon/autocomplete/${autocompleteServerId}?q=sv&limit=10${query}`,
        { headers: { cookie: sessionCookie } }
      );
      assert.equal(res.status, 200);
      return (await res.json()) as {
        suggestions: string[];
        cached: boolean;
        error: string | null;
      };
    };

    const first = await requestAutocomplete();
    assert.equal(first.cached, false);
    assert.deepEqual(first.suggestions, ['sv_visiblemaxplayers']);
    assert.deepEqual(executedCommands, ['cmdlist', 'cvarlist']);
    executedCommands.length = 0;

    const second = await requestAutocomplete();
    assert.equal(second.cached, true);
    assert.deepEqual(second.suggestions, ['sv_visiblemaxplayers']);
    assert.deepEqual(executedCommands, []);

    const refreshed = await requestAutocomplete('&refresh=1');
    assert.equal(refreshed.cached, false);
    assert.deepEqual(refreshed.suggestions, ['sv_visiblemaxplayers']);
    assert.deepEqual(executedCommands, ['cmdlist', 'cvarlist']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
