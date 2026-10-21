/** Short, non-reversible tag of a stored password hash, kept in the session to detect password changes. */
import crypto from 'node:crypto';

export function credentialFingerprint(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 32);
}
