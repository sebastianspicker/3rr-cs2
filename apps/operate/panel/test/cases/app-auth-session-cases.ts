/** Login and logout session-rotation scenarios. */
import { test } from 'node:test';
import {
  app,
  loginAndGetSession,
  postJson,
  assert,
  getLoginPageCsrfAndCookie,
  withAppServer,
  type AddressInfo,
  type Server,
} from '../support/app-fixture';

export function registerAuthSessionScenarios(): void {
  test('POST /auth/login rejects missing CSRF token', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: ['test', 'pass', '12345'].join(''),
        }),
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, 'Invalid CSRF token');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /auth/login sets hardened session cookie when CSRF is valid', async () => {
    await withAppServer(async (baseUrl, port) => {
      const { cookie, csrfToken } = await getLoginPageCsrfAndCookie(port);

      const res = await postJson(
        baseUrl,
        '/auth/login',
        { username: 'testuser', password: ['test', 'pass', '12345'].join('') },
        { cookie, 'x-csrf-token': csrfToken }
      );

      assert.equal(res.status, 200);

      const loginSetCookie = res.headers.get('set-cookie');
      assert.ok(loginSetCookie);
      assert.ok(/HttpOnly/i.test(loginSetCookie));
      assert.ok(/SameSite=Strict/i.test(loginSetCookie));
      assert.notEqual(loginSetCookie.split(';')[0], cookie, 'session id should rotate on login');
    });
  });

  test('POST /auth/logout requires CSRF when authenticated', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken: postLoginCsrfToken } = await loginAndGetSession(port);

      const logoutRes = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          accept: 'application/json',
          'x-csrf-token': postLoginCsrfToken,
        },
      });

      assert.equal(logoutRes.status, 200);
      const clearedCookie = logoutRes.headers.get('set-cookie') || '';
      assert.ok(
        clearedCookie.includes('Max-Age=0') || clearedCookie.includes('Expires=Thu, 01 Jan 1970')
      );
      const body = (await logoutRes.json()) as Record<string, unknown>;
      assert.equal(body.message, 'Logged out');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /auth/login returns 401 on invalid password', async () => {
    await withAppServer(async (baseUrl, port) => {
      const { cookie, csrfToken } = await getLoginPageCsrfAndCookie(port);

      const res = await postJson(
        baseUrl,
        '/auth/login',
        { username: 'testuser', password: 'wrongpassword1' },
        { cookie, 'x-csrf-token': csrfToken }
      );

      assert.equal(res.status, 401);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, 'Invalid credentials');
    });
  });
}
