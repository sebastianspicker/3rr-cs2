import { test } from 'node:test';
import { app, loginOrReuseSession, assert, type AddressInfo, type Server } from './app-fixture';

test('POST /api/setup-game: scoutzknivez rejects non-scoutz map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: 'scoutzknivez',
        selectedMap: 'de_mirage',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: scoutzknivez accepts scoutz map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: 'scoutzknivez',
        selectedMap: 'workshop/3073929825/scoutzknivez_pure_cs2',
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: bhop rejects non-bhop map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: 'bunnyhop',
        selectedMap: 'de_mirage',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: bhop accepts bhop map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: 'bunnyhop',
        selectedMap: 'workshop/3077211069/bhop_at_night',
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── GunGame ────────────────────────────────────────────────────────────────

test('POST /api/setup-game: gungame rejects map not in gungame pool', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'casual',
        game_mode: 'gungame',
        selectedMap: 'de_shorttrain',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: gungame accepts gungame map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'casual',
        game_mode: 'gungame',
        selectedMap: 'ar_shoots',
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── Deathmatch ─────────────────────────────────────────────────────────────

test('POST /api/setup-game: deathmatch rejects map not in active pool', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'casual',
        game_mode: 'deathmatch',
        selectedMap: 'de_shorttrain',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: deathmatch accepts active duty map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'casual',
        game_mode: 'deathmatch',
        selectedMap: 'de_mirage',
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── OITC ───────────────────────────────────────────────────────────────────

test('POST /api/setup-game: oitc rejects map not in oitc pool', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: 'oitc',
        selectedMap: 'de_shorttrain',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: oitc accepts oitc map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: 'oitc',
        selectedMap: 'de_dust2',
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── 1v1 Arenas ─────────────────────────────────────────────────────────────

test('POST /api/setup-game: 1v1arenas rejects non-arena map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: '1v1arenas',
        selectedMap: 'de_mirage',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/setup-game: 1v1arenas accepts arena map', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: 'fun',
        game_mode: '1v1arenas',
        selectedMap: 'workshop/3070581293/de_bank',
      }),
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ── Random Rounds toggle ───────────────────────────────────────────────────
