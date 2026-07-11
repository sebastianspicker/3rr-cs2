import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import type { requireAllowlisted as RequireAllowlistedFn } from '../routes/game/helpers';
import { mockModule } from './mock-module';

// Mock the modules that trigger native-dependency side effects (better-sqlite3)
// before importing helpers.ts. This allows testing the pure functions in helpers
// without requiring a working native SQLite binding.
before(() => {
  mockModule('../db.js', { better_sqlite_client: {} });
  mockModule('../modules/rcon.js', { default: { executeCommand: async () => '' } });
});

// Dynamic import after mocks are set up
let parseConVarValue: (val: unknown) => 0 | 1 | null;
let sanitizeString: (s: unknown, maxLen: number) => string;
let isRconCommandAllowed: (cmd: unknown) => boolean;
let sanitizeCfgName: (name: unknown) => string | null;
let sanitizeBackupFileName: (name: unknown) => string | null;
let parseIntBody: (val: unknown) => number;
let requireAllowlisted: typeof RequireAllowlistedFn;
let MAX_RCON_COMMAND_LEN: number;

before(async () => {
  const helpers = await import('../routes/game/helpers');
  parseConVarValue = helpers.parseConVarValue;
  sanitizeString = helpers.sanitizeString;
  isRconCommandAllowed = helpers.isRconCommandAllowed;
  sanitizeCfgName = helpers.sanitizeCfgName;
  sanitizeBackupFileName = helpers.sanitizeBackupFileName;
  parseIntBody = helpers.parseIntBody;
  requireAllowlisted = helpers.requireAllowlisted;
  MAX_RCON_COMMAND_LEN = helpers.MAX_RCON_COMMAND_LEN;
});

describe('parseConVarValue', () => {
  it('accepts only canonical binary convar values for toggle routes', () => {
    const accepted: Array<[unknown, 0 | 1]> = [
      [0, 0],
      ['0', 0],
      [1, 1],
      ['1', 1],
    ];

    for (const [input, expected] of accepted) {
      assert.equal(parseConVarValue(input), expected, String(input));
    }
  });

  it('rejects non-binary toggle values instead of guessing', () => {
    const rejected = [2, null, undefined, 'abc'];

    for (const input of rejected) {
      assert.equal(parseConVarValue(input), null, String(input));
    }
  });
});

describe('sanitizeString', () => {
  it('keeps safe operator text unchanged', () => {
    assert.equal(sanitizeString('hello world', 100), 'hello world');
  });
  it('removes quotes and backslashes before embedding command arguments', () => {
    assert.equal(sanitizeString('he"llo\\wo\'rld', 100), 'helloworld');
  });
  it('removes command delimiters from admin-supplied text', () => {
    assert.equal(sanitizeString('a\rb\nc;d', 100), 'abcd');
  });
  it('bounds command argument text to the route limit', () => {
    assert.equal(sanitizeString('abcdefgh', 5), 'abcde');
  });
  it('rejects non-string input instead of coercing it into commands', () => {
    assert.equal(sanitizeString(42, 100), '');
  });
  it('trims surrounding whitespace before command construction', () => {
    assert.equal(sanitizeString('  hello  ', 100), 'hello');
  });
});

