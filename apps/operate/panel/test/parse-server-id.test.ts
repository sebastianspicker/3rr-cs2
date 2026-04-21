import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseServerId } from '../utils/parseServerId';

describe('parseServerId', () => {
  // Valid cases
  it('returns string for valid string "1"', () => {
    assert.equal(parseServerId('1'), '1');
  });
  it('returns string for valid string "123"', () => {
    assert.equal(parseServerId('123'), '123');
  });
  it('returns string for valid number 1', () => {
    assert.equal(parseServerId(1), '1');
  });
  it('returns string for valid number 123', () => {
    assert.equal(parseServerId(123), '123');
  });
  it('returns string for large valid integer', () => {
    assert.equal(parseServerId(999999), '999999');
  });
  it('trims whitespace from string', () => {
    assert.equal(parseServerId(' 42 '), '42');
  });

  // Invalid cases
  it('returns null for "0"', () => {
    assert.equal(parseServerId('0'), null);
  });
  it('returns null for "-1"', () => {
    assert.equal(parseServerId('-1'), null);
  });
  it('returns null for "abc"', () => {
    assert.equal(parseServerId('abc'), null);
  });
  it('returns null for "1abc"', () => {
    assert.equal(parseServerId('1abc'), null);
  });
  it('returns null for empty string', () => {
    assert.equal(parseServerId(''), null);
  });
  it('returns null for null', () => {
    assert.equal(parseServerId(null), null);
  });
  it('returns null for undefined', () => {
    assert.equal(parseServerId(undefined), null);
  });
  it('returns null for number 0', () => {
    assert.equal(parseServerId(0), null);
  });
  it('returns null for number -1', () => {
    assert.equal(parseServerId(-1), null);
  });
  it('returns null for NaN', () => {
    assert.equal(parseServerId(NaN), null);
  });
  it('returns null for Infinity', () => {
    assert.equal(parseServerId(Infinity), null);
  });
  it('returns null for string with leading zeros "01"', () => {
    assert.equal(parseServerId('01'), null);
  });
  it('returns null for float "1.5"', () => {
    assert.equal(parseServerId('1.5'), null);
  });
  it('returns null for float number 1.5', () => {
    assert.equal(parseServerId(1.5), null);
  });
  it('returns null for Number.MAX_SAFE_INTEGER + 1', () => {
    assert.equal(parseServerId(Number.MAX_SAFE_INTEGER + 1), null);
  });
});
