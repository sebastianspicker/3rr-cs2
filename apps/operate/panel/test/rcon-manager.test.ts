/** Lifecycle tests for serialized RCON commands, reconnects, and cleanup ownership. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { RconDisconnectResult } from '../modules/rcon';
import {
  deferAuthentication,
  rconFixture,
  resetRconFixture,
  settleWithin,
} from './rcon-manager-fixture';

afterEach(resetRconFixture);

async function waitForCondition(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail('condition was not met before the timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('executeCommand serializes commands per server', async () => {
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: '203.0.113.10',
      serverPort: 27015,
      rconPassword: 'test-password',
    });
    assert.equal(connected, true);

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
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', { commandTimeoutMs: 20 });
  try {
    await manager.readyPromise;
    assert.equal(
      await manager.connectServer({
        id: 1,
        serverIP: '203.0.113.10',
        serverPort: 27015,
        rconPassword: 'test-password',
      }),
      true
    );

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

test('removeServer clears stale state while a command is in flight and is idempotent', async () => {
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: '203.0.113.10',
      serverPort: 27015,
      rconPassword: 'test-password',
    });
    assert.equal(connected, true);

    const command = manager.executeCommand('1', 'status').then(
      () => assert.fail('command resolved after the server was removed'),
      (err: unknown) => {
        assert.match(
          err instanceof Error ? err.message : String(err),
          /removed|No valid connection/
        );
      }
    );
    const removed = await manager.removeServer('1');
    assert.equal(removed.closed, true);
    assert.equal(removed.state, 'closed');
    assert.equal(manager.hasConnection('1'), false);
    assert.equal(manager.getConnectionInfo('1'), null);
    await command;
    assert.equal(manager.hasConnection('1'), false);

    const repeated = await manager.removeServer('1');
    assert.equal(repeated.closed, true);
    assert.equal(repeated.state, 'absent');
  } finally {
    await manager.shutdownAll();
  }
});

test('removeServer waits for a pending authentication socket and prevents late promotion', async () => {
  deferAuthentication();
  rconFixture.socketClosesOnDestroy = false;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    authTimeoutMs: 200,
    forceDisconnectTimeoutMs: 100,
  });
  const server = {
    id: 1,
    serverIP: '203.0.113.10',
    serverPort: 27015,
    rconPassword: 'test-password',
  };
  let connecting: Promise<boolean> | undefined;
  let removing: Promise<RconDisconnectResult> | undefined;
  try {
    await manager.readyPromise;
    connecting = manager.connectServer(server);
    await waitForCondition(() => rconFixture.createdConnections.length === 1, 100);

    removing = manager.removeServer('1');
    assert.deepEqual(await settleWithin(removing, 10), { settled: false });
    assert.equal(await manager.connectServer(server), false);

    assert.ok(rconFixture.releaseAuthentication);
    rconFixture.releaseAuthentication();
    assert.equal(await connecting, false);
    assert.deepEqual(await settleWithin(removing, 10), { settled: false });

    rconFixture.socketClosesOnDestroy = true;
    rconFixture.createdConnections[0]?.connection.destroy();
    assert.deepEqual(await removing, { server_id: '1', state: 'closed', closed: true });
    assert.equal(manager.hasConnection('1'), false);
    assert.equal(manager.getConnectionInfo('1'), null);

    const shutdown = await manager.shutdownAll();
    assert.equal(shutdown.total, 0);
  } finally {
    rconFixture.releaseAuthentication?.();
    rconFixture.socketClosesOnDestroy = true;
    for (const connection of rconFixture.createdConnections) connection.connection.destroy();
    const pending: Promise<unknown>[] = [];
    if (connecting) pending.push(connecting);
    if (removing) pending.push(removing);
    await Promise.allSettled(pending);
    await manager.shutdownAll();
  }
});

test('shutdownAll reports unconfirmed cleanup instead of claiming every socket closed', async () => {
  rconFixture.socketClosesOnEnd = false;
  rconFixture.socketClosesOnDestroy = false;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    disconnectTimeoutMs: 10,
    forceDisconnectTimeoutMs: 10,
  });
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: '203.0.113.10',
      serverPort: 27015,
      rconPassword: 'test-password',
    });
    assert.equal(connected, true);

    const summary = await manager.shutdownAll();
    assert.equal(summary.total, 1);
    assert.equal(summary.closed, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.results[0]?.state, 'timeout');
    assert.equal(manager.hasConnection('1'), true);
  } finally {
    rconFixture.socketClosesOnEnd = true;
    rconFixture.socketClosesOnDestroy = true;
    await manager.shutdownAll();
  }
});

test('connectServer retains an unconfirmed socket instead of replacing it', async () => {
  rconFixture.socketClosesOnEnd = false;
  rconFixture.socketClosesOnDestroy = false;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    disconnectTimeoutMs: 10,
    forceDisconnectTimeoutMs: 10,
  });
  const server = {
    id: 1,
    serverIP: '203.0.113.10',
    serverPort: 27015,
    rconPassword: 'test-password',
  };
  try {
    await manager.readyPromise;
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
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    disconnectTimeoutMs: 10,
    forceDisconnectTimeoutMs: 50,
  });
  const server = {
    id: 1,
    serverIP: '203.0.113.10',
    serverPort: 27015,
    rconPassword: 'test-password',
  };
  try {
    await manager.readyPromise;
    assert.equal(await manager.connectServer(server), true);
    assert.equal(await manager.connectServer(server), true);
    assert.equal(rconFixture.createdHosts.length, 2);
    assert.equal(manager.hasConnection('1'), true);
  } finally {
    rconFixture.socketClosesOnEnd = true;
    await manager.shutdownAll();
  }
});

test('shutdownAll reports an authenticating socket whose destruction is unconfirmed', async () => {
  rconFixture.authenticateShouldHang = true;
  rconFixture.socketClosesOnDestroy = false;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    authTimeoutMs: 50,
    forceDisconnectTimeoutMs: 10,
  });
  const connecting = manager.connectServer({
    id: 1,
    serverIP: '203.0.113.10',
    serverPort: 27015,
    rconPassword: 'test-password',
  });
  try {
    await manager.readyPromise;
    await waitForCondition(() => rconFixture.createdHosts.length === 1, 100);

    const summary = await manager.shutdownAll();
    assert.equal(summary.total, 1);
    assert.equal(summary.closed, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.results[0]?.state, 'timeout');
  } finally {
    rconFixture.socketClosesOnDestroy = true;
    assert.equal(await connecting, false);
    await manager.shutdownAll();
  }
});

test('shutdownAll includes a confirmed authenticating-socket close in its summary', async () => {
  rconFixture.authenticateShouldHang = true;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    authTimeoutMs: 50,
    forceDisconnectTimeoutMs: 20,
  });
  const connecting = manager.connectServer({
    id: 1,
    serverIP: '203.0.113.10',
    serverPort: 27015,
    rconPassword: 'test-password',
  });
  try {
    await manager.readyPromise;
    await waitForCondition(() => rconFixture.createdHosts.length === 1, 100);

    const summary = await manager.shutdownAll();
    assert.equal(summary.total, 1);
    assert.equal(summary.closed, 1);
    assert.equal(summary.failed, 0);
    assert.equal(summary.results[0]?.state, 'closed');
  } finally {
    assert.equal(await connecting, false);
    await manager.shutdownAll();
  }
});

test('shutdownAll clears active state while queued commands are still settling', async () => {
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: '203.0.113.10',
      serverPort: 27015,
      rconPassword: 'test-password',
    });
    assert.equal(connected, true);

    const first = manager.executeCommand('1', 'status');
    const second = manager.executeCommand('1', 'hostname');
    const summary = await manager.shutdownAll();
    assert.equal(summary.failed, 0);
    assert.equal(manager.hasConnection('1'), false);

    const settled = await Promise.allSettled([first, second]);
    assert.equal(settled.length, 2);
    assert.equal(manager.hasConnection('1'), false);
  } finally {
    await manager.shutdownAll();
  }
});

test('heartbeat reconnect failure removes only the failing server connection', async () => {
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  const firstServer = {
    id: 1,
    serverIP: '203.0.113.10',
    serverPort: 27015,
    rconPassword: 'test-password',
  };
  const secondServer = {
    id: 2,
    serverIP: '203.0.113.11',
    serverPort: 27016,
    rconPassword: 'test-password',
  };
  try {
    await manager.readyPromise;
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
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    heartbeatIntervalMs: 20,
    maxHeartbeatIntervalMs: 40,
    heartbeatTimeoutMs: 100,
  });
  const server = {
    id: 1,
    serverIP: '203.0.113.10',
    serverPort: 27015,
    rconPassword: 'test-password',
  };
  try {
    await manager.readyPromise;
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
