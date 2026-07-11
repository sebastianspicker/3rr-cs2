import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseServerId } from '../utils/parseServerId';

describe('parseServerId', () => {
  it('accepts canonical positive integer IDs used for route authorization', () => {
    const accepted: Array<[unknown, string, string]> = [
      ['1', '1', 'single digit string'],
      ['123', '123', 'multi digit string'],
      [1, '1', 'single digit number'],
      [123, '123', 'multi digit number'],
      [999999, '999999', 'large safe integer'],
      [' 42 ', '42', 'surrounding whitespace'],
    ];

    for (const [input, expected, label] of accepted) {
      assert.equal(parseServerId(input), expected, label);
    }
  });

  it('rejects ambiguous or invalid IDs so routes cannot widen access', () => {
    const rejected: Array<[unknown, string]> = [
      ['0', 'zero string'],
      ['-1', 'negative string'],
      ['abc', 'non-numeric string'],
      ['1abc', 'partly numeric string'],
      ['', 'empty string'],
      [null, 'null'],
      [undefined, 'undefined'],
      [0, 'zero number'],
      [-1, 'negative number'],
      [NaN, 'NaN'],
      [Infinity, 'Infinity'],
      ['01', 'leading zero string'],
      ['1.5', 'float string'],
      [1.5, 'float number'],
      [Number.MAX_SAFE_INTEGER + 1, 'unsafe integer'],
    ];

    for (const [input, label] of rejected) {
      assert.equal(parseServerId(input), null, label);
    }
  });
});
