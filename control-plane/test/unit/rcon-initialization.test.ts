import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { initializeRconConnections } from '../../src/integrations/rcon/rconInitialization';
import type { ServerInfo } from '../../src/integrations/rcon/rconTypes';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('initializeRconConnections', () => {
  it('registers all records before four workers and reports failures in source order', async () => {
    const servers = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      serverIP: `server-${index + 1}.example`,
      serverPort: 27015,
    }));
    const remembered: ServerInfo[] = [];
    const releases = servers.map(() => deferred<boolean>());
    let active = 0;
    let peak = 0;
    const initialization = initializeRconConnections({
      db: { prepare: () => ({ all: () => servers }) } as never,
      hasConnection: (serverId) => serverId === '3',
      rememberServer: (server) => {
        remembered.push(server);
      },
      connect: async (serverId) => {
        assert.equal(remembered.length, servers.length);
        active += 1;
        peak = Math.max(peak, active);
        const connected = await releases[Number(serverId) - 1]?.promise;
        active -= 1;
        if (serverId === '5') throw new Error('fifth failed');
        return Boolean(connected);
      },
      concurrency: 4,
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(remembered.length, 7);
    assert.equal(active, 4);
    for (const release of releases) release.resolve(false);
    const summary = await initialization;
    assert.equal(peak, 4);
    assert.deepEqual(
      summary.errors.map((error) => error.server_id),
      ['1', '2', '4', '5', '6', '7']
    );
    assert.deepEqual(summary, {
      complete: true,
      total: 7,
      connected: 0,
      failed: 6,
      skipped: 1,
      errors: [
        { server_id: '1', serverIP: 'server-1.example', message: 'RCON initialization failed' },
        { server_id: '2', serverIP: 'server-2.example', message: 'RCON initialization failed' },
        { server_id: '4', serverIP: 'server-4.example', message: 'RCON initialization failed' },
        { server_id: '5', serverIP: 'server-5.example', message: 'fifth failed' },
        { server_id: '6', serverIP: 'server-6.example', message: 'RCON initialization failed' },
        { server_id: '7', serverIP: 'server-7.example', message: 'RCON initialization failed' },
      ],
    });
  });
});
