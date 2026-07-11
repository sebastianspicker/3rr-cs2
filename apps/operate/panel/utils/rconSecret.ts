import crypto from 'node:crypto';

const ENC_PREFIX = 'enc:v1:';
const KEY_BYTES = 32;
const IV_HEX_CHARS = 24;
const TAG_HEX_CHARS = 32;
const HEX_RE = /^[0-9a-fA-F]+$/;

type RconSecretDecryptErrorKind =
  | 'missing_key'
  | 'invalid_key'
  | 'invalid_format'
  | 'decrypt_failed';

class RconSecretDecryptError extends Error {
  readonly kind: RconSecretDecryptErrorKind;

  constructor(kind: RconSecretDecryptErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RconSecretDecryptError';
    this.kind = kind;
  }
}

const parseKey = (raw: string | undefined): Buffer | null => {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  try {
    const key = Buffer.from(trimmed, 'base64');
    if (key.length === KEY_BYTES) return key;
  } catch {
    // fall through
  }

  throw new RconSecretDecryptError(
    'invalid_key',
    'RCON_SECRET_KEY must be 32 bytes (hex-64 or base64-encoded)'
  );
};

let cachedKey: Buffer | null | undefined;

const getRconSecretKey = (): Buffer | null => {
  if (cachedKey === undefined) {
    cachedKey = parseKey(process.env.RCON_SECRET_KEY);
  }
  return cachedKey;
};

const hasRconSecretKey = (): boolean => {
  return getRconSecretKey() !== null;
};

const isEncryptedRconSecret = (value: string): boolean => {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
};

const encryptRconSecret = (plaintext: string | null | undefined): string => {
  const text = String(plaintext ?? '');
  const key = getRconSecretKey();
  if (!key) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
};

const parseHexSegment = (
  name: string,
  value: string | undefined,
  expectedChars?: number
): Buffer => {
  if (
    !value ||
    (expectedChars !== undefined && value.length !== expectedChars) ||
    value.length % 2 !== 0 ||
    !HEX_RE.test(value)
  ) {
    throw new RconSecretDecryptError(
      'invalid_format',
      `Invalid encrypted RCON password format: ${name} is not valid hex`
    );
  }
  return Buffer.from(value, 'hex');
};

const decryptRconSecret = (storedValue: string | null | undefined): string => {
  if (typeof storedValue !== 'string') return '';
  if (!isEncryptedRconSecret(storedValue)) return storedValue;

  const key = getRconSecretKey();
  if (!key) {
    throw new RconSecretDecryptError(
      'missing_key',
      'RCON_SECRET_KEY is required to decrypt stored RCON passwords'
    );
  }

  const payload = storedValue.slice(ENC_PREFIX.length);
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (payload.split(':').length !== 3) {
    throw new RconSecretDecryptError(
      'invalid_format',
      'Invalid encrypted RCON password format: expected iv:tag:ciphertext'
    );
  }

  const iv = parseHexSegment('iv', ivHex, IV_HEX_CHARS);
  const tag = parseHexSegment('tag', tagHex, TAG_HEX_CHARS);
  const ciphertext = parseHexSegment('ciphertext', dataHex);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: TAG_HEX_CHARS / 2,
    });
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    throw new RconSecretDecryptError(
      'decrypt_failed',
      'Encrypted RCON password could not be decrypted; check RCON_SECRET_KEY or stored credential',
      { cause: err }
    );
  }
};

/** Reset the cached key — for testing only. */
const _resetCachedKey = (): void => {
  cachedKey = undefined;
};

export {
  decryptRconSecret,
  encryptRconSecret,
  hasRconSecretKey,
  isEncryptedRconSecret,
  RconSecretDecryptError,
  _resetCachedKey,
};
