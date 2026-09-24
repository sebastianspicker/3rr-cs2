/** Boots createPanelApp against a real temporary SQLite database for route contract tests. */
import Database from 'better-sqlite3';
import type { Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcrypt';
import { createPanelApp } from '../../../src/app/createApp';
import { runMigrations } from '../../../src/infrastructure/sqlite/migrations';
import { createFakeRconManager, type FakeRconManager } from './fakeRcon';

export interface TestApp {
  database: Database.Database;
  server: Server;
  port: number;
  rcon: FakeRconManager;
  close: () => Promise<void>;
}

export async function startTestApp(
  rconOverrides: Parameters<typeof createFakeRconManager>[0] = {}
): Promise<TestApp> {
  const database = new Database(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  runMigrations(database);
  const rcon = createFakeRconManager(rconOverrides);
  const server = createPanelApp('test', process.cwd(), {
    db: database,
    redisClient: null,
    rcon,
  }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    database,
    server,
    port,
    rcon,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    },
  };
}

export function insertUser(
  database: Database.Database,
  id: number,
  username: string,
  password: string,
  isAdmin: boolean
): void {
  database
    .prepare('INSERT INTO users (id, username, password, is_admin) VALUES (?, ?, ?, ?)')
    .run(id, username, bcrypt.hashSync(password, 10), isAdmin ? 1 : 0);
}

export function insertServer(
  database: Database.Database,
  id: number,
  ip: string,
  port: number,
  rconPassword: string,
  ownerId: number
): void {
  database
    .prepare(
      'INSERT INTO servers (id, serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, ip, port, rconPassword, ownerId);
}

export function grantAccess(database: Database.Database, userId: number, serverId: number): void {
  database
    .prepare('INSERT INTO server_access (user_id, server_id) VALUES (?, ?)')
    .run(userId, serverId);
}
