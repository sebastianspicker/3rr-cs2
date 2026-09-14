import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rconOptionsFromEnvironment } from '../../src/app/rconOptions';

test('RCON deployment budgets accept explicit positive integers only', () => {
  assert.deepEqual(rconOptionsFromEnvironment({}), {});
  assert.deepEqual(
    rconOptionsFromEnvironment({ RCON_STARTUP_CONCURRENCY: '4', RCON_TOTAL_DEADLINE_MS: '12000' }),
    { startupConcurrency: 4, totalDeadlineMs: 12000 }
  );
  for (const value of ['', '0', '-1', '1.5', '12ms', '2147483648', 'Infinity']) {
    assert.throws(
      () => rconOptionsFromEnvironment({ RCON_TOTAL_DEADLINE_MS: value }),
      /RCON_TOTAL_DEADLINE_MS/
    );
  }
});
