import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';

let allowResolvedHost = true;
let createdHosts: string[] = [];
let concurrentExec = 0;
let maxConcurrentExec = 0;

class FakeSocket {
  writable = true;

  once(_event: string, _handler: () => void): this {
    return this;
  }

  end(): void {
    this.writable = false;
  }

  destroy(): void {
    this.writable = false;
  }
}

class FakeRcon {
  connection = new FakeSocket();
  private connected = true;
  private authenticated = false;

  constructor(options: { host: string }) {
    createdHosts.push(options.host);
  }

  async authenticate(): Promise<void> {
    this.authenticated = true;
  }

  async execute(command: string): Promise<string> {
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

mock.module('rcon-srcds', {
  defaultExport: FakeRcon,
});

mock.module('../db.js', {
  namedExports: {
    better_sqlite_client: {
      prepare: () => ({
        all: () => [],
        get: () => undefined,
      }),
    },
  },
});

mock.module('../utils/networkValidation.js', {
  namedExports: {
    isValidServerHostResolved: async () => allowResolvedHost,
  },
});

afterEach(() => {
  allowResolvedHost = true;
  createdHosts = [];
  concurrentExec = 0;
  maxConcurrentExec = 0;
});

test('connectServer revalidates resolved hosts before opening a socket', async () => {
  allowResolvedHost = false;
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    await manager.connectServer({
      id: 1,
      serverIP: 'blocked.example',
      serverPort: 27015,
      rconPassword: 'test-password',
    });
    assert.equal(createdHosts.length, 0);
  } finally {
    await manager.shutdownAll();
  }
});

test('executeCommand serializes commands per server', async () => {
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'test-password');
  try {
    await manager.readyPromise;
    await manager.connectServer({
      id: 1,
      serverIP: '203.0.113.10',
      serverPort: 27015,
      rconPassword: 'test-password',
    });

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
