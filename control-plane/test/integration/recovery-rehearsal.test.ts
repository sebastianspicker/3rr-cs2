/** Disposable file-level recovery rehearsal for encrypted SQLite credentials. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, test } from 'node:test';
import {
  _resetCachedKey,
  decryptRconSecret,
  encryptRconSecret,
  RconSecretDecryptError,
} from '../../src/infrastructure/credentials/rconCredential';
import { openSecureDatabase } from '../../src/infrastructure/sqlite/databaseFile';
import { runMigrations } from '../../src/infrastructure/sqlite/migrations';

const temporaryDirectories: string[] = [];
const originalKey = process.env.RCON_SECRET_KEY;

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function setKey(key: Buffer): void {
  process.env.RCON_SECRET_KEY = key.toString('hex');
  _resetCachedKey();
}

afterEach(() => {
  if (originalKey === undefined) delete process.env.RCON_SECRET_KEY;
  else process.env.RCON_SECRET_KEY = originalKey;
  _resetCachedKey();
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('recovery rehearsal restores encrypted credentials privately without changing source', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), '3rr-recovery-'));
  temporaryDirectories.push(workspace);
  const sourceDirectory = path.join(workspace, 'source');
  const backupDirectory = path.join(workspace, 'backup');
  const restoreDirectory = path.join(workspace, 'restored-new-location');
  for (const directory of [sourceDirectory, backupDirectory, restoreDirectory]) {
    fs.mkdirSync(directory, { mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }

  const sourcePath = path.join(sourceDirectory, '3rr.db');
  const backupPath = path.join(backupDirectory, '3rr.db');
  const restoredPath = path.join(restoreDirectory, '3rr.db');
  const correctKey = Buffer.alloc(32, 0x31);
  const wrongKey = Buffer.alloc(32, 0x72);
  const plaintext = 'disposable-rcon-recovery-secret';
  setKey(correctKey);

  const sourceDatabase = new Database(sourcePath);
  let encrypted = '';
  try {
    runMigrations(sourceDatabase);
    sourceDatabase.pragma('journal_mode = WAL');
    encrypted = encryptRconSecret(plaintext);
    sourceDatabase
      .prepare('INSERT INTO servers (serverIP, serverPort, rconPassword) VALUES (?, ?, ?)')
      .run('127.0.0.1', 27015, encrypted);
    sourceDatabase.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    sourceDatabase.close();
  }
  fs.chmodSync(sourcePath, 0o600);
  assert.match(encrypted, /^enc:v1:/);

  const sourceChecksumBefore = sha256(sourcePath);
  fs.copyFileSync(sourcePath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, 0o600);
  const backupChecksum = sha256(backupPath);
  assert.equal(backupChecksum, sourceChecksumBefore);
  assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);

  fs.copyFileSync(backupPath, restoredPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(restoredPath, 0o644);
  const restoredDatabase = openSecureDatabase(restoredPath, 'production');
  let storedCredential = '';
  try {
    runMigrations(restoredDatabase);
    storedCredential = (
      restoredDatabase.prepare('SELECT rconPassword FROM servers').get() as {
        rconPassword: string;
      }
    ).rconPassword;
  } finally {
    restoredDatabase.close();
  }

  assert.equal(fs.statSync(restoredPath).mode & 0o777, 0o600);
  assert.equal(sha256(restoredPath), backupChecksum);
  assert.equal(decryptRconSecret(storedCredential), plaintext);

  setKey(wrongKey);
  assert.throws(
    () => decryptRconSecret(storedCredential),
    (error: unknown) =>
      error instanceof RconSecretDecryptError &&
      error.kind === 'decrypt_failed' &&
      /check RCON_SECRET_KEY/.test(error.message)
  );

  assert.equal(sha256(sourcePath), sourceChecksumBefore);
  assert.equal(fs.statSync(sourcePath).mode & 0o777, 0o600);
});

test('recovery rehearsal preserves a stopped database with committed WAL sidecars', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), '3rr-wal-recovery-'));
  temporaryDirectories.push(workspace);
  const source = path.join(workspace, 'source');
  const backup = path.join(workspace, 'backup');
  const restored = path.join(workspace, 'restored');
  for (const directory of [source, backup, restored]) fs.mkdirSync(directory, { mode: 0o700 });
  // Exit without close/checkpoint, modelling a stopped writer after abrupt failure.
  const writer = spawnSync(process.execPath, [
    '-e',
    `
    const Database = require(process.argv[1]);
    const db = new Database(process.argv[2]);
    db.pragma('journal_mode = WAL');
    db.pragma('wal_autocheckpoint = 0');
    db.exec("CREATE TABLE recovery_data (value TEXT); INSERT INTO recovery_data VALUES ('committed');");
    process.exit(0);
  `,
    require.resolve('better-sqlite3'),
    path.join(source, '3rr.db'),
  ]);
  assert.equal(writer.status, 0, writer.stderr.toString());
  assert.ok(fs.statSync(path.join(source, '3rr.db-wal')).size > 0);
  const checksums = new Map<string, string>();
  for (const file of fs.readdirSync(source)) {
    fs.chmodSync(path.join(source, file), 0o600);
    checksums.set(file, sha256(path.join(source, file)));
    for (const destination of [backup, restored]) {
      fs.copyFileSync(
        path.join(source, file),
        path.join(destination, file),
        fs.constants.COPYFILE_EXCL
      );
      fs.chmodSync(path.join(destination, file), 0o600);
      assert.equal(sha256(path.join(destination, file)), checksums.get(file));
      assert.equal(fs.statSync(path.join(destination, file)).mode & 0o777, 0o600);
    }
  }
  const db = new Database(path.join(restored, '3rr.db'));
  try {
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(db.prepare('SELECT value FROM recovery_data').all(), [{ value: 'committed' }]);
  } finally {
    db.close();
  }
  for (const [file, checksum] of checksums) {
    assert.equal(sha256(path.join(source, file)), checksum);
    assert.equal(sha256(path.join(backup, file)), checksum);
  }
});
