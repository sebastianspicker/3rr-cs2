import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRconDisplayText } from '../utils/rconDisplay';

describe('cleanRconDisplayText', () => {
  it('preserves HTML special characters and already-escaped text', () => {
    assert.equal(cleanRconDisplayText('<b>&amp;"quoted"</b>'), '<b>&amp;"quoted"</b>');
  });

  it('removes control, zero-width, and bidirectional display controls', () => {
    assert.equal(cleanRconDisplayText('a\x00b\u200bc\u202ed\ufeffe'), 'abcde');
  });

  it('trims only when requested', () => {
    assert.equal(cleanRconDisplayText('  Server Name  '), '  Server Name  ');
    assert.equal(cleanRconDisplayText('  Server Name  ', { trim: true }), 'Server Name');
  });

  it('truncates after removing unsafe display characters', () => {
    assert.equal(cleanRconDisplayText('\u202eabcdef', { maxLength: 4 }), 'abcd');
  });
});
