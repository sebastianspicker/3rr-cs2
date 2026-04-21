import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptRconSecret,
  encryptRconSecret,
  hasRconSecretKey,
  isEncryptedRconSecret,
  _resetCachedKey,
} from '../utils/rconSecret';

const ORIGINAL_RCON_SECRET_KEY = process.env.RCON_SECRET_KEY;

beforeEach(() => {
  if (ORIGINAL_RCON_SECRET_KEY == null) {
    delete process.env.RCON_SECRET_KEY;
  } else {
    process.env.RCON_SECRET_KEY = ORIGINAL_RCON_SECRET_KEY;
  }
  _resetCachedKey();
});

test('encryptRconSecret/decryptRconSecret roundtrip with configured key', () => {
  process.env.RCON_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
  assert.equal(hasRconSecretKey(), true);

  const encrypted = encryptRconSecret('my-secret-rcon-password');
  assert.equal(isEncryptedRconSecret(encrypted), true);
  assert.notEqual(encrypted, 'my-secret-rcon-password');

  const decrypted = decryptRconSecret(encrypted);
  assert.equal(decrypted, 'my-secret-rcon-password');
});

test('encryptRconSecret returns plaintext when no key is configured', () => {
  delete process.env.RCON_SECRET_KEY;
  const value = encryptRconSecret('plaintext');
  assert.equal(value, 'plaintext');
  assert.equal(isEncryptedRconSecret(value), false);
});

test('decryptRconSecret throws for encrypted payload without key', () => {
  process.env.RCON_SECRET_KEY = Buffer.alloc(32, 9).toString('base64');
  _resetCachedKey();
  const encrypted = encryptRconSecret('secret');
  delete process.env.RCON_SECRET_KEY;
  _resetCachedKey();

  assert.throws(
    () => decryptRconSecret(encrypted),
    /RCON_SECRET_KEY is required to decrypt stored RCON passwords/
  );
});
