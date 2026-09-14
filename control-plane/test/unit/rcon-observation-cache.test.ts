import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RconCancelledError } from '../../src/integrations/rcon/rconErrors';
import { RconObservationCache } from '../../src/integrations/rcon/rconObservationCache';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('RconObservationCache', () => {
  it('preserves observedAt for completed hits and refresh bypasses them', async () => {
    let calls = 0;
    const cache = new RconObservationCache(
      async (_serverId, command, _deadlineAt, _signal, markSent) => {
        calls += 1;
        markSent();
        return `${command}:${calls}`;
      },
      () => Date.now() + 1000
    );
    const first = await cache.observe('1', 'hostname');
    const warm = await cache.observe('1', 'hostname');
    assert.deepEqual(warm, first);
    const refreshed = await cache.observe('1', 'hostname', { refresh: true });
    assert.equal(refreshed.value, 'hostname:2');
    assert.equal(calls, 2);
  });

  it('expires completed values after the configured TTL', async () => {
    let calls = 0;
    const cache = new RconObservationCache(
      async (_serverId, _command, _deadlineAt, _signal, markSent) => {
        markSent();
        return String(++calls);
      },
      () => Date.now() + 1000,
      5
    );
    assert.equal((await cache.observe('1', 'hostname')).value, '1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await cache.observe('1', 'hostname')).value, '2');
  });

  it('joins an active refresh before returning the older completed value', async () => {
    const refresh = deferred<string>();
    let calls = 0;
    const cache = new RconObservationCache(
      async (_serverId, _command, _deadlineAt, _signal, markSent) => {
        calls += 1;
        markSent();
        return calls === 1 ? 'old' : refresh.promise;
      },
      () => Date.now() + 1000
    );
    await cache.observe('1', 'status');
    const explicit = cache.observe('1', 'status', { refresh: true });
    const ordinary = cache.observe('1', 'status');
    refresh.resolve('new');
    const observations = await Promise.all([explicit, ordinary]);
    assert.deepEqual(observations[0], observations[1]);
    assert.equal(observations[0].value, 'new');
    assert.equal(calls, 2);
  });

  it('cancels subscribers independently and aborts queued work after the last leaves', async () => {
    let sharedSignal: AbortSignal | undefined;
    const result = deferred<string>();
    const cache = new RconObservationCache(
      (_serverId, _command, _deadlineAt, signal, markSent) => {
        sharedSignal = signal;
        markSent();
        return result.promise;
      },
      () => Date.now() + 1000
    );
    const firstController = new AbortController();
    const first = cache.observe('1', 'users', { signal: firstController.signal });
    const second = cache.observe('1', 'users');
    firstController.abort();
    await assert.rejects(first, RconCancelledError);
    assert.equal(sharedSignal?.aborted, false);
    result.resolve('players');
    assert.equal((await second).value, 'players');

    let abandonedSignal: AbortSignal | undefined;
    const abandoned = new RconObservationCache(
      (_serverId, _command, _deadlineAt, signal) => {
        abandonedSignal = signal;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new RconCancelledError()), { once: true });
        });
      },
      () => Date.now() + 1000
    );
    const soleController = new AbortController();
    const sole = abandoned.observe('1', 'hostname', { signal: soleController.signal });
    soleController.abort();
    await assert.rejects(sole, RconCancelledError);
    assert.equal(abandonedSignal?.aborted, true);
  });

  it('does not let an invalidated older flight overwrite the new generation', async () => {
    const responses = [deferred<string>(), deferred<string>()];
    let calls = 0;
    const cache = new RconObservationCache(
      async (_serverId, _command, _deadlineAt, _signal, markSent) => {
        const response = responses[calls++];
        markSent();
        return response?.promise ?? '';
      },
      () => Date.now() + 1000
    );
    const oldFlight = cache.observe('1', 'status');
    cache.invalidateServer('1');
    const newFlight = cache.observe('1', 'status');
    responses[1]?.resolve('new');
    assert.equal((await newFlight).value, 'new');
    responses[0]?.resolve('old');
    assert.equal((await oldFlight).value, 'old');
    assert.equal((await cache.observe('1', 'status')).value, 'new');
    assert.equal(calls, 2);
  });

  it('aborts active flights and prevents repopulation when cleared', async () => {
    let signal: AbortSignal | undefined;
    const cache = new RconObservationCache(
      (_serverId, _command, _deadlineAt, executionSignal) => {
        signal = executionSignal;
        return new Promise<string>((_resolve, reject) => {
          executionSignal.addEventListener('abort', () => reject(new RconCancelledError()), {
            once: true,
          });
        });
      },
      () => Date.now() + 1000
    );
    cache.invalidateServer('1');
    const observation = cache.observe('1', 'hostname');
    cache.clear();
    await assert.rejects(observation, RconCancelledError);
    assert.equal(signal?.aborted, true);
  });
});
