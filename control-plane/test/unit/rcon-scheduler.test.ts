import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RconCancelledError,
  RconDeadlineError,
  RconOverloadError,
} from '../../src/integrations/rcon/rconErrors';
import { RconScheduler } from '../../src/integrations/rcon/rconScheduler';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('RconScheduler', () => {
  it('runs one task per server and preserves FIFO order', async () => {
    const scheduler = new RconScheduler({ maxQueuedPerServer: 32, maxQueuedGlobal: 256 });
    const first = deferred<void>();
    const order: string[] = [];
    const one = scheduler.schedule('1', 'mutation', Date.now() + 1000, undefined, async () => {
      order.push('one:start');
      await first.promise;
      order.push('one:end');
      return 1;
    });
    const two = scheduler.schedule('1', 'mutation', Date.now() + 1000, undefined, async () => {
      order.push('two');
      return 2;
    });
    const three = scheduler.schedule('1', 'observation', Date.now() + 1000, undefined, async () => {
      order.push('three');
      return 3;
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ['one:start']);
    first.resolve();
    assert.deepEqual(await Promise.all([one, two, three]), [1, 2, 3]);
    assert.deepEqual(order, ['one:start', 'one:end', 'two', 'three']);
  });

  it('enforces per-server and global waiting caps', async () => {
    const perServer = new RconScheduler({ maxQueuedPerServer: 1, maxQueuedGlobal: 10 });
    const held = deferred<void>();
    const active = perServer.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      undefined,
      () => held.promise
    );
    const waiting = perServer.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      undefined,
      async () => undefined
    );
    await assert.rejects(
      perServer.schedule('1', 'mutation', Date.now() + 1000, undefined, async () => undefined),
      RconOverloadError
    );
    held.resolve();
    await Promise.all([active, waiting]);

    const global = new RconScheduler({ maxQueuedPerServer: 4, maxQueuedGlobal: 1 });
    const heldOne = deferred<void>();
    const heldTwo = deferred<void>();
    const activeOne = global.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      undefined,
      () => heldOne.promise
    );
    const activeTwo = global.schedule(
      '2',
      'mutation',
      Date.now() + 1000,
      undefined,
      () => heldTwo.promise
    );
    const globallyWaiting = global.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      undefined,
      async () => undefined
    );
    await assert.rejects(
      global.schedule('2', 'mutation', Date.now() + 1000, undefined, async () => undefined),
      RconOverloadError
    );
    heldOne.resolve();
    heldTwo.resolve();
    await Promise.all([activeOne, activeTwo, globallyWaiting]);
  });

  it('reserves and coalesces one heartbeat while ordinary capacity is full', async () => {
    const scheduler = new RconScheduler({ maxQueuedPerServer: 1, maxQueuedGlobal: 1 });
    const held = deferred<void>();
    const active = scheduler.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      undefined,
      () => held.promise
    );
    const ordinary = scheduler.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      undefined,
      async () => undefined
    );
    let heartbeatRuns = 0;
    const heartbeat = scheduler.schedule(
      '1',
      'heartbeat',
      Date.now() + 1000,
      undefined,
      async () => {
        heartbeatRuns += 1;
      }
    );
    const coalesced = scheduler.schedule(
      '1',
      'heartbeat',
      Date.now() + 1000,
      undefined,
      async () => {
        heartbeatRuns += 100;
      }
    );
    assert.equal(heartbeat, coalesced);
    held.resolve();
    await Promise.all([active, ordinary, heartbeat]);
    assert.equal(heartbeatRuns, 1);
  });

  it('removes cancelled and expired work before dispatch and cancels waiting work on shutdown', async () => {
    const scheduler = new RconScheduler({ maxQueuedPerServer: 4, maxQueuedGlobal: 4 });
    const held = deferred<void>();
    const active = scheduler.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      undefined,
      () => held.promise
    );
    const controller = new AbortController();
    let dispatched = 0;
    const cancelled = scheduler.schedule(
      '1',
      'mutation',
      Date.now() + 1000,
      controller.signal,
      async () => {
        dispatched += 1;
      }
    );
    const expired = scheduler.schedule('1', 'mutation', Date.now() + 10, undefined, async () => {
      dispatched += 1;
    });
    const shutdown = scheduler.schedule('1', 'mutation', Date.now() + 1000, undefined, async () => {
      dispatched += 1;
    });
    controller.abort();
    await assert.rejects(cancelled, RconCancelledError);
    await assert.rejects(expired, RconDeadlineError);
    scheduler.shutdown();
    await assert.rejects(shutdown, RconCancelledError);
    held.resolve();
    await active;
    assert.equal(dispatched, 0);
  });
});
