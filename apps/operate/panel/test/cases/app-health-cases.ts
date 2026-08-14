/** Public and verbose health-route readiness scenarios. */
import { test } from 'node:test';
import {
  app,
  setRconInitSummary,
  assert,
  withAppServer,
  type AddressInfo,
  type Server,
} from '../support/app-fixture';

export function registerHealthScenarios(): void {
  test('GET /api/health returns minimal payload when unauthenticated', async () => {
    await withAppServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('ratelimit-policy'), null);
      const body = (await res.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(body).sort(), ['ok', 'ready']);
      assert.equal(body.ok, true);
      assert.equal(body.ready, true);
    });
  });

  test('GET /api/health/ bypasses rate limiting like /api/health', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/api/health/`);

      assert.equal(res.status, 200);
      assert.equal(res.headers.has('ratelimit-policy'), false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('GET /api/health returns verbose payload when HEALTHCHECK_VERBOSE=true', async () => {
    const previous = process.env.HEALTHCHECK_VERBOSE;
    process.env.HEALTHCHECK_VERBOSE = 'true';
    try {
      await withAppServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('ratelimit-policy'), null);
        const body = (await res.json()) as Record<string, unknown>;
        assert.deepEqual(Object.keys(body).sort(), ['db', 'ok', 'rcon', 'ready', 'redis']);
        assert.equal(body.ready, true);
      });
    } finally {
      if (previous === undefined) {
        delete process.env.HEALTHCHECK_VERBOSE;
      } else {
        process.env.HEALTHCHECK_VERBOSE = previous;
      }
    }
  });

  test('GET /api/health exposes degraded RCON readiness when startup connections fail', async () => {
    const server: Server = app.listen(0);
    const previousVerbose = process.env.HEALTHCHECK_VERBOSE;
    process.env.HEALTHCHECK_VERBOSE = 'true';
    setRconInitSummary({
      complete: true,
      total: 2,
      connected: 0,
      failed: 2,
      skipped: 0,
      errors: [
        { server_id: '1', serverIP: '203.0.113.10', message: 'RCON initialization failed' },
        { server_id: '2', serverIP: '203.0.113.11', message: 'RCON initialization failed' },
      ],
    });
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        ok: boolean;
        ready: boolean;
        rcon?: { ready: boolean; total: number; connected: number; failed: number };
      };

      assert.equal(body.ok, true);
      assert.equal(body.ready, false);
      assert.equal(body.rcon?.ready, false);
      assert.equal(body.rcon?.total, 2);
      assert.equal(body.rcon?.connected, 0);
      assert.equal(body.rcon?.failed, 2);
    } finally {
      setRconInitSummary({
        complete: true,
        total: 0,
        connected: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      });
      if (previousVerbose === undefined) {
        delete process.env.HEALTHCHECK_VERBOSE;
      } else {
        process.env.HEALTHCHECK_VERBOSE = previousVerbose;
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
