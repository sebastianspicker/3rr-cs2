/** Verifies RCON credentials encrypt, decrypt, and fail closed under key or payload errors. */
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

function assertDecryptFailureMessage(
  action: () => unknown,
  kind: RconSecretDecryptError['kind'],
  message: string
): void {
  assert.throws(action, (err: unknown) => {
    assert.ok(err instanceof RconSecretDecryptError);
    assert.equal(err.kind, kind);
    assert.equal(err.message, message);
    return true;
  });
}

function encryptedSegments(value: string): [string, string, string] {
  const segments = value.slice('enc:v1:'.length).split(':');
  assert.equal(segments.length, 3);
  return segments as [string, string, string];
}

function encryptedPayload(segments: [string, string, string]): string {
  return `enc:v1:${segments.join(':')}`;
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

test('RCON_SECRET_KEY treats unset and whitespace-only values as unconfigured', () => {
  for (const key of [undefined, ' \t\n ']) {
    if (key === undefined) {
      delete process.env.RCON_SECRET_KEY;
    } else {
      process.env.RCON_SECRET_KEY = key;
    }
    _resetCachedKey();

    assert.equal(hasRconSecretKey(), false);
    assert.equal(encryptRconSecret('plaintext'), 'plaintext');
  }
});

test('RCON_SECRET_KEY accepts lower and upper hex plus Node base64 variants', () => {
  const canonical = Buffer.alloc(32, 0xff).toString('base64');
  const variants = [
    'ab'.repeat(32),
    'AB'.repeat(32),
    canonical,
    canonical.replace(/=+$/, ''),
    Buffer.alloc(32, 0xff).toString('base64url'),
    `${canonical.slice(0, 16)}@@${canonical.slice(16)}`,
  ];

  for (const key of variants) {
    process.env.RCON_SECRET_KEY = key;
    _resetCachedKey();
    assert.equal(hasRconSecretKey(), true);
  }
});

test('RCON_SECRET_KEY rejects non-32-byte values with the exact invalid-key error', () => {
  const message = 'RCON_SECRET_KEY must be 32 bytes (hex-64 or base64-encoded)';
  for (const length of [31, 33]) {
    process.env.RCON_SECRET_KEY = Buffer.alloc(length, 3).toString('base64');
    _resetCachedKey();
    assertDecryptFailureMessage(() => hasRconSecretKey(), 'invalid_key', message);
  }
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

test('decryptRconSecret validates encrypted payload segment count before segments', () => {
  setSecretKey(4);
  const [iv, tag, ciphertext] = encryptedSegments(encryptRconSecret('secret'));
  const message = 'Invalid encrypted RCON password format: expected iv:tag:ciphertext';

  assertDecryptFailureMessage(
    () => decryptRconSecret(`enc:v1:${iv}:${tag}`),
    'invalid_format',
    message
  );
  assertDecryptFailureMessage(
    () => decryptRconSecret(`enc:v1:${iv}:${tag}:${ciphertext}:extra`),
    'invalid_format',
    message
  );
});

test('decryptRconSecret reports the exact invalid segment for empty, length, odd, and non-hex values', () => {
  setSecretKey(4);
  const original = encryptedSegments(encryptRconSecret('secret'));
  const cases: Array<{ name: string; value: string; index: number }> = [
    { name: 'iv', value: '', index: 0 },
    { name: 'tag', value: '', index: 1 },
    { name: 'ciphertext', value: '', index: 2 },
    { name: 'iv', value: '0'.repeat(22), index: 0 },
    { name: 'tag', value: '0'.repeat(30), index: 1 },
    { name: 'iv', value: '0'.repeat(23), index: 0 },
    { name: 'tag', value: '0'.repeat(31), index: 1 },
    { name: 'ciphertext', value: '0', index: 2 },
    { name: 'iv', value: 'z'.repeat(24), index: 0 },
    { name: 'tag', value: 'z'.repeat(32), index: 1 },
    { name: 'ciphertext', value: 'zz', index: 2 },
  ];

  for (const { name, value, index } of cases) {
    const segments = [...original] as [string, string, string];
    segments[index] = value;
    assertDecryptFailureMessage(
      () => decryptRconSecret(encryptedPayload(segments)),
      'invalid_format',
      `Invalid encrypted RCON password format: ${name} is not valid hex`
    );
  }
});

test('decryptRconSecret validates iv then tag before ciphertext when multiple segments fail', () => {
  setSecretKey(4);
  const [iv, , ciphertext] = encryptedSegments(encryptRconSecret('secret'));

  assertDecryptFailureMessage(
    () => decryptRconSecret(`enc:v1:${'z'.repeat(24)}:${'z'.repeat(32)}:zz`),
    'invalid_format',
    'Invalid encrypted RCON password format: iv is not valid hex'
  );
  assertDecryptFailureMessage(
    () => decryptRconSecret(`enc:v1:${iv}:${'z'.repeat(32)}:zz`),
    'invalid_format',
    'Invalid encrypted RCON password format: tag is not valid hex'
  );
  assert.ok(ciphertext.length > 0);
});

test('decryptRconSecret prioritizes a missing key over malformed payload inspection', () => {
  delete process.env.RCON_SECRET_KEY;
  _resetCachedKey();

  assertDecryptFailureMessage(
    () => decryptRconSecret('enc:v1:not:valid'),
    'missing_key',
    'RCON_SECRET_KEY is required to decrypt stored RCON passwords'
  );
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

test('decryptRconSecret accepts uppercase hex before classifying a tampered payload as decrypt failed', () => {
  setSecretKey(5);
  const encrypted = encryptRconSecret('secret');
  const [iv, tag, ciphertext] = encryptedSegments(encrypted);
  const uppercase = encryptedPayload([
    iv.toUpperCase(),
    tag.toUpperCase(),
    ciphertext.toUpperCase(),
  ]);
  assert.equal(decryptRconSecret(uppercase), 'secret');

  const tamperedTag = `${tag.slice(0, -1)}${tag.endsWith('0') ? '1' : '0'}`.toUpperCase();
  assertDecryptFailure(
    () =>
      decryptRconSecret(
        encryptedPayload([iv.toUpperCase(), tamperedTag, ciphertext.toUpperCase()])
      ),
    'decrypt_failed',
    /Encrypted RCON password could not be decrypted/
  );
});

test('RCON_SECRET_KEY parse errors are classified as invalid local key errors', () => {
  process.env.RCON_SECRET_KEY = 'not-a-valid-key';
  _resetCachedKey();

  assertDecryptFailure(() => hasRconSecretKey(), 'invalid_key', /RCON_SECRET_KEY must be 32 bytes/);
});
