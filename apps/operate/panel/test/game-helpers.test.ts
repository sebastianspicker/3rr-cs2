import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { requireAllowlisted as RequireAllowlistedFn } from '../routes/game/helpers';

// mock.module() requires Node >= 22.3. Skip the entire file on older runtimes.
const [major] = process.versions.node.split('.').map(Number);
if (major! < 22) {
  console.log('# Skipping game-helpers tests: mock.module requires Node >= 22');
  process.exit(0);
}

// Mock the modules that trigger native-dependency side effects (better-sqlite3)
// before importing helpers.ts. This allows testing the pure functions in helpers
// without requiring a working native SQLite binding.
before(() => {
  mock.module('../db.js', { namedExports: { better_sqlite_client: {} } });
  mock.module('../modules/rcon.js', {
    defaultExport: { executeCommand: async () => '' },
  });
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
  it('returns 0 for number 0', () => assert.equal(parseConVarValue(0), 0));
  it('returns 0 for string "0"', () => assert.equal(parseConVarValue('0'), 0));
  it('returns 1 for number 1', () => assert.equal(parseConVarValue(1), 1));
  it('returns 1 for string "1"', () => assert.equal(parseConVarValue('1'), 1));
  it('returns null for number 2', () => assert.equal(parseConVarValue(2), null));
  it('returns null for null', () => assert.equal(parseConVarValue(null), null));
  it('returns null for undefined', () => assert.equal(parseConVarValue(undefined), null));
  it('returns null for "abc"', () => assert.equal(parseConVarValue('abc'), null));
});

describe('sanitizeString', () => {
  it('returns normal string unchanged', () => {
    assert.equal(sanitizeString('hello world', 100), 'hello world');
  });
  it('strips quotes and backslashes', () => {
    assert.equal(sanitizeString('he"llo\\wo\'rld', 100), 'helloworld');
  });
  it('strips newlines and semicolons', () => {
    assert.equal(sanitizeString('a\rb\nc;d', 100), 'abcd');
  });
  it('truncates to max length', () => {
    assert.equal(sanitizeString('abcdefgh', 5), 'abcde');
  });
  it('returns empty string for non-string input', () => {
    assert.equal(sanitizeString(42, 100), '');
  });
  it('trims whitespace', () => {
    assert.equal(sanitizeString('  hello  ', 100), 'hello');
  });
});

describe('isRconCommandAllowed', () => {
  it('allows normal commands', () => {
    assert.equal(isRconCommandAllowed('status'), true);
    assert.equal(isRconCommandAllowed('mp_maxrounds 30'), true);
  });
  it('blocks blocked commands', () => {
    assert.equal(isRconCommandAllowed('quit'), false);
    assert.equal(isRconCommandAllowed('exit'), false);
    assert.equal(isRconCommandAllowed('shutdown'), false);
    assert.equal(isRconCommandAllowed('rcon_password'), false);
    assert.equal(isRconCommandAllowed('plugin'), false);
  });
  it('blocks blocked commands case-insensitively', () => {
    assert.equal(isRconCommandAllowed('QUIT'), false);
    assert.equal(isRconCommandAllowed('Quit'), false);
  });
  it('blocks commands with separators', () => {
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
  it('blocks empty string', () => {
    assert.equal(isRconCommandAllowed(''), false);
  });
  it('blocks non-string input', () => {
    assert.equal(isRconCommandAllowed(42), false);
    assert.equal(isRconCommandAllowed(null), false);
  });
  it('blocks commands exceeding max length', () => {
    assert.equal(isRconCommandAllowed('x'.repeat(MAX_RCON_COMMAND_LEN + 1)), false);
  });
  it('allows command at exactly max length', () => {
    assert.equal(isRconCommandAllowed('x'.repeat(MAX_RCON_COMMAND_LEN)), true);
  });
});

describe('sanitizeCfgName', () => {
  it('allows valid cfg names', () => {
    assert.equal(sanitizeCfgName('live.cfg'), 'live.cfg');
    assert.equal(sanitizeCfgName('warmup'), 'warmup');
  });
  it('rejects path separators', () => {
    assert.equal(sanitizeCfgName('../../malicious.cfg'), null);
    assert.equal(sanitizeCfgName('path/to/cfg'), null);
  });
  it('rejects empty string', () => {
    assert.equal(sanitizeCfgName(''), null);
  });
  it('rejects non-string', () => {
    assert.equal(sanitizeCfgName(42), null);
  });
});

describe('sanitizeBackupFileName', () => {
  it('allows valid .txt filenames', () => {
    assert.equal(sanitizeBackupFileName('backup_001.txt'), 'backup_001.txt');
  });
  it('rejects non-.txt files', () => {
    assert.equal(sanitizeBackupFileName('backup.cfg'), null);
  });
  it('rejects path traversal', () => {
    assert.equal(sanitizeBackupFileName('../../../etc/passwd.txt'), null);
  });
  it('rejects non-string', () => {
    assert.equal(sanitizeBackupFileName(null), null);
  });
});

describe('parseIntBody', () => {
  it('returns number directly', () => assert.equal(parseIntBody(42), 42));
  it('parses string number', () => assert.equal(parseIntBody('42'), 42));
  it('returns NaN for non-numeric string', () => assert.ok(isNaN(parseIntBody('abc'))));
  it('returns NaN for null', () => assert.ok(isNaN(parseIntBody(null))));
});

describe('requireAllowlisted', () => {
  it('returns true for value in list', () => {
    const mockRes = { status: () => ({ json: () => {} }) } as never;
    assert.equal(requireAllowlisted(mockRes, 5, [1, 5, 10], 'error'), true);
  });
  it('returns false and sends 400 for value not in list', () => {
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
