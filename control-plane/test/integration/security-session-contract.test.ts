/** Real-SQLite authorization contract: administrators still need explicit grants. */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { after, before, test } from 'node:test';
import { request as httpRequest } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { createPanelApp } from '../../src/app/createApp';
import { runMigrations } from '../../src/infrastructure/sqlite/migrations';

let database: Database.Database;
let server: Server;

function request(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.once('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          })
        );
      }
    );
    req.once('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function sessionCookie(result: { headers: Record<string, string | string[] | undefined> }): string {
  const value = result.headers['set-cookie'];
  const cookie = Array.isArray(value) ? value[0] : value;
  assert.ok(cookie);
  return cookie.split(';', 1)[0] ?? '';
}

function csrfToken(result: { body: string }): string {
  const match = result.body.match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(match?.[1]);
  return match[1];
}

async function login(port: number): Promise<string> {
  const initial = await request(port, '/');
  const response = await request(port, '/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: sessionCookie(initial),
      'x-csrf-token': csrfToken(initial),
    },
    body: JSON.stringify({ username: 'admin', password: 'correct-horse-battery-staple' }),
  });
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

before(async () => {
  database = new Database(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  runMigrations(database);
  database
    .prepare('INSERT INTO users (id, username, password, is_admin) VALUES (?, ?, ?, 1)')
    .run(1, 'admin', bcrypt.hashSync('correct-horse-battery-staple', 10));
  database
    .prepare('INSERT INTO users (id, username, password, is_admin) VALUES (?, ?, ?, 0)')
    .run(2, 'owner', bcrypt.hashSync('owner-password-123', 10));
  database
    .prepare(
      'INSERT INTO servers (id, serverIP, serverPort, rconPassword, owner_id) VALUES (9, ?, ?, ?, 2)'
    )
    .run('203.0.113.8', 27015, 'password');
  database.prepare('INSERT INTO server_access (user_id, server_id) VALUES (2, 9)').run();
  const rcon = {
    getInitSummary: () => ({
      complete: true,
      total: 0,
      connected: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }),
  } as never;
  server = createPanelApp('test', process.cwd(), { db: database, redisClient: null, rcon }).listen(
    0,
    '127.0.0.1'
  );
  await new Promise<void>((resolve) => server.once('listening', resolve));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  database.close();
});

test('the relocated login view and generated browser assets are served', async () => {
  const port = (server.address() as AddressInfo).port;
  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.body, /<h2 class="auth-title">Operator login<\/h2>/);

  const asset = await request(port, '/3rr-mark.svg');
  assert.equal(asset.status, 200);
  assert.match(String(asset.headers['content-type']), /^image\/svg\+xml/);
});

test('an administrator without a server_access grant cannot inspect another user server', async () => {
  const response = await request((server.address() as AddressInfo).port, '/api/players/9', {
    headers: {
      accept: 'application/json',
      cookie: await login((server.address() as AddressInfo).port),
    },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), { error: 'Access denied to this server' });
});