describe('isRconCommandAllowed', () => {
  it('allows safe ASCII commands operators are expected to send', () => {
    assert.equal(isRconCommandAllowed('status'), true);
    assert.equal(isRconCommandAllowed('mp_maxrounds 30'), true);
  });
  it('blocks process-control, credential, and plugin commands', () => {
    assert.equal(isRconCommandAllowed('quit'), false);
    assert.equal(isRconCommandAllowed('exit'), false);
    assert.equal(isRconCommandAllowed('shutdown'), false);
    assert.equal(isRconCommandAllowed('rcon_password'), false);
    assert.equal(isRconCommandAllowed('plugin'), false);
  });
  it('blocks denylisted commands regardless of case', () => {
    assert.equal(isRconCommandAllowed('QUIT'), false);
    assert.equal(isRconCommandAllowed('Quit'), false);
  });
  it('blocks command separators so one request cannot smuggle multiple commands', () => {
    assert.equal(isRconCommandAllowed('status; quit'), false);
    assert.equal(isRconCommandAllowed('status\nquit'), false);
    assert.equal(isRconCommandAllowed('status\rquit'), false);
  });
  it('blocks non-ASCII commands consistently across repeated checks', () => {
    const command = 'say \u013Bquit';
    assert.equal(isRconCommandAllowed(command), false);
    assert.equal(isRconCommandAllowed(command), false);
    assert.equal(isRconCommandAllowed(command), false);
  });
  it('blocks empty commands', () => {
    assert.equal(isRconCommandAllowed(''), false);
  });
  it('blocks non-string command input', () => {
    assert.equal(isRconCommandAllowed(42), false);
    assert.equal(isRconCommandAllowed(null), false);
  });
  it('blocks commands exceeding the protocol length limit', () => {
    assert.equal(isRconCommandAllowed('x'.repeat(MAX_RCON_COMMAND_LEN + 1)), false);
  });
  it('allows commands at exactly the protocol length limit', () => {
    assert.equal(isRconCommandAllowed('x'.repeat(MAX_RCON_COMMAND_LEN)), true);
  });
});

describe('sanitizeCfgName', () => {
  it('allows cfg names that can be passed to exec directly', () => {
    assert.equal(sanitizeCfgName('live.cfg'), 'live.cfg');
    assert.equal(sanitizeCfgName('warmup'), 'warmup');
  });
  it('rejects path traversal and nested paths before exec', () => {
    assert.equal(sanitizeCfgName('../../malicious.cfg'), null);
    assert.equal(sanitizeCfgName('path/to/cfg'), null);
  });
  it('rejects empty cfg names', () => {
    assert.equal(sanitizeCfgName(''), null);
  });
  it('rejects non-string cfg names', () => {
    assert.equal(sanitizeCfgName(42), null);
  });
});

describe('sanitizeBackupFileName', () => {
  it('allows backup restore filenames produced by MatchZy', () => {
    assert.equal(sanitizeBackupFileName('backup_001.txt'), 'backup_001.txt');
  });
  it('rejects non-backup file extensions', () => {
    assert.equal(sanitizeBackupFileName('backup.cfg'), null);
  });
  it('rejects path traversal before restore commands are sent', () => {
    assert.equal(sanitizeBackupFileName('../../../etc/passwd.txt'), null);
  });
  it('rejects non-string backup filenames', () => {
    assert.equal(sanitizeBackupFileName(null), null);
  });
});

describe('parseIntBody', () => {
  it('accepts whole integer route values including zero', () => {
    assert.equal(parseIntBody(42), 42);
    assert.equal(parseIntBody(' 42 '), 42);
    assert.equal(parseIntBody('0'), 0);
  });

  it('rejects strings that only partly look numeric before allowlist checks', () => {
    assert.ok(Number.isNaN(parseIntBody('5abc')));
    assert.ok(Number.isNaN(parseIntBody('abc5')));
  });

  it('rejects non-integer or missing numeric values', () => {
    assert.ok(Number.isNaN(parseIntBody('5.5')));
    assert.ok(Number.isNaN(parseIntBody(5.5)));
    assert.ok(Number.isNaN(parseIntBody('')));
    assert.ok(Number.isNaN(parseIntBody('abc')));
    assert.ok(Number.isNaN(parseIntBody(null)));
  });
});

describe('requireAllowlisted', () => {
  it('allows configured preset values without writing an error response', () => {
    const mockRes = { status: () => ({ json: () => {} }) } as never;
    assert.equal(requireAllowlisted(mockRes, 5, [1, 5, 10], 'error'), true);
  });
  it('rejects out-of-policy preset values with the route error message', () => {
    let sentStatus = 0;
    let sentJson = {};
    const mockRes = {
      status: (s: number) => {
        sentStatus = s;
        return {
          json: (j: unknown) => {
            sentJson = j as Record<string, unknown>;
          },
        };
      },
    } as never;
    assert.equal(requireAllowlisted(mockRes, 99, [1, 5, 10], 'bad value'), false);
    assert.equal(sentStatus, 400);
    assert.deepEqual(sentJson, { error: 'bad value' });
  });
});
