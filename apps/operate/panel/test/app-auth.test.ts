import { test } from 'node:test';
import {
  app,
  setRconInitSummary,
  loginAndGetSession,
  assert,
  getLoginPageCsrfAndCookie,
  type AddressInfo,
  type Server,
} from './app-fixture';

test('GET / returns login page (not authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);

    const text = await res.text();
    assert.ok(text.toLowerCase().includes('login'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/login rejects missing CSRF token', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: ['test', 'pass', '12345'].join('') }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Invalid CSRF token');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/login sets hardened session cookie when CSRF is valid', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { cookie, csrfToken } = await getLoginPageCsrfAndCookie(port);

    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'testuser', password: ['test', 'pass', '12345'].join('') }),
    });

    assert.equal(res.status, 200);

    const loginSetCookie = res.headers.get('set-cookie');
    assert.ok(loginSetCookie);
    assert.ok(/HttpOnly/i.test(loginSetCookie));
    assert.ok(/SameSite=Strict/i.test(loginSetCookie));
    assert.notEqual(loginSetCookie.split(';')[0], cookie, 'session id should rotate on login');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/logout requires CSRF when authenticated', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken: postLoginCsrfToken } = await loginAndGetSession(port);

    const logoutRes = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        accept: 'application/json',
        'x-csrf-token': postLoginCsrfToken,
      },
    });

    assert.equal(logoutRes.status, 200);
    const clearedCookie = logoutRes.headers.get('set-cookie') || '';
    assert.ok(
      clearedCookie.includes('Max-Age=0') || clearedCookie.includes('Expires=Thu, 01 Jan 1970')
    );
    const body = (await logoutRes.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Logged out');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/login returns 401 on invalid password', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { cookie, csrfToken } = await getLoginPageCsrfAndCookie(port);

    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'testuser', password: 'wrongpassword1' }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Invalid credentials');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/restart returns unauthorized without session', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ server_id: 1 }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/restart returns 400 when server_id is missing (authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Missing or invalid server_id');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/restart rejects malformed server_id (authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: '1abc' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Missing or invalid server_id');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon blocks command separators (authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, command: 'quit; status' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.match(body.error as string, /Command not allowed/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/health returns minimal payload when unauthenticated', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('ratelimit-policy'), null);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ['ok', 'ready']);
    assert.equal(body.ok, true);
    assert.equal(body.ready, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/health/ bypasses rate limiting like /api/health', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health/`);

    assert.equal(res.status, 200);
    assert.equal(res.headers.has('ratelimit-policy'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/health returns verbose payload when HEALTHCHECK_VERBOSE=true', async () => {
  const server: Server = app.listen(0);
  const previous = process.env.HEALTHCHECK_VERBOSE;
  process.env.HEALTHCHECK_VERBOSE = 'true';
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('ratelimit-policy'), null);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ['db', 'ok', 'rcon', 'ready', 'redis']);
    assert.equal(body.ready, true);
  } finally {
    if (previous === undefined) {
      delete process.env.HEALTHCHECK_VERBOSE;
    } else {
      process.env.HEALTHCHECK_VERBOSE = previous;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/health exposes degraded RCON readiness when startup connections fail', async () => {
  const server: Server = app.listen(0);
  const previousVerbose = process.env.HEALTHCHECK_VERBOSE;
  process.env.HEALTHCHECK_VERBOSE = 'true';
  setRconInitSummary({
    complete: true,
    total: 2,
    connected: 0,
    failed: 2,
    skipped: 0,
    errors: [
      { server_id: '1', serverIP: '203.0.113.10', message: 'RCON initialization failed' },
      { server_id: '2', serverIP: '203.0.113.11', message: 'RCON initialization failed' },
    ],
  });
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      ready: boolean;
      rcon?: { ready: boolean; total: number; connected: number; failed: number };
    };

    assert.equal(body.ok, true);
    assert.equal(body.ready, false);
    assert.equal(body.rcon?.ready, false);
    assert.equal(body.rcon?.total, 2);
    assert.equal(body.rcon?.connected, 0);
    assert.equal(body.rcon?.failed, 2);
  } finally {
    setRconInitSummary({
      complete: true,
      total: 0,
      connected: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    });
    if (previousVerbose === undefined) {
      delete process.env.HEALTHCHECK_VERBOSE;
    } else {
      process.env.HEALTHCHECK_VERBOSE = previousVerbose;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
