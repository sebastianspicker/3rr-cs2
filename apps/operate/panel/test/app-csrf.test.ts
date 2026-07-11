import { test } from 'node:test';
import {
  app,
  rconCommands,
  resetRconCommands,
  loginAndGetSession,
  loginOrReuseSession,
  assert,
  type AddressInfo,
  type Server,
} from './app-fixture';

test('POST /api/random-rounds-toggle: requires auth', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/random-rounds-toggle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/random-rounds-toggle: rejects invalid value', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/random-rounds-toggle`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, value: 99 }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /value must be 0 or 1/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── RTD toggle + force-roll ────────────────────────────────────────────────

test('POST /api/rtd-toggle: requires auth', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/rtd-toggle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rtd-toggle: rejects invalid value', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/rtd-toggle`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, value: 'yes' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /value must be 0 or 1/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rtd-force-roll: requires auth', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/rtd-force-roll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── CSRF edge cases ──────────────────────────────────────────────────────────

test('POST /api/add-server rejects missing CSRF token on authenticated session', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginOrReuseSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        // deliberately omit x-csrf-token
      },
      body: JSON.stringify({
        server_ip: '203.0.113.50',
        server_port: 27015,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }),
    });

    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects wrong CSRF token on authenticated session', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginOrReuseSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/add-server`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      body: JSON.stringify({
        server_ip: '203.0.113.51',
        server_port: 27015,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }),
    });

    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

type CsrfRouteCase = {
  name: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: Record<string, unknown>;
};

const csrfRouteCases: CsrfRouteCase[] = [
  {
    name: 'server reconnect POST',
    method: 'POST',
    path: '/api/reconnect-server',
    body: { server_id: '1' },
  },
  {
    name: 'game say-admin POST',
    method: 'POST',
    path: '/api/say-admin',
    body: { server_id: '1', message: 'csrf matrix' },
  },
  {
    name: 'user password POST',
    method: 'POST',
    path: '/api/users/change-password',
    body: { currentPassword: 'wrongpassword', newPassword: 'newpassword123' },
  },
  {
    name: 'operator favorite create POST',
    method: 'POST',
    path: '/api/workshop-favorites/1',
    body: { workshop_id: '1234567890', name: 'CSRF Matrix' },
  },
  {
    name: 'operator favorite update PATCH',
    method: 'PATCH',
    path: '/api/workshop-favorites/1/999999',
    body: { name: 'CSRF Matrix Updated' },
  },
  {
    name: 'operator favorite delete DELETE',
    method: 'DELETE',
    path: '/api/workshop-favorites/1/999999',
    body: {},
  },
  {
    name: 'auth logout POST',
    method: 'POST',
    path: '/auth/logout',
    body: {},
  },
];

test('CSRF matrix rejects missing and wrong tokens on representative state-changing routes', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie } = await loginOrReuseSession(port);

    for (const routeCase of csrfRouteCases) {
      for (const suppliedToken of [undefined, 'bad-csrf-token']) {
        const headers: Record<string, string> = {
          accept: 'application/json',
          cookie: sessionCookie,
          'content-type': 'application/json',
        };
        if (suppliedToken) headers['x-csrf-token'] = suppliedToken;

        const res = await fetch(`http://127.0.0.1:${port}${routeCase.path}`, {
          method: routeCase.method,
          headers,
          body: JSON.stringify(routeCase.body),
        });

        assert.equal(
          res.status,
          403,
          `${routeCase.name} should reject ${suppliedToken ? 'wrong' : 'missing'} CSRF token`
        );
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body.error, 'Invalid CSRF token');
      }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('CSRF matrix accepts header and form tokens and keeps unauthenticated state changes unauthorized', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    resetRconCommands();

    const headerTokenRes = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: '1', message: 'csrf header token' }),
    });
    assert.equal(headerTokenRes.status, 200);

    const formBody = new URLSearchParams({
      _csrf: csrfToken,
      server_id: '1',
      message: 'csrf form token',
    });
    const formTokenRes = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });
    assert.equal(formTokenRes.status, 200);
    assert.deepEqual(rconCommands, ['say "csrf header token"', 'say "csrf form token"']);

    const unauthenticatedRes = await fetch(`http://127.0.0.1:${port}/api/say-admin`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ server_id: '1', message: 'no session' }),
    });
    assert.equal(unauthenticatedRes.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── Logout and session invalidation ──────────────────────────────────────────

test('POST /auth/logout clears the session cookie', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
    });

    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    // The cleared cookie should have an empty or expired value
    assert.ok(
      setCookie.includes('cspanel.sid=;') ||
        setCookie.includes('cspanel.sid= ;') ||
        setCookie.includes('Expires=Thu, 01 Jan 1970'),
      `Expected cleared session cookie, got: ${setCookie}`
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('re-used session cookie after logout returns 401 on protected routes', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    // Login fresh to get a session that we will then invalidate
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    // Logout
    await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
    });

    // Attempt to use the now-invalid session
    const res = await fetch(`http://127.0.0.1:${port}/api/servers`, {
      headers: {
        accept: 'application/json',
        cookie: sessionCookie,
      },
    });

    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
