import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

const INVALID_CLIENT_IP_KEY = 'invalid-client-ip';

/** Keep malformed proxy input in one bounded rate-limit bucket. */
export function rateLimitClientKey(request: { ip?: string }): string {
  return typeof request.ip === 'string' && isIP(request.ip) !== 0
    ? ipKeyGenerator(request.ip)
    : INVALID_CLIENT_IP_KEY;
}
