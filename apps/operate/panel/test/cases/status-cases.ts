/** Status endpoint scenario registrations kept separate from lifecycle wiring. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StatusFixture } from '../support/status-fixture';

interface StatusBody {
  hostname: string | null;
  humans: number | null;
  bots: number | null;
  max_players: number | null;
  connected: boolean;
  authenticated: boolean;
  partial: boolean;
  complete: boolean;
  observed_at: string | null;
  error: string | null;
}

/** Registers status access, complete observation, and degraded-observation scenarios. */
export function registerStatusScenarios(getFixture: () => StatusFixture): void {
  test('GET /api/status/:server_id rejects unauthenticated requests', async () => {
    const fixture = getFixture();
    await fixture.withServer(async (port) => {
      const res = await fixture.getUnauthenticatedStatus(port);
      assert.equal(res.status, 401);
    });
  });

  test('GET /api/status/:server_id returns 404 for non-existent server', async () => {
    const fixture = getFixture();
    await fixture.withServer(async (port) => {
      const res = await fixture.getAuthenticatedStatus(port, 99999);
      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, 'Server not found');
    });
  });

  test('GET /api/status/:server_id returns player counts when RCON is available', async () => {
    const fixture = getFixture();
    await fixture.withServer(async (port) => {
      const res = await fixture.getAuthenticatedStatus(port);
      assert.equal(res.status, 200);
      const body = (await res.json()) as StatusBody;
      assert.equal(body.hostname, 'Test Status Server');
      assert.equal(body.humans, 4);
      assert.equal(body.bots, 1);
      assert.equal(body.max_players, 12);
      assert.equal(body.connected, true);
      assert.equal(body.authenticated, true);
      assert.equal(body.partial, false);
      assert.equal(body.complete, true);
      assert.match(body.observed_at ?? '', /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(body.error, null);
    });
  });

  test('GET /api/status/:server_id reports partial RCON observations explicitly', async () => {
    const fixture = getFixture();
    fixture.setFailingRconCommands(['status']);
    await fixture.withServer(async (port) => {
      const res = await fixture.getAuthenticatedStatus(port);
      assert.equal(res.status, 200);
      const body = (await res.json()) as StatusBody;
      assert.equal(body.hostname, 'Test Status Server');
      assert.equal(body.humans, null);
      assert.equal(body.bots, null);
      assert.equal(body.max_players, 12);
      assert.equal(body.connected, true);
      assert.equal(body.authenticated, true);
      assert.equal(body.partial, true);
      assert.equal(body.complete, false);
      assert.match(body.observed_at ?? '', /^\d{4}-\d{2}-\d{2}T/);
      assert.match(body.error ?? '', /status unavailable/);
    });
  });

  test('GET /api/status/:server_id returns explicit error fields when RCON is unavailable', async () => {
    const fixture = getFixture();
    fixture.setFailingRconCommands(['status', 'hostname', 'sv_visiblemaxplayers']);
    fixture.setRconUnavailable();
    await fixture.withServer(async (port) => {
      const res = await fixture.getAuthenticatedStatus(port);
      assert.equal(res.status, 200, 'RCON failure must be represented in the response body');
      const body = (await res.json()) as StatusBody;
      assert.equal(body.humans, null);
      assert.equal(body.bots, null);
      assert.equal(body.max_players, null);
      assert.equal(body.connected, false);
      assert.equal(body.authenticated, false);
      assert.equal(body.partial, false);
      assert.equal(body.complete, false);
      assert.equal(body.observed_at, null);
      assert.match(body.error ?? '', /status unavailable/);
    });
  });
}
