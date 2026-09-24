import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { rconScenario, resetRconScenario } from './support/rcon-manager';
import {
  RconCancelledError,
  RconDeadlineError,
  RconExecutionError,
} from '../../src/integrations/rcon/rconErrors';
import { waitBeforeSend } from '../../src/integrations/rcon/rconConnection';
import { RconHeartbeatSupervisor } from '../../src/integrations/rcon/rconHeartbeat';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createManager = async (options: Record<string, number> = {}) => {
  const { RconManager } = await import('../../src/integrations/rcon/rcon');
  const manager = new RconManager(
    { getRconPassword: () => 'test-password', listRconServers: () => [] },
    options
  );
  await manager.readyPromise;
  await manager.connectServer({
    id: 1,
    serverIP: 'server.example',
    serverPort: 27015,
    rconPassword: 'test-password',
  });
  return manager;
};

afterEach(resetRconScenario);

describe('RconManager scheduling', () => {
  it('drains an already-started operation when cancellation wins before waiting', async () => {
    const lateFailure = new Promise<never>((_resolve, reject) => {
      setImmediate(() => reject(new Error('late failure')));
    });
    await assert.rejects(waitBeforeSend(lateFailure, Date.now() - 1), RconDeadlineError);
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('rejects invalid scheduler and startup manager options', async () => {
    const { RconManager } = await import('../../src/integrations/rcon/rcon');
    const store = { getRconPassword: () => 'test-password', listRconServers: () => [] };
    for (const name of [
      'totalDeadlineMs',
      'maxQueuedPerServer',
      'maxQueuedGlobal',
      'startupConcurrency',
    ] as const) {
      for (const value of [0, -1, 1.5, Number.POSITIVE_INFINITY, 2_147_483_648]) {
        assert.throws(() => new RconManager(store, { [name]: value }), new RegExp(name));
      }
    }
  });

  it('uses one default absolute deadline and never dispatches an already expired command', async () => {
    const manager = await createManager({ totalDeadlineMs: 3210 });
    try {
      const remaining = manager.createDeadline() - Date.now();
      assert.ok(remaining <= 3210 && remaining >= 3200);
      await assert.rejects(
        manager.executeCommand('1', 'status', { deadlineAt: Date.now() - 1 }),
        (error: unknown) =>
          error instanceof RconDeadlineError &&
          error.statusCode === 504 &&
          error.outcome === 'not_sent'
      );
      assert.deepEqual(rconScenario.executeCalls, []);
    } finally {
      await manager.shutdownAll();
    }
  });

  it('does not retransmit a sent command failure and marks its outcome unknown', async () => {
    rconScenario.execute = async () => {
      throw new Error('wire failed');
    };
    const manager = await createManager();
    try {
      await assert.rejects(
        manager.executeCommand('1', 'mp_restartgame 1'),
        (error: unknown) =>
          error instanceof RconExecutionError &&
          error.outcome === 'unknown' &&
          error.message === 'wire failed'
      );
      assert.deepEqual(rconScenario.executeCalls, ['mp_restartgame 1']);
    } finally {
      await manager.shutdownAll();
    }
  });

  it('marks a wire deadline unknown and never retransmits the command', async () => {
    rconScenario.execute = () => new Promise<string>(() => undefined);
    const manager = await createManager({ commandTimeoutMs: 15 });
    try {
      await assert.rejects(
        manager.executeCommand('1', 'status', { deadlineAt: Date.now() + 15 }),
        (error: unknown) =>
          error instanceof RconDeadlineError &&
          error.statusCode === 504 &&
          error.outcome === 'unknown'
      );
      assert.deepEqual(rconScenario.executeCalls, ['status']);
    } finally {
      await manager.shutdownAll();
    }
  });

  it('reconnects a lost socket once before dispatch', async () => {
    const manager = await createManager();
    try {
      const current = manager.getConnectionInfo('1');
      assert.equal(current?.connected, true);
      rconScenario.execute = async (command) => `${command}:ok`;
      await manager.disconnectRcon('1');
      assert.equal(await manager.executeCommand('1', 'status'), 'status:ok');
      assert.equal(rconScenario.createdHosts.length, 2);
      assert.deepEqual(rconScenario.executeCalls, ['status']);
    } finally {
      await manager.shutdownAll();
    }
  });

  it('keeps heartbeat recovery inside its total deadline and defers an expired reconnect', async () => {
    const manager = await createManager({ totalDeadlineMs: 10, heartbeatTimeoutMs: 100 });
    rconScenario.execute = async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      throw new Error('heartbeat wire failed');
    };
    try {
      const started = Date.now();
      await manager.sendHeartbeat('1', {
        id: 1,
        serverIP: 'server.example',
        serverPort: 27015,
      });
      assert.ok(Date.now() - started < 50);
      assert.equal(rconScenario.createdHosts.length, 1);
    } finally {
      await manager.shutdownAll();
    }
  });

  it('keeps exactly one future heartbeat timer across an expired retry and recovery', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const timeouts = new Set<object>();
    const intervals = new Set<object>();
    globalThis.setTimeout = ((_callback: () => void) => {
      const handle = {};
      timeouts.add(handle);
      return handle;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((handle: object) => {
      timeouts.delete(handle);
    }) as unknown as typeof clearTimeout;
    globalThis.setInterval = ((_callback: () => void) => {
      const handle = {};
      intervals.add(handle);
      return handle;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = ((handle: object) => {
      intervals.delete(handle);
    }) as unknown as typeof clearInterval;

    const details = {
      host: '203.0.113.77',
      port: 27015,
      connected: true,
      authenticated: true,
      heartbeatFailures: 0,
      heartbeatInterval: undefined as ReturnType<typeof setInterval> | undefined,
    };
    let wireFails = true;
    const connection = {
      connection: { writable: true },
      execute: async () => {
        if (wireFails) throw new Error('heartbeat wire failed');
        return 'ok';
      },
    };
    const supervisor = new RconHeartbeatSupervisor(
      {
        getDetails: () => details,
        get: () => connection,
        stopAllHeartbeatIntervals: () => {
          if (details.heartbeatInterval) clearInterval(details.heartbeatInterval);
        },
      } as never,
      {
        heartbeat: async (
          _serverId: string,
          deadlineAt: number,
          run: (context: never) => Promise<void>
        ) =>
          run({
            deadlineAt,
            signal: undefined,
            markSent: () => undefined,
            wasSent: () => false,
            throwIfUnavailable: () => undefined,
          } as never),
      } as never,
      {
        intervalMs: 100,
        maxIntervalMs: 1_000,
        timeoutMs: 100,
        isRemoved: () => false,
        isShuttingDown: () => false,
        createDeadline: () => Date.now() - 1,
        reconnect: async () => false,
      }
    );
    try {
      supervisor.start('1', { id: 1, serverIP: 'server.example', serverPort: 27015 });
      assert.equal(intervals.size, 1);
      assert.equal(timeouts.size, 0);

      await supervisor.send(
        '1',
        { id: 1, serverIP: 'server.example', serverPort: 27015 },
        Date.now() - 1
      );
      assert.equal(intervals.size, 0);
      assert.equal(timeouts.size, 1);

      wireFails = false;
      await supervisor.send(
        '1',
        { id: 1, serverIP: 'server.example', serverPort: 27015 },
        Date.now() + 1_000
      );
      assert.equal(intervals.size, 1);
      assert.equal(timeouts.size, 0);
    } finally {
      supervisor.stopAll();
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  it('invalidates observations after a mutation while preserving warm observedAt', async () => {
    let hostname = 'first';
    rconScenario.execute = async (command) => (command === 'hostname' ? hostname : 'ok');
    const manager = await createManager();
    try {
      const cold = await manager.observeCommand('1', 'hostname');
      const warm = await manager.observeCommand('1', 'hostname');
      assert.deepEqual(warm, cold);
      hostname = 'second';
      await manager.executeCommand('1', 'hostname changed');
      const afterMutation = await manager.observeCommand('1', 'hostname');
      assert.equal(afterMutation.value, 'second');
      assert.deepEqual(rconScenario.executeCalls, ['hostname', 'hostname changed', 'hostname']);
    } finally {
      await manager.shutdownAll();
    }
  });

  it('cancels queued commands on removal without sending them', async () => {
    const firstResponse = deferred<string>();
    rconScenario.execute = async (command) =>
      command === 'first' ? firstResponse.promise : `${command}:unexpected`;
    const manager = await createManager();
    const first = manager.executeCommand('1', 'first');
    const second = manager.executeCommand('1', 'second');
    const secondRejected = assert.rejects(
      second,
      (error: unknown) => error instanceof RconCancelledError && error.outcome === 'not_sent'
    );
    try {
      await new Promise((resolve) => setImmediate(resolve));
      await manager.removeServer('1');
      await secondRejected;
      assert.deepEqual(rconScenario.executeCalls, ['first']);
      firstResponse.resolve('first:ok');
      assert.equal(await first, 'first:ok');
    } finally {
      firstResponse.resolve('first:ok');
      await manager.shutdownAll();
    }
  });

  it('cancels queued commands on shutdown without sending them', async () => {
    const firstResponse = deferred<string>();
    rconScenario.execute = async () => firstResponse.promise;
    const manager = await createManager();
    const first = manager.executeCommand('1', 'first');
    const second = manager.executeCommand('1', 'second');
    const secondRejected = assert.rejects(second, RconCancelledError);
    await new Promise((resolve) => setImmediate(resolve));
    await manager.shutdownAll();
    await secondRejected;
    assert.deepEqual(rconScenario.executeCalls, ['first']);
    firstResponse.resolve('first:ok');
    assert.equal(await first, 'first:ok');
  });
});
