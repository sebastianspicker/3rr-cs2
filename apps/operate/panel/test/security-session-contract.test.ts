/** Compact in-process contract for the panel's session, CSRF, and ownership boundaries. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { request as httpRequest } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import { mockModule } from './support/mock-module';

let app: Express;
let server: Server;
const users: Array<{ id: number; username: string; password: string; is_admin: number }> = [];

const database = {
  prepare: (sql: string) => ({
    get: (...values: unknown[]) => {
      if (sql.includes('FROM users WHERE username'))
        return users.find((user) => user.username === values[0]);
      if (sql.includes('FROM users') && sql.includes('WHERE id = ?'))
        return users.find((user) => user.id === values[0]);
      return undefined;
    },
    all: () => [],
    run: () => ({ changes: 0 }),
  }),
  transaction: <T>(operation: (...values: never[]) => T) => operation,
};

type HttpResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function request(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<HttpResult> {
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

function cookie(result: HttpResult): string {
  const setCookie = result.headers['set-cookie'];
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(value, 'response must set a session cookie');
  return value.split(';', 1)[0] ?? '';
}

function csrf(result: HttpResult): string {
  const match = result.body.match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(match?.[1], 'page must include a CSRF token');
  return match[1];
}

async function login(
  port: number,
  username: string,
  password: string
): Promise<{ session: string; csrfToken: string }> {
  const initial = await request(port, '/');
  const initialCookie = cookie(initial);
  const initialCsrf = csrf(initial);
  const response = await request(port, '/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: initialCookie,
      'x-csrf-token': initialCsrf,
    },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const session = cookie(response);
  assert.notEqual(session, initialCookie, 'login must rotate the session identifier');
  const page = await request(port, '/servers', { headers: { cookie: session } });
  return { session, csrfToken: csrf(page) };
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret';
  users.push(
    {
      id: 1,
      username: 'admin',
      password: bcrypt.hashSync('correct-horse-battery-staple', 10),
      is_admin: 1,
    },
    {
      id: 2,
      username: 'operator',
      password: bcrypt.hashSync('operator-password-123', 10),
      is_admin: 0,
    }
  );
  mockModule(require.resolve('../db'), { better_sqlite_client: database });
  ({ default: app } = await import('../app'));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('session security rejects unsafe requests and denies cross-user mutations', async () => {
  const port = (server.address() as AddressInfo).port;
  const initial = await request(port, '/');
  const missingCsrf = await request(port, '/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: cookie(initial),
    },
    body: JSON.stringify({ username: 'admin', password: 'wrong-password-123' }),
  });
  assert.equal(
    missingCsrf.status,
    403,
    'login without a CSRF-bound session fails before credential handling'
  );
  const invalid = await request(port, '/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: cookie(initial),
      'x-csrf-token': csrf(initial),
    },
    body: JSON.stringify({ username: 'admin', password: 'wrong-password-123' }),
  });
  assert.equal(invalid.status, 401);
  assert.deepEqual(JSON.parse(invalid.body), { error: 'Invalid credentials' });

  const admin = await login(port, 'admin', 'correct-horse-battery-staple');
  assert.match(admin.csrfToken, /^[a-f0-9]{64}$/);
  for (const suppliedToken of [undefined, '0'.repeat(64)]) {
    const rejected = await request(port, '/api/users/delete', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: admin.session,
        ...(suppliedToken ? { 'x-csrf-token': suppliedToken } : {}),
      },
      body: JSON.stringify({ userId: 2 }),
    });
    assert.equal(rejected.status, 403, 'unsafe request requires its session CSRF token');
  }

  const operator = await login(port, 'operator', 'operator-password-123');
  const userMutation = await request(port, '/api/users/delete', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: operator.session,
      'x-csrf-token': operator.csrfToken,
    },
    body: JSON.stringify({ userId: 1 }),
  });
  assert.equal(userMutation.status, 403, 'non-admin cannot mutate another user');
  const serverMutation = await request(port, '/api/delete-server', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: operator.session,
      'x-csrf-token': operator.csrfToken,
    },
    body: JSON.stringify({ server_id: 1 }),
  });
  assert.equal(
    serverMutation.status,
    404,
    'user without server access cannot mutate another user server'
  );

  const logout = await request(port, '/auth/logout', {
    method: 'POST',
    headers: { accept: 'application/json', cookie: admin.session, 'x-csrf-token': admin.csrfToken },
  });
  assert.equal(logout.status, 200);
  assert.match(String(logout.headers['set-cookie']), /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  const invalidated = await request(port, '/api/users/list', {
    headers: { accept: 'application/json', cookie: admin.session },
  });
  assert.equal(invalidated.status, 401, 'logout invalidates the server-side session');
});
