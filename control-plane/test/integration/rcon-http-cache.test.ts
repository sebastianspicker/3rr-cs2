/** Deterministic HTTP/cache fixture; timings are local test evidence, not production estimates. */
import { rconScenario } from '../unit/support/rcon-manager';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { after, before, test } from 'node:test';
import { request as httpRequest } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { performance } from 'node:perf_hooks';
import { runMigrations } from '../../src/infrastructure/sqlite/migrations';
import { createSqliteRconServerStore } from '../../src/infrastructure/sqlite/rconServerStore';
import type { RconManager } from '../../src/integrations/rcon/rcon';
import type {
  RconObservationOptions,
  RconObservedCommand,
} from '../../src/integrations/rcon/rconTypes';

interface HttpResult {
  status: number;
  body: string;
  headers: Headers;
}

let database: Database.Database;
let manager: RconManager;
let server: Server;
let port: number;
let cookie: string;
let csrfToken: string;

async function request(path: string, options: RequestInit = {}): Promise<HttpResult> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  return { status: response.status, body: await response.text(), headers: response.headers };
}

function json<T>(result: HttpResult): T {
  return JSON.parse(result.body) as T;
}

before(async () => {
  database = new Database(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  runMigrations(database);
  database
    .prepare('INSERT INTO users (id, username, password, is_admin) VALUES (?, ?, ?, 1)')
    .run(1, 'admin', bcrypt.hashSync('correct-horse-battery-staple', 10));
  const insertServer = database.prepare(
    'INSERT INTO servers (id, serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?, 1)'
  );
  const grant = database.prepare('INSERT INTO server_access (user_id, server_id) VALUES (1, ?)');
  database.transaction(() => {
    for (let id = 1; id <= 51; id += 1) {
      insertServer.run(id, `203.0.113.${id}`, 27015, 'password');
      if (id <= 50) grant.run(id);
    }
  })();

  rconScenario.execute = async (command) => {
    if (command === 'hostname') return 'hostname: Fixture server';
    if (command === 'status') {
      return 'map : de_dust2\nplayers : 2 humans, 1 bots (10 max)';
    }
    if (command === 'sv_visiblemaxplayers') return 'sv_visiblemaxplayers = 12';
    if (command === 'users') return '1 Alice STEAM_ID_LAN';
    return 'ok';
  };
  const [{ RconManager }, { createPanelApp }] = await Promise.all([
    import('../../src/integrations/rcon/rcon'),
    import('../../src/app/createApp'),
  ]);
  manager = new RconManager(createSqliteRconServerStore(database));
  await manager.readyPromise;
  server = createPanelApp('test', process.cwd(), {
    db: database,
    redisClient: null,
    rcon: manager,
  }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  port = (server.address() as AddressInfo).port;

  const initial = await request('/');
  const initialCookie = initial.headers.get('set-cookie')?.split(';', 1)[0];
  const csrf = initial.body.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  assert.ok(initialCookie && csrf);
  const login = await request('/auth/login', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: initialCookie,
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({ username: 'admin', password: 'correct-horse-battery-staple' }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  assert.ok(cookie);
  const authenticatedPage = await request('/servers', { headers: { cookie } });
  csrfToken = authenticatedPage.body.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1] ?? '';
  assert.ok(csrfToken);
  rconScenario.executeCalls = [];
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await manager.shutdownAll();
  database.close();
});

const authenticated = { headers: { accept: 'application/json', cookie: '' } };

function post(path: string, body: Record<string, unknown>, signal?: AbortSignal) {
  return request(path, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(body),
    signal,
  });
}

function postAndDisconnect(path: string, body: Record<string, unknown>): Promise<void> {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      agent: false,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        cookie,
        'x-csrf-token': csrfToken,
      },
    });
    req.once('error', () => undefined);
    req.end(payload);
    setTimeout(() => {
      req.socket?.destroy();
      req.destroy();
      setTimeout(resolve, 10);
    }, 20);
  });
}

