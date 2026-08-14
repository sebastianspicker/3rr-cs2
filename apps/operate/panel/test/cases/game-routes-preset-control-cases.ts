import { test } from 'node:test';
import {
  serverId,
  executedCommands,
  withAuthedServer,
  assertSecondCommandPartialFailures,
  assert,
} from '../game-routes-fixture';
import { loopbackFetch } from '../support/http-helpers';

test('multi-command routes report partial failure when the second command fails', async () => {
  await assertSecondCommandPartialFailures([
    {
      path: '/api/respawn-toggle',
      body: { value: '1' },
      appliedCommands: ['mp_respawn_on_death_ct 1'],
      failedCommand: 'mp_respawn_on_death_t 1',
    },
    {
      path: '/api/set-startmoney',
      body: { value: 800 },
      appliedCommands: ['mp_startmoney 800'],
      failedCommand: 'mp_maxmoney 16000',
    },
    {
      path: '/api/set-roundtime',
      body: { value: 5 },
      appliedCommands: ['mp_roundtime 5'],
      failedCommand: 'mp_roundtime_defuse 5',
    },
    {
      path: '/api/set-overtime',
      body: { enable: '1', ot_rounds: 3 },
      appliedCommands: ['mp_overtime_enable 1'],
      failedCommand: 'mp_overtime_maxrounds 3',
    },
    {
      path: '/api/start-warmup',
      body: {},
      appliedCommands: ['mp_restartgame 1'],
      failedCommand: 'exec warmup.cfg',
    },
  ]);
});

test('practice sequence routes preserve fixed command order and success payloads', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const scenarios: Array<{
      path: string;
      body: Record<string, unknown>;
      commands: string[];
      message: string;
    }> = [
      {
        path: '/api/respawn-toggle',
        body: { value: '1' },
        commands: ['mp_respawn_on_death_ct 1', 'mp_respawn_on_death_t 1'],
        message: 'Respawn command sequence sent with value 1.',
      },
      {
        path: '/api/set-startmoney',
        body: { value: 800 },
        commands: ['mp_startmoney 800', 'mp_maxmoney 16000'],
        message: 'Start money command sequence sent with value 800.',
      },
      {
        path: '/api/set-roundtime',
        body: { value: 5 },
        commands: ['mp_roundtime 5', 'mp_roundtime_defuse 5'],
        message: 'Round time command sequence sent with value 5 min.',
      },
    ];

    for (const { path, body, commands, message } of scenarios) {
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
      assert.deepEqual(await res.json(), { message }, path);
      assert.deepEqual(executedCommands, commands, path);
      executedCommands.length = 0;
    }
  });
});

test('practice sequence routes reject invalid values before sending RCON', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const scenarios: Array<{
      path: string;
      body: Record<string, unknown>;
      error: string;
    }> = [
      {
        path: '/api/respawn-toggle',
        body: { value: '2' },
        error: 'value must be 0 or 1',
      },
      {
        path: '/api/set-startmoney',
        body: { value: '800abc' },
        error: 'value must be one of: 0, 800, 1600, 3200, 16000',
      },
      {
        path: '/api/set-roundtime',
        body: { value: 999 },
        error: 'value must be one of: 1, 2, 5, 60',
      },
    ];

    for (const { path, body, error } of scenarios) {
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
      assert.equal(res.status, 400, path);
      assert.deepEqual(await res.json(), { error }, path);
      assert.deepEqual(executedCommands, [], path);
    }
  });
});

test('preset routes reject malformed numeric values before sending RCON', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const cases: Array<{ label: string; value: unknown }> = [
      { label: 'suffix junk', value: '5abc' },
      { label: 'prefix junk', value: 'abc5' },
      { label: 'decimal string', value: '5.5' },
      { label: 'empty string', value: '' },
      { label: 'out of range', value: 999 },
    ];

    for (const { label, value } of cases) {
      const res = await loopbackFetch(`${baseUrl}/api/set-freezetime`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: auth.sessionCookie,
          'x-csrf-token': auth.csrfToken,
        },
        body: JSON.stringify({ server_id: serverId, value }),
      });
      assert.equal(res.status, 400, label);
      assert.deepEqual(executedCommands, [], label);
    }
  });
});

test('preset routes accept strict allowed integer values including zero', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const res = await loopbackFetch(`${baseUrl}/api/set-freezetime`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: auth.sessionCookie,
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify({ server_id: serverId, value: '0' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(executedCommands, ['mp_freezetime 0']);
  });
});

test('multi-command preset routes reject malformed numeric values before sending RCON', async () => {
  await withAuthedServer(async (baseUrl, auth) => {
    const scenarios: Array<{ path: string; body: Record<string, unknown> }> = [
      { path: '/api/set-roundtime', body: { value: '5abc' } },
      { path: '/api/set-overtime', body: { enable: '1', ot_rounds: '3abc' } },
    ];

    for (const scenario of scenarios) {
      const res = await loopbackFetch(`${baseUrl}${scenario.path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          cookie: auth.sessionCookie,
          'x-csrf-token': auth.csrfToken,
        },
        body: JSON.stringify({ server_id: serverId, ...scenario.body }),
      });
      assert.equal(res.status, 400, scenario.path);
      assert.deepEqual(executedCommands, [], scenario.path);
    }
  });
});
