/** Credential conversion is atomic and repeatable without changing the schema. */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { test } from 'node:test';
import { encryptStoredRconPasswords } from '../../src/infrastructure/sqlite/bootstrap';
import {
  _resetCachedKey,
  decryptRconSecret,
} from '../../src/infrastructure/credentials/rconCredential';

test('credential conversion rolls back every row on failure and is repeatable', () => {
  const previousKey = process.env.RCON_SECRET_KEY;
  process.env.RCON_SECRET_KEY = '12'.repeat(32);
  _resetCachedKey();
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE servers (id INTEGER PRIMARY KEY, rconPassword TEXT NOT NULL);
      INSERT INTO servers VALUES (1, 'fixture-one'), (2, 'fixture-two');
      PRAGMA user_version = 3;
      CREATE TRIGGER reject_second BEFORE UPDATE ON servers WHEN NEW.id = 2
      BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END;`);
    const before = db.prepare('SELECT * FROM servers ORDER BY id').all();
    assert.throws(() => encryptStoredRconPasswords(db), /fixture write failure/);
    assert.deepEqual(db.prepare('SELECT * FROM servers ORDER BY id').all(), before);
    db.exec('DROP TRIGGER reject_second');
    assert.equal(encryptStoredRconPasswords(db), 2);
    const converted = db.prepare('SELECT rconPassword FROM servers ORDER BY id').all() as Array<{
      rconPassword: string;
    }>;
    assert.deepEqual(
      converted.map((row) => decryptRconSecret(row.rconPassword)),
      ['fixture-one', 'fixture-two']
    );
    assert.equal(encryptStoredRconPasswords(db), 0);
    assert.deepEqual(db.prepare('SELECT rconPassword FROM servers ORDER BY id').all(), converted);
    assert.equal(db.pragma('user_version', { simple: true }), 3);
  } finally {
    db.close();
    if (previousKey === undefined) delete process.env.RCON_SECRET_KEY;
    else process.env.RCON_SECRET_KEY = previousKey;
    _resetCachedKey();
  }
});
