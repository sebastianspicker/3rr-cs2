/** Source RCON protocol scenario registrations for the manager discovery shell. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RconProtocolFixture } from '../support/rcon-protocol-fixture';

/** Registers authentication, timeout, and reconnection protocol scenarios. */
export function registerRconManagerProtocolScenarios(authTimeoutMs: number): void {
  test('RconManager authenticates and executes against a local Source RCON protocol fixture', async () => {
    const fixture = new RconProtocolFixture({
      password: 'fixture-password',
      commandResponses: { status: 'fixture status' },
    });
    await fixture.start();
    const { RconManager } = await import('../../modules/rcon');
    const manager = new RconManager(() => 'fixture-password');
    try {
      await manager.readyPromise;
      const connected = await manager.connectServer({
        id: 1,
        serverIP: '127.0.0.1',
        serverPort: fixture.port,
        rconPassword: 'fixture-password',
      });
      assert.equal(connected, true);

      const output = await manager.executeCommand('1', 'status');
      assert.equal(output, 'fixture status');
      assert.deepEqual(fixture.commands, ['status']);
    } finally {
      await manager.shutdownAll();
      await fixture.stop();
    }
  });

  test('RconManager reports protocol authentication rejection without creating a connection', async () => {
    const fixture = new RconProtocolFixture({ password: 'fixture-password' });
    await fixture.start();
    const { RconManager } = await import('../../modules/rcon');
    const manager = new RconManager(() => 'wrong-password');
    try {
      await manager.readyPromise;
      const connected = await manager.connectServer({
        id: 1,
        serverIP: '127.0.0.1',
        serverPort: fixture.port,
        rconPassword: 'wrong-password',
      });

      assert.equal(connected, false);
      assert.equal(manager.hasConnection('1'), false);
    } finally {
      await manager.shutdownAll();
      await fixture.stop();
    }
  });

  test('RconManager times out delayed protocol auth and rejects probeServer', async () => {
    const fixture = new RconProtocolFixture({ password: 'fixture-password', authDelayMs: 200 });
    await fixture.start();
    const { RconManager } = await import('../../modules/rcon');
    const manager = new RconManager(() => 'fixture-password', { authTimeoutMs });
    try {
      await manager.readyPromise;
      await assert.rejects(
        () =>
          manager.probeServer({
            id: 1,
            serverIP: '127.0.0.1',
            serverPort: fixture.port,
            rconPassword: 'fixture-password',
          }),
        /RCON authentication failed/
      );
      assert.equal(manager.hasConnection('1'), false);
    } finally {
      await manager.shutdownAll();
      await fixture.stop();
    }
  });

  test('RconManager reconnects after a protocol socket closes during command execution', async () => {
    const fixture = new RconProtocolFixture({
      password: 'fixture-password',
      closeFirstCommand: true,
    });
    await fixture.start();
    const { RconManager } = await import('../../modules/rcon');
    const manager = new RconManager(() => 'fixture-password');
    try {
      await manager.readyPromise;
      const connected = await manager.connectServer({
        id: 1,
        serverIP: '127.0.0.1',
        serverPort: fixture.port,
        rconPassword: 'fixture-password',
      });
      assert.equal(connected, true);

      await assert.rejects(() => manager.executeCommand('1', 'status'), /RCON command timed out/);

      const output = await manager.executeCommand('1', 'hostname');
      assert.equal(output, 'hostname ok');
      assert.deepEqual(fixture.commands, ['status', 'hostname']);
    } finally {
      await manager.shutdownAll();
      await fixture.stop();
    }
  });
}
