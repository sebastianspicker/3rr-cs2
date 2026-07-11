import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runtime fails loudly outside the declared Node 22 engine range', () => {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  assert.equal(
    major,
    22,
    `This package declares "node": ">=22 <23"; rerun tests with Node 22, not ${process.version}`
  );
});
