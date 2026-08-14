/** Authentication and validation scenarios for random-round and RTD toggles. */
import { test } from 'node:test';
import {
  app,
  loginOrReuseSession,
  assert,
  type AddressInfo,
  type Server,
} from '../support/app-fixture';

export function registerCsrfToggleScenarios(): void {
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
}
