/** Serialized RCON command scenarios, including timeout ownership. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rconFixture } from '../support/rcon-manager-fixture';
import {
  createReadyRconManager,
  rconServer,
  waitForCondition,
} from '../support/rcon-manager-scenarios';

export function registerRconSerializationScenarios(): void {
  test('executeCommand serializes commands per server', async () => {
    const manager = await createReadyRconManager();
    try {
      assert.equal(await manager.connectServer(rconServer()), true);

      const [first, second] = await Promise.all([
        manager.executeCommand('1', 'status'),
        manager.executeCommand('1', 'hostname'),
      ]);

      assert.equal(first, 'status ok');
      assert.equal(second, 'hostname ok');
      assert.equal(rconFixture.maxConcurrentExec, 1);
    } finally {
      await manager.shutdownAll();
    }
  });

  test('command timeout retains socket ownership until close is confirmed', async () => {
    rconFixture.socketClosesOnDestroy = false;
    const manager = await createReadyRconManager({ commandTimeoutMs: 20 });
    try {
      assert.equal(await manager.connectServer(rconServer()), true);

      rconFixture.commandsThatHang.add('status');
      await assert.rejects(() => manager.executeCommand('1', 'status'), /RCON command timed out/);
      assert.equal(manager.hasConnection('1'), true);

      rconFixture.socketClosesOnDestroy = true;
      rconFixture.createdConnections[0]?.connection.destroy();
      await waitForCondition(() => !manager.hasConnection('1'), 100);
      assert.equal(manager.getConnectionInfo('1')?.connected, false);
      assert.equal(manager.getConnectionInfo('1')?.authenticated, false);
    } finally {
      rconFixture.socketClosesOnDestroy = true;
      await manager.shutdownAll();
    }
  });
}
