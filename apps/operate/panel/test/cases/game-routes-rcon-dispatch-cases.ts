import { test } from 'node:test';
import {
  serverId,
  executedCommands,
  commandsThatFail,
  commandResponses,
  type RconCommandResponse,
  postAuthedJson,
  postJson,
  withServer,
  withAuthedServer,
  countHistoryRows,
  assert,
} from '../game-routes-fixture';
import { loopbackFetch } from '../support/http-helpers';

test('POST /api/rcon rejects unauthenticated requests', async () => {
  await withServer(async (baseUrl) => {
    const res = await postJson(baseUrl, '/api/rcon', { server_id: serverId, command: 'status' });
    assert.equal(res.status, 401);
  });
});

test('POST /api/rcon reports command and history success separately', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const command = 'status srp010-success';
    const res = await postAuthedJson(baseUrl, auth, '/api/rcon', { server_id: serverId, command });
    assert.equal(res.status, 200);
    const body = (await res.json()) as RconCommandResponse;
    assert.equal(body.message, 'Command sent.');
    assert.equal(body.command_sent, true);
    assert.equal(body.history_recorded, true);
    assert.equal(body.partial, false);
    assert.equal(await countHistoryRows(command), 1);
  });
});

test('POST /api/rcon reports partial success when history persistence fails after dispatch', async () => {
  const { better_sqlite_client: db } = await import('../../db');
  db.exec(`
    DROP TRIGGER IF EXISTS fail_rcon_history_insert;
    CREATE TEMP TRIGGER fail_rcon_history_insert
    BEFORE INSERT ON rcon_command_history
    BEGIN
      SELECT RAISE(ABORT, 'simulated history write failure');
    END;
  `);
  try {
    await withAuthedServer(async (baseUrl, auth) => {
      const command = 'status srp010-history-failure';
      const res = await postAuthedJson(baseUrl, auth, '/api/rcon', {
        server_id: serverId,
        command,
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as RconCommandResponse;
      assert.equal(body.message, 'Command sent, but history was not recorded.');
      assert.equal(body.command_sent, true);
      assert.equal(body.history_recorded, false);
      assert.equal(body.partial, true);
      assert.deepEqual(executedCommands, [command]);
      assert.equal(await countHistoryRows(command), 0);
    });
  } finally {
    db.exec(`DROP TRIGGER IF EXISTS fail_rcon_history_insert`);
  }
});

test('POST /api/rcon does not record history when command dispatch fails', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const command = 'status srp010-rcon-failure';
    commandsThatFail.add(command);
    const res = await postAuthedJson(baseUrl, auth, '/api/rcon', { server_id: serverId, command });
    assert.equal(res.status, 500);
    const body = (await res.json()) as RconCommandResponse;
    assert.match(body.error ?? '', /RCON/);
    assert.equal(body.command_sent, undefined);
    assert.equal(await countHistoryRows(command), 0);
  });
});

test('POST /api/rcon rejects a blocked command', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await postAuthedJson(baseUrl, auth, '/api/rcon', {
      server_id: serverId,
      command: 'exec config.cfg',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Command not allowed/);
  });
});

test('POST /api/rcon rejects a command containing non-ASCII characters', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await postAuthedJson(baseUrl, auth, '/api/rcon', {
      server_id: serverId,
      command: 'status\u013B',
    });
    assert.equal(res.status, 400);
  });
});

test('game-control success messages report command dispatch, not verified state changes', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const post = async (path: string, body: Record<string, unknown>) => {
      const res = await loopbackFetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: auth.sessionCookie,
          'x-csrf-token': auth.csrfToken,
        },
        body: JSON.stringify({ server_id: serverId, ...body }),
      });
      assert.equal(res.status, 200, path);
      return (await res.json()) as { message: string };
    };
    const definitiveStateClaim =
      /\b(created|restarted|paused|unpaused|kicked|muted|unmuted|enabled|disabled|started|loaded|restored|set to|assigned|gave)\b/i;

    commandResponses.set('mp_restartgame 1', 'Unknown command: mp_restartgame');
    const restart = await post('/api/restart', {});
    assert.equal(restart.message, 'Restart command sent.');
    assert.doesNotMatch(restart.message, definitiveStateClaim);
    assert.deepEqual(executedCommands, ['mp_restartgame 1']);

    executedCommands.length = 0;
    commandResponses.set('kickid 10000', 'userid not found');
    const kick = await post('/api/player-kick', { userid: '10000' });
    assert.equal(kick.message, 'Kick command sent for player 10000.');
    assert.doesNotMatch(kick.message, definitiveStateClaim);
    assert.deepEqual(executedCommands, ['kickid 10000']);
  });
});
