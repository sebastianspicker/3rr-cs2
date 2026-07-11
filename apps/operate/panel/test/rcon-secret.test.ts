import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptRconSecret,
  encryptRconSecret,
  hasRconSecretKey,
  isEncryptedRconSecret,
  RconSecretDecryptError,
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

function setSecretKey(byte: number): void {
  process.env.RCON_SECRET_KEY = Buffer.alloc(32, byte).toString('base64');
  _resetCachedKey();
}

function assertDecryptFailure(
  action: () => unknown,
  kind: RconSecretDecryptError['kind'],
  pattern: RegExp
): void {
  assert.throws(action, (err: unknown) => {
    assert.ok(err instanceof RconSecretDecryptError);
    assert.equal(err.kind, kind);
    assert.match(err.message, pattern);
    return true;
  });
}

test('encryptRconSecret/decryptRconSecret roundtrip with configured key', () => {
  setSecretKey(7);
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
  setSecretKey(9);
  const encrypted = encryptRconSecret('secret');
  delete process.env.RCON_SECRET_KEY;
  _resetCachedKey();

  assertDecryptFailure(
    () => decryptRconSecret(encrypted),
    'missing_key',
    /RCON_SECRET_KEY is required to decrypt stored RCON passwords/
  );
});

test('decryptRconSecret classifies malformed encrypted payloads', () => {
  setSecretKey(4);

  const cases = [
    'enc:v1:',
    'enc:v1:aa:bb',
    `enc:v1:${'0'.repeat(23)}:${'0'.repeat(32)}:abcd`,
    `enc:v1:${'0'.repeat(24)}:${'z'.repeat(32)}:abcd`,
    `enc:v1:${'0'.repeat(24)}:${'0'.repeat(32)}:not-hex`,
  ];

  for (const payload of cases) {
    assertDecryptFailure(
      () => decryptRconSecret(payload),
      'invalid_format',
      /Invalid encrypted RCON password format/
    );
  }
});

test('decryptRconSecret classifies wrong keys and tampered ciphertext as decrypt failures', () => {
  setSecretKey(5);
  const encrypted = encryptRconSecret('secret');

  setSecretKey(6);
  assertDecryptFailure(
    () => decryptRconSecret(encrypted),
    'decrypt_failed',
    /Encrypted RCON password could not be decrypted/
  );

  setSecretKey(5);
  const [iv, tag, ciphertext] = encrypted.slice('enc:v1:'.length).split(':');
  const tamperedTag = `${tag?.slice(0, -1)}${tag?.endsWith('0') ? '1' : '0'}`;
  const tamperedCiphertext = `${ciphertext?.slice(0, -1)}${ciphertext?.endsWith('0') ? '1' : '0'}`;

  assertDecryptFailure(
    () => decryptRconSecret(`enc:v1:${iv}:${tamperedTag}:${ciphertext}`),
    'decrypt_failed',
    /Encrypted RCON password could not be decrypted/
  );
  assertDecryptFailure(
    () => decryptRconSecret(`enc:v1:${iv}:${tag}:${tamperedCiphertext}`),
    'decrypt_failed',
    /Encrypted RCON password could not be decrypted/
  );
});

test('RCON_SECRET_KEY parse errors are classified as invalid local key errors', () => {
  process.env.RCON_SECRET_KEY = 'not-a-valid-key';
  _resetCachedKey();

  assertDecryptFailure(() => hasRconSecretKey(), 'invalid_key', /RCON_SECRET_KEY must be 32 bytes/);
});
