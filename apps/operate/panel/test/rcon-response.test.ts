import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHostnameResponse } from '../utils/rconResponse';

describe('parseHostnameResponse', () => {
  it('extracts hostname display text from cvar-style and plain RCON output', () => {
    const cases: Array<[string, string, string]> = [
      ['hostname = My Server', 'My Server', 'spaced equals'],
      ['hostname=MyServer', 'MyServer', 'compact equals'],
      ['My Server Name', 'My Server Name', 'plain text'],
    ];

    for (const [input, expected, label] of cases) {
      assert.equal(parseHostnameResponse(input), expected, label);
    }
  });

  it('uses fallback text when no usable hostname is present', () => {
    const emptyCases: Array<[unknown, string]> = [
      ['', 'empty string'],
      ['   ', 'whitespace only'],
      [42, 'non-string input'],
      ['hostname=', 'empty cvar value'],
      ['=', 'missing key and value'],
    ];

    for (const [input, label] of emptyCases) {
      assert.equal(parseHostnameResponse(input as string), '–', label);
    }
  });

  it('honors caller fallback text for empty hostname displays', () => {
    assert.equal(parseHostnameResponse('', 'N/A'), 'N/A');
  });

  it('removes invisible controls without HTML escaping already-safe text', () => {
    assert.equal(
      parseHostnameResponse('hostname = <b>&amp;\u202eServer</b>'),
      '<b>&amp;Server</b>'
    );
  });

  it('bounds long hostname display text after cleanup', () => {
    assert.equal(parseHostnameResponse(`hostname = \u202e${'a'.repeat(140)}`).length, 128);
  });
});
