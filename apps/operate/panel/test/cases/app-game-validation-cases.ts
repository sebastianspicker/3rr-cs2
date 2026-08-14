/** Authenticated input-validation coverage for game-operation routes. */
import { test } from 'node:test';
import {
  app,
  loginAndGetSession,
  assert,
  type AddressInfo,
  type Server,
} from '../support/app-fixture';

export function registerGameRouteValidationScenarios(): void {
  test('POST /api/matchzy-coach returns 400 for invalid side', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/matchzy-coach`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, side: 'invalid' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/matchzy-load-match-file returns 400 for non-.json filename', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/matchzy-load-match-file`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, filename: '../../etc/passwd' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/player-kick returns 400 for non-numeric userid', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/player-kick`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, userid: 'badid' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/player-mute returns 400 for non-SteamID64 value', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/player-mute`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, steamid: '12345' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/set-mapgroup returns 400 for unknown group', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/set-mapgroup`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, group: 'nonexistent_group' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/workshop-collection returns 400 for too-short id', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/workshop-collection`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, collection_id: '123' }),
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /api/set-buytime returns 400 for invalid preset value', async () => {
    const server: Server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const { sessionCookie, csrfToken } = await loginAndGetSession(port);
      const res = await fetch(`http://127.0.0.1:${port}/api/set-buytime`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ server_id: 1, value: 999 }),
      });
      assert.equal(res.status, 400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
