import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mockModule } from './mock-module';

const TEST_AUTH_TIMEOUT_MS = 50;

let allowResolvedHost = true;
let createdHosts: string[] = [];
let concurrentExec = 0;
let maxConcurrentExec = 0;
let authenticateShouldFail = false;
let authenticateShouldHang = false;
let socketClosesOnEnd = true;
let commandsThatFail = new Set<string>();
let authFailuresByHost = new Set<string>();
let dbServers: Array<{ id: number; serverIP: string; serverPort: number }> = [];

type Settlement<T> =
  | { settled: true; status: 'fulfilled'; value: T }
  | { settled: true; status: 'rejected'; reason: unknown }
  | { settled: false };

class FakeSocket extends EventEmitter {
  writable = true;

  end(): void {
    this.writable = false;
    if (socketClosesOnEnd) {
      setImmediate(() => this.emit('close'));
    }
  }

  destroy(): void {
    this.writable = false;
    setImmediate(() => this.emit('close'));
  }
}

class FakeRcon {
  connection = new FakeSocket();
  private connected = true;
  private authenticated = false;
  private host: string;

  constructor(options: { host: string }) {
    this.host = options.host;
    createdHosts.push(options.host);
  }

  async authenticate(): Promise<void> {
    if (authenticateShouldFail || authFailuresByHost.has(this.host)) throw new Error('auth failed');
    if (authenticateShouldHang) return new Promise(() => undefined);
    this.authenticated = true;
  }

  async execute(command: string): Promise<string> {
    if (commandsThatFail.has(command)) throw new Error(`command failed: ${command}`);
    concurrentExec += 1;
    maxConcurrentExec = Math.max(maxConcurrentExec, concurrentExec);
    await new Promise((resolve) => setTimeout(resolve, command === 'status' ? 25 : 10));
    concurrentExec -= 1;
    return `${command} ok`;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }
}

mockModule('rcon-srcds', { default: FakeRcon });

mockModule('../db.js', {
  better_sqlite_client: {
    prepare: () => ({
      all: () => dbServers,
      get: () => undefined,
    }),
  },
});

mockModule('../utils/networkValidation.js', {
  isValidServerHostResolved: async () => allowResolvedHost,
});

afterEach(() => {
  allowResolvedHost = true;
  createdHosts = [];
  concurrentExec = 0;
  maxConcurrentExec = 0;
  authenticateShouldFail = false;
  authenticateShouldHang = false;
  socketClosesOnEnd = true;
  commandsThatFail = new Set<string>();
  authFailuresByHost = new Set<string>();
  dbServers = [];
});

test('init summary reports partial saved-server RCON startup failure', async () => {
  dbServers = [
    { id: 1, serverIP: '203.0.113.10', serverPort: 27015 },
    { id: 2, serverIP: '203.0.113.11', serverPort: 27016 },
  ];
  authFailuresByHost = new Set(['203.0.113.11']);
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
  dbServers = [
    { id: 1, serverIP: '203.0.113.20', serverPort: 27015 },
    { id: 2, serverIP: '203.0.113.21', serverPort: 27016 },
  ];
  authFailuresByHost = new Set(['203.0.113.20', '203.0.113.21']);
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
  dbServers = [{ id: 1, serverIP: '203.0.113.30', serverPort: 27015 }];
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
    assert.equal(createdHosts.length, 0);
  } finally {
    delete process.env.RCON_SECRET_KEY;
    _resetCachedKey();
    await manager.shutdownAll();
  }
});

async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<Settlement<T>> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(
        (value): Settlement<T> => ({ settled: true, status: 'fulfilled', value }),
        (reason: unknown): Settlement<T> => ({ settled: true, status: 'rejected', reason })
      ),
      new Promise<Settlement<T>>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ settled: false }), ms);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

test('connectServer revalidates resolved hosts before opening a socket', async () => {
  allowResolvedHost = false;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: 'blocked.example',
      serverPort: 27015,
      rconPassword: 'test-password',
    });
    assert.equal(connected, false);
    assert.equal(createdHosts.length, 0);
  } finally {
    await manager.shutdownAll();
  }
});

test('connectServer returns false when authentication fails', async () => {
  authenticateShouldFail = true;
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
    assert.equal(connected, false);
    assert.equal(manager.hasConnection('1'), false);
    assert.equal(createdHosts.length, 1);
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
    if (result.status !== 'rejected') {
      assert.fail('connectServer resolved instead of surfacing local decrypt failure');
    }
    assert.ok(result.reason instanceof RconSecretDecryptError);
    assert.equal(result.reason.kind, 'invalid_format');
    assert.equal(manager.hasConnection('1'), false);
    assert.equal(createdHosts.length, 0);
  } finally {
    delete process.env.RCON_SECRET_KEY;
    _resetCachedKey();
    await manager.shutdownAll();
  }
});

test('connectServer and probeServer settle when authentication never resolves', async () => {
  authenticateShouldHang = true;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password', {
    authTimeoutMs: TEST_AUTH_TIMEOUT_MS,
  });
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
    assert.equal(maxConcurrentExec, 1);
  } finally {
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

test('shutdownAll reports unconfirmed cleanup instead of claiming every socket closed', async () => {
  socketClosesOnEnd = false;
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

    const summary = await manager.shutdownAll();
    assert.equal(summary.total, 1);
    assert.equal(summary.closed, 0);
    assert.equal(summary.failed, 1);
    assert.equal(summary.results[0]?.state, 'timeout');
    assert.equal(manager.hasConnection('1'), false);
  } finally {
    socketClosesOnEnd = true;
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

    commandsThatFail.add('status');
    authenticateShouldFail = true;
    await manager.sendHeartbeat('1', firstServer);

    assert.equal(manager.hasConnection('1'), false);
    assert.equal(manager.getConnectionInfo('1'), null);
    assert.equal(manager.hasConnection('2'), true);
    assert.equal(manager.getConnectionInfo('2')?.authenticated, true);
  } finally {
    await manager.shutdownAll();
  }
});