async function inventoryAndStatusWave(): Promise<{
  inventory: Array<{ id: number; observed_at: string | null }>;
  statuses: Array<{ observed_at: string | null }>;
  elapsedMs: number;
}> {
  const started = performance.now();
  const inventoryResult = await request('/api/servers', {
    headers: { ...authenticated.headers, cookie },
  });
  assert.equal(inventoryResult.status, 200);
  const inventory = json<{ servers: Array<{ id: number; observed_at: string | null }> }>(
    inventoryResult
  ).servers;
  const statusResults = await Promise.all(
    inventory.map(({ id }) =>
      request(`/api/status/${id}`, { headers: { ...authenticated.headers, cookie } })
    )
  );
  for (const result of statusResults) assert.equal(result.status, 200);
  return {
    inventory,
    statuses: statusResults.map((result) => json<{ observed_at: string | null }>(result)),
    elapsedMs: performance.now() - started,
  };
}

test('HTTP inventory and status waves share the 5-second observation cache', async (t) => {
  const deniedBefore = rconScenario.executeCalls.length;
  const denied = await request('/api/status/51', {
    headers: { ...authenticated.headers, cookie },
  });
  assert.equal(denied.status, 404);
  assert.equal(rconScenario.executeCalls.length, deniedBefore);

  const originalObserve = manager.observeCommand.bind(manager);
  manager.observeCommand = async (
    serverId: string,
    command: RconObservedCommand,
    options: RconObservationOptions = {}
  ) => ({
    value: await manager.executeCommand(serverId, command, {
      deadlineAt: options.deadlineAt,
      signal: options.signal,
      classification: 'observation',
    }),
    observedAt: new Date().toISOString(),
  });
  const referenceBefore = rconScenario.executeCalls.length;
  let reference: Awaited<ReturnType<typeof inventoryAndStatusWave>>;
  try {
    reference = await inventoryAndStatusWave();
  } finally {
    manager.observeCommand = originalObserve;
  }
  const referenceCommands = rconScenario.executeCalls.length - referenceBefore;
  assert.equal(referenceCommands, 200);

  const coldBefore = rconScenario.executeCalls.length;
  const cold = await inventoryAndStatusWave();
  const coldCommands = rconScenario.executeCalls.length - coldBefore;
  assert.equal(cold.inventory.length, 50);
  assert.equal(coldCommands, 150);

  const warmBefore = rconScenario.executeCalls.length;
  const warm = await inventoryAndStatusWave();
  const warmCommands = rconScenario.executeCalls.length - warmBefore;
  assert.equal(warmCommands, 0);
  assert.deepEqual(
    warm.inventory.map((entry) => entry.observed_at),
    cold.inventory.map((entry) => entry.observed_at)
  );
  assert.deepEqual(
    warm.statuses.map((entry) => entry.observed_at),
    cold.statuses.map((entry) => entry.observed_at)
  );

  const dispatchOffsetsMs: number[] = [];
  rconScenario.execute = async () => {
    dispatchOffsetsMs.push(performance.now() - metricStarted);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return 'ok';
  };
  const metricStarted = performance.now();
  await Promise.all(
    ['metric-one', 'metric-two', 'metric-three'].map((command) =>
      manager.executeCommand('1', command, { classification: 'observation' })
    )
  );
  const referenceDispatchOffsetsMs: number[] = [];
  const referenceMetricStarted = performance.now();
  let referenceChain = Promise.resolve();
  await Promise.all(
    Array.from({ length: 3 }, () => {
      const task = referenceChain.then(async () => {
        referenceDispatchOffsetsMs.push(performance.now() - referenceMetricStarted);
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      referenceChain = task;
      return task;
    })
  );
  const relativeOffsets = (offsets: number[]) =>
    offsets.map((value) => Math.round((value - (offsets[0] ?? value)) * 100) / 100);
  t.diagnostic(
    JSON.stringify({
      fixture: '50 local fake-transport servers',
      referenceCommands,
      coldCommands,
      warmCommands,
      referenceElapsedMs: Math.round(reference.elapsedMs * 100) / 100,
      coldElapsedMs: Math.round(cold.elapsedMs * 100) / 100,
      warmElapsedMs: Math.round(warm.elapsedMs * 100) / 100,
      referenceQueueWaitMs: relativeOffsets(referenceDispatchOffsetsMs),
      measuredQueueWaitMs: relativeOffsets(dispatchOffsetsMs),
      productionEstimate: false,
    })
  );
});

test('HTTP players retain the oldest warm timestamp', async () => {
  const first = await request('/api/players/1', {
    headers: { ...authenticated.headers, cookie },
  });
  const second = await request('/api/players/1', {
    headers: { ...authenticated.headers, cookie },
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(
    json<{ observed_at: string | null }>(second).observed_at,
    json<{ observed_at: string | null }>(first).observed_at
  );
});

test('an HTTP refresh and concurrent ordinary read join the same flights', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  rconScenario.execute = async (command) => {
    await gate;
    if (command === 'hostname') return 'hostname: Refreshed';
    if (command === 'status') return 'map : de_nuke\nplayers : 3 humans, 0 bots (12 max)';
    return 'sv_visiblemaxplayers = 12';
  };
  const before = rconScenario.executeCalls.length;
  const refresh = request('/api/status/1?refresh=1', {
    headers: { ...authenticated.headers, cookie },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const ordinary = request('/api/status/1', {
    headers: { ...authenticated.headers, cookie },
  });
  release();
  const [refreshResult, ordinaryResult] = await Promise.all([refresh, ordinary]);
  assert.equal(refreshResult.status, 200);
  assert.equal(ordinaryResult.status, 200);
  assert.equal(rconScenario.executeCalls.length - before, 3);
  assert.deepEqual(json(ordinaryResult), json(refreshResult));
});

test('HTTP overload preserves not-sent sequence details', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  rconScenario.execute = async () => {
    await gate;
    return 'ok';
  };
  const held = Array.from({ length: 33 }, (_, index) =>
    manager.executeCommand('1', `held-${index}`)
  );
  await new Promise((resolve) => setImmediate(resolve));
  const overloaded = await post('/api/start-warmup', { server_id: 1 });
  assert.equal(overloaded.status, 503);
  assert.deepEqual(json(overloaded), {
    outcome: 'not_sent',
    code: 'RconOverloadError',
    error: 'RCON command sequence failed before any commands were applied',
    partial: false,
    applied_commands: [],
    failed_command: 'mp_restartgame 1',
    failed_command_index: 0,
    failure_reason: 'RCON command queue is full',
  });
  release();
  await Promise.all(held);
});

test('HTTP deadline reports an unknown partially applied command sequence', async () => {
  let calls = 0;
  rconScenario.execute = async () => {
    calls += 1;
    if (calls === 1) return 'ok';
    return new Promise<string>(() => undefined);
  };
  const mutableManager = manager as unknown as { totalDeadlineMs: number };
  const originalDeadline = mutableManager.totalDeadlineMs;
  mutableManager.totalDeadlineMs = 20;
  try {
    const result = await post('/api/start-warmup', { server_id: 1 });
    assert.equal(result.status, 504);
    assert.deepEqual(json(result), {
      outcome: 'unknown',
      code: 'RconDeadlineError',
      error:
        'RCON command sequence failed after earlier commands were applied; server may be partially updated',
      partial: true,
      applied_commands: ['mp_restartgame 1'],
      failed_command: 'exec warmup.cfg',
      failed_command_index: 1,
      failure_reason: 'RCON command deadline exceeded',
    });
  } finally {
    mutableManager.totalDeadlineMs = originalDeadline;
  }
  assert.equal(calls, 2);
});

test('aborting an HTTP request removes its queued command before dispatch', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  rconScenario.executeCalls = [];
  rconScenario.execute = async () => {
    await gate;
    return 'ok';
  };
  const held = manager.executeCommand('1', 'held');
  await postAndDisconnect('/api/restart', { server_id: 1 });
  release();
  await held;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(rconScenario.executeCalls, ['held']);
});
