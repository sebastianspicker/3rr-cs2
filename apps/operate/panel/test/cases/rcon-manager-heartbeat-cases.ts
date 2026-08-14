/** Heartbeat failure and backoff recovery scenarios. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rconFixture } from '../support/rcon-manager-fixture';
import {
  createReadyRconManager,
  rconServer,
  waitForCondition,
} from '../support/rcon-manager-scenarios';

export function registerRconHeartbeatScenarios(): void {
  test('heartbeat reconnect failure removes only the failing server connection', async () => {
    const manager = await createReadyRconManager();
    const firstServer = rconServer();
    const secondServer = rconServer(2);
    try {
      assert.equal(await manager.connectServer(firstServer), true);
      assert.equal(await manager.connectServer(secondServer), true);

      rconFixture.commandsThatFail.add('status');
      rconFixture.authenticateShouldFail = true;
      await manager.sendHeartbeat('1', firstServer);

      assert.equal(manager.hasConnection('1'), false);
      assert.equal(manager.getConnectionInfo('1'), null);
      assert.equal(manager.hasConnection('2'), true);
      assert.equal(manager.getConnectionInfo('2')?.authenticated, true);
    } finally {
      await manager.shutdownAll();
    }
  });

  test('heartbeat keeps retrying after an immediate reconnect failure', async () => {
    const manager = await createReadyRconManager({
      heartbeatIntervalMs: 20,
      maxHeartbeatIntervalMs: 40,
      heartbeatTimeoutMs: 100,
    });
    const server = rconServer();
    try {
      assert.equal(await manager.connectServer(server), true);

      rconFixture.commandsThatFail.add('status');
      rconFixture.authenticateShouldFail = true;
      await manager.sendHeartbeat('1', server);
      assert.equal(manager.hasConnection('1'), false);

      rconFixture.commandsThatFail.delete('status');
      rconFixture.authenticateShouldFail = false;
      await waitForCondition(() => manager.hasConnection('1'), 500);

      assert.equal(manager.getConnectionInfo('1')?.authenticated, true);
      assert.ok(
        rconFixture.createdHosts.length >= 3,
        'expected the scheduled reconnect attempt to run'
      );
    } finally {
      await manager.shutdownAll();
    }
  });
}
