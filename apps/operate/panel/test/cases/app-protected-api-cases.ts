/** Authorization and input-policy scenarios for protected operational APIs. */
import { test } from 'node:test';
import {
  app,
  loginAndGetSession,
  postJson,
  assert,
  withAppServer,
  type AddressInfo,
  type Server,
} from '../support/app-fixture';

export function registerProtectedApiScenarios(): void {
  test('POST /api/restart returns unauthorized without session', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ server_id: 1 }),
      });

      assert.equal(res.status, 401);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, 'Unauthorized');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/restart returns 400 when server_id is missing (authenticated)', async () => {
    await withAppServer(async (baseUrl, port) => {
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await postJson(
        baseUrl,
        '/api/restart',
        {},
        {
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        }
      );

      assert.equal(res.status, 400);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, 'Missing or invalid server_id');
    });
  });

  test('POST /api/restart rejects malformed server_id (authenticated)', async () => {
    await withAppServer(async (baseUrl, port) => {
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await postJson(
        baseUrl,
        '/api/restart',
        { server_id: '1abc' },
        {
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        }
      );

      assert.equal(res.status, 400);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, 'Missing or invalid server_id');
    });
  });

  test('POST /api/rcon blocks command separators (authenticated)', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);

      const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, command: 'quit; status' }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as Record<string, unknown>;
      assert.match(body.error as string, /Command not allowed/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
