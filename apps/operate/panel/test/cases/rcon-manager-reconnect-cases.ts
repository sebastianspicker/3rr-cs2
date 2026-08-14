/** RCON reconnect scenarios that must retain or replace socket ownership safely. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rconFixture } from '../support/rcon-manager-fixture';
import { createReadyRconManager, rconServer } from '../support/rcon-manager-scenarios';

export function registerRconReconnectScenarios(): void {
  test('connectServer retains an unconfirmed socket instead of replacing it', async () => {
    rconFixture.socketClosesOnEnd = false;
    rconFixture.socketClosesOnDestroy = false;
    const manager = await createReadyRconManager({
      disconnectTimeoutMs: 10,
      forceDisconnectTimeoutMs: 10,
    });
    try {
      const server = rconServer();
      assert.equal(await manager.connectServer(server), true);
      assert.equal(await manager.connectServer(server), false);
      assert.equal(await manager.connectServer(server), false);
      assert.equal(rconFixture.createdHosts.length, 1);
      assert.equal(manager.hasConnection('1'), true);
      assert.equal(rconFixture.createdConnections[0]?.connection.listenerCount('close'), 1);
      assert.equal(rconFixture.createdConnections[0]?.connection.listenerCount('error'), 0);
    } finally {
      rconFixture.socketClosesOnEnd = true;
      rconFixture.socketClosesOnDestroy = true;
      await manager.shutdownAll();
    }
  });

  test('disconnect force-destroys a graceful-close hang before replacing the socket', async () => {
    rconFixture.socketClosesOnEnd = false;
    const manager = await createReadyRconManager({
      disconnectTimeoutMs: 10,
      forceDisconnectTimeoutMs: 50,
    });
    try {
      const server = rconServer();
      assert.equal(await manager.connectServer(server), true);
      assert.equal(await manager.connectServer(server), true);
      assert.equal(rconFixture.createdHosts.length, 2);
      assert.equal(manager.hasConnection('1'), true);
    } finally {
      rconFixture.socketClosesOnEnd = true;
      await manager.shutdownAll();
    }
  });
}
