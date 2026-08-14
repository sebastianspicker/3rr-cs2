/** Shared RCON lifecycle scenario setup; fixture mocks must load before RconManager. */
import assert from 'node:assert/strict';
import type { RconManager } from '../../modules/rcon';
import type { RconManagerOptions, ServerRecord } from '../../modules/rconTypes';

export function rconServer(id = 1): ServerRecord {
  return {
    id,
    serverIP: `203.0.113.${9 + id}`,
    serverPort: 27014 + id,
    rconPassword: 'test-password',
  };
}

export async function createReadyRconManager(
  options: RconManagerOptions = {}
): Promise<RconManager> {
  const { RconManager } = await import('../../modules/rcon');
  const manager = new RconManager(() => 'test-password', options);
  await manager.readyPromise;
  return manager;
}

export async function waitForCondition(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail('condition was not met before the timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
