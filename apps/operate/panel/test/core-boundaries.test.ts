/** Direct guards for command, configuration, identifier, and RCON ownership boundaries. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { test } from 'node:test';
import Rcon from 'rcon-srcds';
import { RconSocketRegistry } from '../modules/rconSocketRegistry';
import {
  isRconCommandAllowed,
  sanitizeBackupFileName,
  sanitizeCfgName,
} from '../routes/game/gameCommandPolicy';
import { parseServerId } from '../utils/parseServerId';
import { mapsConfig } from '../utils/mapsConfig';

test('game command and file targets reject traversal, separators, and control commands', () => {
  for (const command of [
    'quit',
    'status; quit',
    'say hello\nquit',
    'sv_cheats 1',
    'rcon_password exposed',
    'sv_password exposed',
    'plugin load unsafe',
    'exec server.cfg',
    'host_writeconfig',
  ]) {
    assert.equal(isRconCommandAllowed(command), false, command);
  }
  assert.equal(isRconCommandAllowed('status'), true);

  for (const target of ['../server.cfg', 'dir/server.cfg', 'live;quit.cfg', '']) {
    assert.equal(sanitizeCfgName(target), null, target);
  }
  assert.equal(sanitizeCfgName('warmup.cfg'), 'warmup.cfg');
  assert.equal(sanitizeBackupFileName('../backup.txt'), null);
  assert.equal(sanitizeBackupFileName('backup.txt'), 'backup.txt');
});

test('server identifiers normalize only canonical positive safe integers', () => {
  for (const [input, expected] of [
    ['1', '1'],
    [' 42 ', '42'],
    [999999, '999999'],
  ] as Array<[unknown, string]>) {
    assert.equal(parseServerId(input), expected);
  }
  for (const input of ['0', '01', '1abc', '-1', '1.5', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseServerId(input), null, String(input));
  }
});

test('map configuration only executes safe, shipped cfg targets', () => {
  const cfgRoot = resolve(process.cwd(), 'cfg');
  const cfgTargets = Object.values(mapsConfig.gameTypes).flatMap((gameType) =>
    Object.values(gameType.gameModes).map((mode) => mode.exec)
  );
  for (const target of cfgTargets) {
    assert.equal(sanitizeCfgName(target), target);
    assert.match(target, /^[a-zA-Z0-9_.-]+\.cfg$/);
    assert.equal(existsSync(resolve(cfgRoot, target)), true, `missing shipped cfg: ${target}`);
  }
  for (const target of [
    'live.cfg',
    'knife.cfg',
    'random_rounds_on.cfg',
    'random_rounds_off.cfg',
    'rtd_on.cfg',
    'rtd_off.cfg',
  ]) {
    assert.equal(
      existsSync(resolve(cfgRoot, target)) ||
        existsSync(resolve(cfgRoot, 'server-provided', target)),
      true,
      `fixed route target is not shipped or explicitly server-provided: ${target}`
    );
  }
});

test('only the current RCON socket owns its server state', () => {
  const registry = new RconSocketRegistry(10, 10);
  const one = Object.assign(new EventEmitter(), {
    connection: new EventEmitter(),
    isConnected: () => true,
    isAuthenticated: () => true,
  }) as unknown as Rcon;
  const replacement = Object.assign(new EventEmitter(), {
    connection: new EventEmitter(),
    isConnected: () => true,
    isAuthenticated: () => true,
  }) as unknown as Rcon;
  const server = { id: 1, serverIP: '203.0.113.10', serverPort: 27015 };
  registry.store('1', server, { conn: one, resolvedHost: server.serverIP }, 0);
  registry.store('1', server, { conn: replacement, resolvedHost: server.serverIP }, 0);
  (one.connection as EventEmitter).emit('close');
  assert.equal(registry.isCurrent('1', replacement), true);
  (replacement.connection as EventEmitter).emit('close');
  assert.equal(registry.has('1'), false);
});

test('the real RCON client authenticates and executes over the local Source wire protocol', async () => {
  const sockets = new Set<Socket>();
  const commands: string[] = [];
  const encodePacket = (type: number, id: number, body = '') => {
    const payload = Buffer.from(body, 'ascii');
    const size = payload.length + 10;
    const packet = Buffer.alloc(size + 4);
    packet.writeInt32LE(size, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    payload.copy(packet, 12);
    packet.writeInt16LE(0, 12 + payload.length);
    return packet;
  };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      while (pending.length >= 4) {
        const packetLength = pending.readInt32LE(0) + 4;
        if (pending.length < packetLength) return;
        const packet = pending.subarray(0, packetLength);
        pending = pending.subarray(packetLength);
        const id = packet.readInt32LE(4);
        const type = packet.readInt32LE(8);
        const body = packet.toString('ascii', 12, packetLength - 2);
        if (type === 3) {
          socket.write(encodePacket(2, body === 'wire-password' ? id : -1));
        } else if (type === 2) {
          commands.push(body);
          socket.write(encodePacket(0, id, `${body} ok`));
        }
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as AddressInfo).port;
  const client = new Rcon({ host: '127.0.0.1', port, timeout: 1_000 });
  const rejected = new Rcon({ host: '127.0.0.1', port, timeout: 1_000 });
  try {
    await client.authenticate('wire-password');
    assert.equal(await client.execute('status'), 'status ok');
    await assert.rejects(rejected.authenticate('wrong-password'));
    assert.deepEqual(commands, ['status']);
  } finally {
    client.connection.destroy();
    rejected.connection.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
