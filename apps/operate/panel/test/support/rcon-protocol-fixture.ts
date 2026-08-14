/** Local Source RCON protocol server used for manager timeout and ordering tests. */
import net, { type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const ID_AUTH_FAILED = -1;

interface RconPacket {
  id: number;
  type: number;
  body: string;
}

export interface RconProtocolFixtureOptions {
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

export class RconProtocolFixture {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private commandCount = 0;
  readonly commands: string[] = [];
  port = 0;

  constructor(private readonly options: RconProtocolFixtureOptions = {}) {
    this.server = net.createServer((socket) => this.handleSocket(socket));
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    this.port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
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
      if (this.options.authDelayMs) setTimeout(sendAuthResponse, this.options.authDelayMs);
      else sendAuthResponse();
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
    if (delayMs > 0) setTimeout(write, delayMs);
    else write();
  }
}
