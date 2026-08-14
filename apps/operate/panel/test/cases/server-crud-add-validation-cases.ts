import { test } from 'node:test';
import { app, assert, loginAndGetSession, postAddServer } from '../support/server-crud-fixture';
import type { AddressInfo, Server } from '../support/server-crud-fixture';

test('POST /api/add-server accepts private LAN IPs for self-hosted servers', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      {
        server_ip: '192.168.1.10',
        server_port: 27016,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }
    );

    assert.equal(res.status, 201);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Server added successfully');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects invalid IP', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      { server_ip: '', server_port: 27015, rcon_password: ['test', 'rcon', 'password'].join('-') }
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body.error === 'string');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects invalid port', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      {
        server_ip: '203.0.113.2',
        server_port: 99999,
        rcon_password: ['test', 'rcon', 'password'].join('-'),
      }
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'server_port must be an integer between 1 and 65535');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/add-server rejects missing password', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await postAddServer(
      port,
      { sessionCookie, csrfToken },
      { server_ip: '203.0.113.3', server_port: 27015, rcon_password: '' }
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(typeof body.error === 'string');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
