import net, { type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule } from './mock-module';

process.env.RCON_COMMAND_TIMEOUT_MS = '50';
const TEST_AUTH_TIMEOUT_MS = 50;

const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const ID_AUTH_FAILED = -1;

mockModule('../db.js', {
  better_sqlite_client: {
    prepare: () => ({
      all: () => [],
      get: () => undefined,
    }),
  },
});

mockModule('../utils/networkValidation.js', {
  isValidServerHostResolved: async () => true,
});

interface RconPacket {
  id: number;
  type: number;
  body: string;
}

interface FixtureOptions {
  password?: string;
  authDelayMs?: number;
  closeFirstCommand?: boolean;
  commandResponses?: Record<string, string>;
}

function encodePacket(type: number, id: number, body = ''): Buffer {
  const bodyBuffer = Buffer.from(body, 'ascii');
  const size = bodyBuffer.length + 10;
  const buffer = Buffer.alloc(size + 4);
  buffer.writeInt32LE(size, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  bodyBuffer.copy(buffer, 12);
  buffer.writeInt16LE(0, 12 + bodyBuffer.length);
  return buffer;
}

function decodePacket(buffer: Buffer): RconPacket {
  const size = buffer.readInt32LE(0);
  return {
    id: buffer.readInt32LE(4),
    type: buffer.readInt32LE(8),
    body: buffer.toString('ascii', 12, 4 + size - 2),
  };
}

class RconProtocolFixture {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private commandCount = 0;
  readonly commands: string[] = [];
  port = 0;

  constructor(private readonly options: FixtureOptions = {}) {
    this.server = net.createServer((socket) => this.handleSocket(socket));
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private handleSocket(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      pending = Buffer.concat([pending, chunkBuffer]);
      while (pending.length >= 4) {
        const size = pending.readInt32LE(0);
        const packetLength = size + 4;
        if (pending.length < packetLength) return;
        const packet = decodePacket(pending.subarray(0, packetLength));
        pending = pending.subarray(packetLength);
        this.handlePacket(socket, packet);
      }
    });
  }

  private handlePacket(socket: Socket, packet: RconPacket): void {
    if (packet.type === SERVERDATA_AUTH) {
      const sendAuthResponse = () => {
        this.writePacket(socket, encodePacket(SERVERDATA_RESPONSE_VALUE, packet.id));
        this.writePacket(
          socket,
          encodePacket(
            SERVERDATA_AUTH_RESPONSE,
            packet.body === (this.options.password ?? 'secret') ? packet.id : ID_AUTH_FAILED
          ),
          5
        );
      };
      if (this.options.authDelayMs) {
        setTimeout(sendAuthResponse, this.options.authDelayMs);
      } else {
        sendAuthResponse();
      }
      return;
    }

    if (packet.type !== SERVERDATA_EXECCOMMAND) return;

    this.commandCount += 1;
    this.commands.push(packet.body);
    if (this.options.closeFirstCommand && this.commandCount === 1) {
      socket.destroy();
      return;
    }

    const response = this.options.commandResponses?.[packet.body] ?? `${packet.body} ok`;
    this.writePacket(socket, encodePacket(SERVERDATA_RESPONSE_VALUE, packet.id, response));
  }

  private writePacket(socket: Socket, packet: Buffer, delayMs = 0): void {
    const write = () => {
      if (!socket.destroyed && socket.writable) socket.write(packet);
    };
    if (delayMs > 0) {
      setTimeout(write, delayMs);
    } else {
      write();
    }
  }
}

test('RconManager authenticates and executes against a local Source RCON protocol fixture', async () => {
  const fixture = new RconProtocolFixture({
    password: 'fixture-password',
    commandResponses: { status: 'fixture status' },
  });
  await fixture.start();
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'fixture-password');
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: '127.0.0.1',
      serverPort: fixture.port,
      rconPassword: 'fixture-password',
    });
    assert.equal(connected, true);

    const output = await manager.executeCommand('1', 'status');
    assert.equal(output, 'fixture status');
    assert.deepEqual(fixture.commands, ['status']);
  } finally {
    await manager.shutdownAll();
    await fixture.stop();
  }
});

test('RconManager reports protocol authentication rejection without creating a connection', async () => {
  const fixture = new RconProtocolFixture({ password: 'fixture-password' });
  await fixture.start();
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'wrong-password');
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: '127.0.0.1',
      serverPort: fixture.port,
      rconPassword: 'wrong-password',
    });

    assert.equal(connected, false);
    assert.equal(manager.hasConnection('1'), false);
  } finally {
    await manager.shutdownAll();
    await fixture.stop();
  }
});

test('RconManager times out delayed protocol auth and rejects probeServer', async () => {
  const fixture = new RconProtocolFixture({ password: 'fixture-password', authDelayMs: 200 });
  await fixture.start();
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'fixture-password', {
    authTimeoutMs: TEST_AUTH_TIMEOUT_MS,
  });
  try {
    await manager.readyPromise;
    await assert.rejects(
      () =>
        manager.probeServer({
          id: 1,
          serverIP: '127.0.0.1',
          serverPort: fixture.port,
          rconPassword: 'fixture-password',
        }),
      /RCON authentication failed/
    );
    assert.equal(manager.hasConnection('1'), false);
  } finally {
    await manager.shutdownAll();
    await fixture.stop();
  }
});

test('RconManager reconnects after a protocol socket closes during command execution', async () => {
  const fixture = new RconProtocolFixture({
    password: 'fixture-password',
    closeFirstCommand: true,
  });
  await fixture.start();
  const { RconManager } = await import('../modules/rcon');
  const manager = new RconManager(() => 'fixture-password');
  try {
    await manager.readyPromise;
    const connected = await manager.connectServer({
      id: 1,
      serverIP: '127.0.0.1',
      serverPort: fixture.port,
      rconPassword: 'fixture-password',
    });
    assert.equal(connected, true);

    await assert.rejects(() => manager.executeCommand('1', 'status'), /RCON command timed out/);

    const output = await manager.executeCommand('1', 'hostname');
    assert.equal(output, 'hostname ok');
    assert.deepEqual(fixture.commands, ['status', 'hostname']);
  } finally {
    await manager.shutdownAll();
    await fixture.stop();
  }
});
