/** Login-page state and public static-asset scenarios. */
import { test } from 'node:test';
import { app, assert, withAppServer, type AddressInfo, type Server } from '../support/app-fixture';

export function registerAuthPageScenarios(): void {
  test('GET / returns login page (not authenticated)', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);

      const text = await res.text();
      assert.ok(text.toLowerCase().includes('login'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('GET / explains an expired session recovery', async () => {
    await withAppServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/?expired=1`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /Your session expired\. Sign in again to continue\./);
    });
  });

  test('GET / only accepts the exact scalar expired-session flag', async () => {
    await withAppServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/?expired=1&expired=1`);
      assert.equal(res.status, 200);
      assert.doesNotMatch(await res.text(), /Your session expired\. Sign in again to continue\./);
    });
  });

  test('stable static asset URLs require cache revalidation', async () => {
    await withAppServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/css/panel.css`);
      assert.equal(res.status, 200);
      const cacheControl = res.headers.get('cache-control') ?? '';
      assert.match(cacheControl, /max-age=0/);
      assert.doesNotMatch(cacheControl, /immutable/);
    });
  });
}
