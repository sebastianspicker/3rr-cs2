/** Connection setup test; the scenario mock loads before RconManager. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { rconScenario, resetRconScenario } from './support/rcon-manager';

afterEach(resetRconScenario);

test('connectServer pins the validated DNS address instead of reconnecting by hostname', async () => {
  rconScenario.resolvedHost = '203.0.113.77';
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    assert.equal(
      await manager.connectServer({
        id: 1,
        serverIP: 'rebind.example',
        serverPort: 27015,
        rconPassword: 'test-password',
      }),
      true
    );
    assert.deepEqual(rconScenario.createdHosts, ['203.0.113.77']);
    assert.equal(manager.getConnectionInfo('1')?.host, '203.0.113.77');
  } finally {
    await manager.shutdownAll();
  }
});
