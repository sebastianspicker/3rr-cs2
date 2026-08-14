/** Connection setup tests; fixture mocks load before RconManager. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { rconFixture, resetRconFixture, settleWithin } from './support/rcon-manager-fixture';

const TEST_AUTH_TIMEOUT_MS = 50;

afterEach(resetRconFixture);

test('init summary reports partial saved-server RCON startup failure', async () => {
  rconFixture.dbServers = [
    { id: 1, serverIP: '203.0.113.10', serverPort: 27015 },
    { id: 2, serverIP: '203.0.113.11', serverPort: 27016 },
  ];
  rconFixture.authFailuresByHost = new Set(['203.0.113.11']);
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    const summary = manager.getInitSummary();
    assert.equal(summary.complete, true);
    assert.equal(summary.total, 2);
    assert.equal(summary.connected, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.errors.length, 1);
    assert.equal(summary.errors[0]?.server_id, '2');
    assert.match(summary.errors[0]?.message ?? '', /initialization failed/i);
  } finally {
    await manager.shutdownAll();
  }
});

test('init summary reports total saved-server RCON startup failure', async () => {
  rconFixture.dbServers = [
    { id: 1, serverIP: '203.0.113.20', serverPort: 27015 },
    { id: 2, serverIP: '203.0.113.21', serverPort: 27016 },
  ];
  rconFixture.authFailuresByHost = new Set(['203.0.113.20', '203.0.113.21']);
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    const summary = manager.getInitSummary();
    assert.equal(summary.complete, true);
    assert.equal(summary.total, 2);
    assert.equal(summary.connected, 0);
    assert.equal(summary.failed, 2);
    assert.equal(summary.errors.length, 2);
    assert.deepEqual(summary.errors.map((err) => err.server_id).sort(), ['1', '2']);
  } finally {
    await manager.shutdownAll();
  }
});

test('init summary reports stored credential decrypt failure separately from RCON auth failure', async () => {
  process.env.RCON_SECRET_KEY = Buffer.alloc(32, 8).toString('base64');
  const { _resetCachedKey } = await import('../utils/rconSecret');
  _resetCachedKey();
  rconFixture.dbServers = [{ id: 1, serverIP: '203.0.113.30', serverPort: 27015 }];
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'enc:v1:not-enough');
  try {
    await manager.readyPromise;
    const summary = manager.getInitSummary();
    assert.equal(summary.complete, true);
    assert.equal(summary.total, 1);
    assert.equal(summary.connected, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.errors[0]?.server_id, '1');
    assert.match(summary.errors[0]?.message ?? '', /Invalid encrypted RCON password format/);
    assert.doesNotMatch(summary.errors[0]?.message ?? '', /authentication failed/i);
    assert.equal(rconFixture.createdHosts.length, 0);
  } finally {
    delete process.env.RCON_SECRET_KEY;
    _resetCachedKey();
    await manager.shutdownAll();
  }
});

test('connectServer rejects a blocked resolved host before opening a socket', async () => {
  rconFixture.allowResolvedHost = false;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    assert.equal(
      await manager.connectServer({
        id: 1,
        serverIP: 'blocked.example',
        serverPort: 27015,
        rconPassword: 'test-password',
      }),
      false
    );
    assert.equal(rconFixture.createdHosts.length, 0);
  } finally {
    await manager.shutdownAll();
  }
});

test('connectServer pins the validated DNS address instead of reconnecting by hostname', async () => {
  rconFixture.resolvedHost = '203.0.113.77';
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
    assert.deepEqual(rconFixture.createdHosts, ['203.0.113.77']);
    assert.equal(manager.getConnectionInfo('1')?.host, '203.0.113.77');
  } finally {
    await manager.shutdownAll();
  }
});

test('connectServer returns false when authentication fails', async () => {
  rconFixture.authenticateShouldFail = true;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    assert.equal(
      await manager.connectServer({
        id: 1,
        serverIP: '203.0.113.10',
        serverPort: 27015,
        rconPassword: 'test-password',
      }),
      false
    );
    assert.equal(manager.hasConnection('1'), false);
    assert.equal(rconFixture.createdHosts.length, 1);
  } finally {
    await manager.shutdownAll();
  }
});

test('connectServer rejects local decrypt failure without opening an RCON socket', async () => {
  process.env.RCON_SECRET_KEY = Buffer.alloc(32, 9).toString('base64');
  const { _resetCachedKey, RconSecretDecryptError } = await import('../utils/rconSecret');
  _resetCachedKey();
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'enc:v1:not-enough');
  try {
    await manager.readyPromise;
    const result = await settleWithin(
      manager.connectServer({
        id: 1,
        serverIP: '203.0.113.10',
        serverPort: 27015,
        rconPassword: 'unused-route-password',
      }),
      500
    );
    if (!result.settled) assert.fail('connectServer did not settle after decrypt failure');
    if (result.status !== 'rejected')
      assert.fail('connectServer resolved instead of surfacing local decrypt failure');
    assert.ok(result.reason instanceof RconSecretDecryptError);
    assert.equal(result.reason.kind, 'invalid_format');
    assert.equal(manager.hasConnection('1'), false);
    assert.equal(rconFixture.createdHosts.length, 0);
  } finally {
    delete process.env.RCON_SECRET_KEY;
    _resetCachedKey();
    await manager.shutdownAll();
  }
});

test('connectServer and probeServer settle when authentication never resolves', async () => {
  rconFixture.authenticateShouldHang = true;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', { authTimeoutMs: TEST_AUTH_TIMEOUT_MS });
  try {
    await manager.readyPromise;
    const connected = await settleWithin(
      manager.connectServer({
        id: 1,
        serverIP: '203.0.113.10',
        serverPort: 27015,
        rconPassword: 'test-password',
      }),
      500
    );
    if (!connected.settled) assert.fail('connectServer did not settle within auth timeout');
    if (connected.status !== 'fulfilled')
      assert.fail('connectServer rejected instead of returning false');
    assert.equal(connected.value, false);
    assert.equal(manager.hasConnection('1'), false);
    const probed = await settleWithin(
      manager.probeServer({
        id: 2,
        serverIP: '203.0.113.11',
        serverPort: 27015,
        rconPassword: 'test-password',
      }),
      500
    );
    if (!probed.settled) assert.fail('probeServer did not settle within auth timeout');
    if (probed.status !== 'rejected') assert.fail('probeServer resolved instead of rejecting');
    assert.match(
      probed.reason instanceof Error ? probed.reason.message : '',
      /authentication failed/i
    );
  } finally {
    await manager.shutdownAll();
  }
});
