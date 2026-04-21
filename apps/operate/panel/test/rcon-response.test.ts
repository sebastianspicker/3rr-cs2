import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHostnameResponse } from '../utils/rconResponse';

describe('parseHostnameResponse', () => {
  it('extracts value after "=" separator', () => {
    assert.equal(parseHostnameResponse('hostname = My Server'), 'My Server');
  });
  it('extracts value after "=" with no spaces', () => {
    assert.equal(parseHostnameResponse('hostname=MyServer'), 'MyServer');
  });
  it('returns trimmed text when no "=" present', () => {
    assert.equal(parseHostnameResponse('My Server Name'), 'My Server Name');
  });
  it('returns fallback for empty string', () => {
    assert.equal(parseHostnameResponse(''), '–');
  });
  it('returns fallback for whitespace-only string', () => {
    assert.equal(parseHostnameResponse('   '), '–');
  });
  it('returns custom fallback', () => {
    assert.equal(parseHostnameResponse('', 'N/A'), 'N/A');
  });
  it('returns fallback for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal(parseHostnameResponse(42 as any), '–');
  });
  it('returns fallback when value after "=" is empty', () => {
    assert.equal(parseHostnameResponse('hostname='), '–');
  });
  it('returns fallback for just "="', () => {
    assert.equal(parseHostnameResponse('='), '–');
  });
});
