/** Runtime startup, listener, and response-header scenarios for the production entrypoint. */
import { test } from 'node:test';
import {
  tmpDir,
  dbPath,
  get,
  getAvailablePort,
  canBindPort,
  startEntrypoint,
  stopEntrypoint,
  withEntrypoint,
  path,
  assert,
} from '../support/entrypoint-fixture';

export function registerEntrypointRuntimeScenarios(): void {
  test('entrypoint listens on explicit PORT', async () => {
    const requestedPort = await getAvailablePort();
    await withEntrypoint(
      {
        PORT: String(requestedPort),
        DB_PATH: path.join(tmpDir, `explicit-port-${Date.now()}.db`),
        DEFAULT_USERNAME: 'explicit_port_admin',
        DEFAULT_PASSWORD: ['explicit', 'port', '12345'].join('_'),
        ALLOW_DEFAULT_CREDENTIALS: 'true',
      },
      async ({ port, output }) => {
        assert.equal(port, requestedPort, output());
        const health = await get('/api/health', port);
        assert.equal(health.status, 200);
      }
    );
  });

  test('entrypoint defaults to port 3000 when PORT is unset', async (t) => {
    if (!(await canBindPort(3000))) {
      t.skip('port 3000 is already in use');
      return;
    }

    await withEntrypoint(
      {
        PORT: undefined,
        DB_PATH: path.join(tmpDir, `default-port-${Date.now()}.db`),
        DEFAULT_USERNAME: 'default_port_admin',
        DEFAULT_PASSWORD: ['default', 'port', '12345'].join('_'),
        ALLOW_DEFAULT_CREDENTIALS: 'true',
      },
      async ({ port, output }) => {
        assert.equal(port, 3000, output());
        const health = await get('/api/health', port);
        assert.equal(health.status, 200);
      }
    );
  });

  test('entrypoint serves a nonce-based content security policy', async () => {
    await withEntrypoint(
      {
        DB_PATH: path.join(tmpDir, `csp-env-${Date.now()}.db`),
        DEFAULT_USERNAME: 'csp_admin',
        DEFAULT_PASSWORD: ['csp', 'admin', '12345'].join('_'),
        ALLOW_DEFAULT_CREDENTIALS: 'true',
      },
      async ({ port, output }) => {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        assert.equal(res.status, 200, output());
        const csp = res.headers.get('content-security-policy') ?? '';
        assert.match(csp, /default-src 'self'/);
        assert.match(csp, /script-src 'self' 'nonce-[^']+'/);

        const nonce = csp.match(/script-src 'self' 'nonce-([^']+)'/)?.[1];
        assert.ok(nonce, csp);
        const html = await res.text();
        assert.ok(html.includes(`nonce="${nonce}"`), 'page script nonce should match CSP header');
      }
    );
  });

  test('`tsx app.ts` starts and logs listening port', async () => {
    const { child, port, output } = await startEntrypoint({
      DB_PATH: dbPath,
      DEFAULT_USERNAME: 'testuser',
      DEFAULT_PASSWORD: ['test', 'pass', '12345'].join(''),
      ALLOW_DEFAULT_CREDENTIALS: 'true',
    });

    assert.ok(Number.isInteger(port) && port > 0);
    const css = await get('/css/panel.css', port);
    const js = await get('/js/console.js', port);
    assert.equal(css.status, 200);
    assert.match(css.body, /\.auth-page|\.panel/);
    assert.equal(js.status, 200);
    assert.match(js.body, /DOMContentLoaded/);

    const exitCode = await stopEntrypoint(child);
    assert.equal(exitCode, 0, `entrypoint did not shut down cleanly\n${output()}`);
  });
}
