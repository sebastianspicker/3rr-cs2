/** Removal and shutdown scenarios for active, pending, and queued RCON work. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RconDisconnectResult } from '../../modules/rcon';
import { deferAuthentication, rconFixture, settleWithin } from '../support/rcon-manager-fixture';
import {
  createReadyRconManager,
  rconServer,
  waitForCondition,
} from '../support/rcon-manager-scenarios';

export function registerRconCleanupScenarios(): void {
  test('removeServer clears stale state while a command is in flight and is idempotent', async () => {
    const manager = await createReadyRconManager();
    try {
      assert.equal(await manager.connectServer(rconServer()), true);

      const command = manager.executeCommand('1', 'status').then(
        () => assert.fail('command resolved after the server was removed'),
        (err: unknown) => {
          assert.match(
            err instanceof Error ? err.message : String(err),
            /removed|No valid connection/
          );
        }
      );
      const removed = await manager.removeServer('1');
      assert.equal(removed.closed, true);
      assert.equal(removed.state, 'closed');
      assert.equal(manager.hasConnection('1'), false);
      assert.equal(manager.getConnectionInfo('1'), null);
      await command;
      assert.equal(manager.hasConnection('1'), false);

      const repeated = await manager.removeServer('1');
      assert.equal(repeated.closed, true);
      assert.equal(repeated.state, 'absent');
    } finally {
      await manager.shutdownAll();
    }
  });

  test('removeServer waits for a pending authentication socket and prevents late promotion', async () => {
    deferAuthentication();
    rconFixture.socketClosesOnDestroy = false;
    const manager = await createReadyRconManager({
      authTimeoutMs: 200,
      forceDisconnectTimeoutMs: 100,
    });
    const server = rconServer();
    let connecting: Promise<boolean> | undefined;
    let removing: Promise<RconDisconnectResult> | undefined;
    try {
      connecting = manager.connectServer(server);
      await waitForCondition(() => rconFixture.createdConnections.length === 1, 100);

      removing = manager.removeServer('1');
      assert.deepEqual(await settleWithin(removing, 10), { settled: false });
      assert.equal(await manager.connectServer(server), false);

      assert.ok(rconFixture.releaseAuthentication);
      rconFixture.releaseAuthentication();
      assert.equal(await connecting, false);
      assert.deepEqual(await settleWithin(removing, 10), { settled: false });

      rconFixture.socketClosesOnDestroy = true;
      rconFixture.createdConnections[0]?.connection.destroy();
      assert.deepEqual(await removing, { server_id: '1', state: 'closed', closed: true });
      assert.equal(manager.hasConnection('1'), false);
      assert.equal(manager.getConnectionInfo('1'), null);

      const shutdown = await manager.shutdownAll();
      assert.equal(shutdown.total, 0);
    } finally {
      rconFixture.releaseAuthentication?.();
      rconFixture.socketClosesOnDestroy = true;
      for (const connection of rconFixture.createdConnections) connection.connection.destroy();
      const pending: Promise<unknown>[] = [];
      if (connecting) pending.push(connecting);
      if (removing) pending.push(removing);
      await Promise.allSettled(pending);
      await manager.shutdownAll();
    }
  });

  test('shutdownAll reports unconfirmed cleanup instead of claiming every socket closed', async () => {
    rconFixture.socketClosesOnEnd = false;
    rconFixture.socketClosesOnDestroy = false;
    const manager = await createReadyRconManager({
      disconnectTimeoutMs: 10,
      forceDisconnectTimeoutMs: 10,
    });
    try {
      assert.equal(await manager.connectServer(rconServer()), true);

      const summary = await manager.shutdownAll();
      assert.equal(summary.total, 1);
      assert.equal(summary.closed, 0);
      assert.equal(summary.failed, 1);
      assert.equal(summary.results[0]?.state, 'timeout');
      assert.equal(manager.hasConnection('1'), true);
    } finally {
      rconFixture.socketClosesOnEnd = true;
      rconFixture.socketClosesOnDestroy = true;
      await manager.shutdownAll();
    }
  });

  test('shutdownAll reports an authenticating socket whose destruction is unconfirmed', async () => {
    rconFixture.authenticateShouldHang = true;
    rconFixture.socketClosesOnDestroy = false;
    const manager = await createReadyRconManager({
      authTimeoutMs: 50,
      forceDisconnectTimeoutMs: 10,
    });
    const connecting = manager.connectServer(rconServer());
    try {
      await waitForCondition(() => rconFixture.createdHosts.length === 1, 100);

      const summary = await manager.shutdownAll();
      assert.equal(summary.total, 1);
      assert.equal(summary.closed, 0);
      assert.equal(summary.failed, 1);
      assert.equal(summary.results[0]?.state, 'timeout');
    } finally {
      rconFixture.socketClosesOnDestroy = true;
      assert.equal(await connecting, false);
      await manager.shutdownAll();
    }
  });

  test('shutdownAll includes a confirmed authenticating-socket close in its summary', async () => {
    rconFixture.authenticateShouldHang = true;
    const manager = await createReadyRconManager({
      authTimeoutMs: 50,
      forceDisconnectTimeoutMs: 20,
    });
    const connecting = manager.connectServer(rconServer());
    try {
      await waitForCondition(() => rconFixture.createdHosts.length === 1, 100);

      const summary = await manager.shutdownAll();
      assert.equal(summary.total, 1);
      assert.equal(summary.closed, 1);
      assert.equal(summary.failed, 0);
      assert.equal(summary.results[0]?.state, 'closed');
    } finally {
      assert.equal(await connecting, false);
      await manager.shutdownAll();
    }
  });

  test('shutdownAll clears active state while queued commands are still settling', async () => {
    const manager = await createReadyRconManager();
    try {
      assert.equal(await manager.connectServer(rconServer()), true);

      const first = manager.executeCommand('1', 'status');
      const second = manager.executeCommand('1', 'hostname');
      const summary = await manager.shutdownAll();
      assert.equal(summary.failed, 0);
      assert.equal(manager.hasConnection('1'), false);

      const settled = await Promise.allSettled([first, second]);
      assert.equal(settled.length, 2);
      assert.equal(manager.hasConnection('1'), false);
    } finally {
      await manager.shutdownAll();
    }
  });
}
