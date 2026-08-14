/** Logout cookie clearing and post-logout authorization scenarios. */
import { test } from 'node:test';
import {
  app,
  loginAndGetSession,
  assert,
  type AddressInfo,
  type Server,
} from '../support/app-fixture';

export function registerSessionInvalidationScenarios(): void {
  test('POST /auth/logout clears the session cookie', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);

      const res = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
      });

      assert.equal(res.status, 200);
      const setCookie = res.headers.get('set-cookie') ?? '';
      assert.ok(
        setCookie.includes('3rr.sid=;') ||
          setCookie.includes('3rr.sid= ;') ||
          setCookie.includes('Expires=Thu, 01 Jan 1970'),
        `Expected cleared session cookie, got: ${setCookie}`
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('re-used session cookie after logout returns 401 on protected routes', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);

      await fetch(`http://127.0.0.1:${port}/auth/logout`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
        headers: {
          accept: 'application/json',
          cookie: sessionCookie,
        },
      });

      assert.equal(res.status, 401);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
