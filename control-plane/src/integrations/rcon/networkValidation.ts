/** Rejects unsafe RCON endpoints and pins DNS results before connections are made. */
import dns from 'node:dns';
import net from 'node:net';

// Blocked IP ranges: loopback, link-local/cloud-metadata, unspecified.
// Private LAN ranges (10/8, 172.16/12, 192.168/16) are intentionally allowed
// because CS2 servers commonly run on internal networks.
const BLOCKED_IP_PREFIXES = [
  '127.', // IPv4 loopback
  '169.254.', // Link-local / cloud instance metadata (AWS/GCP/Azure IMDS)
  '0.', // Unspecified
  '::ffff:127.', // IPv4-mapped IPv6 loopback (mixed notation)
  '::ffff:169.254.', // IPv4-mapped IPv6 link-local / IMDS (mixed notation)
  '::ffff:0.', // IPv4-mapped IPv6 unspecified (mixed notation)
  '::ffff:7f', // IPv4-mapped IPv6 loopback (hex: 0x7f = 127)
  '::ffff:a9fe:', // IPv4-mapped IPv6 link-local / IMDS (hex: 0xa9fe = 169.254)
  '::ffff:0:', // IPv4-mapped IPv6 unspecified (hex: 0x0000 = 0.0.x.x)
];
const BLOCKED_IPV6 = ['::1', '::'];

// Normalize an IPv6 address to canonical form using the WHATWG URL API.
// This catches non-canonical forms like 0:0:0:0:0:0:0:1 and hex IPv4-mapped addresses.
const normalizeIPv6 = (ip: string): string => {
  try {
    return new URL(`http://[${ip}]/`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return ip;
  }
};

const isIPv6LinkLocal = (ip: string): boolean => {
  if (net.isIP(ip) !== 6) return false;
  const firstGroup = normalizeIPv6(ip).split(':', 1)[0];
  if (!firstGroup) return false;
  const value = Number.parseInt(firstGroup, 16);
  return Number.isInteger(value) && value >= 0xfe80 && value <= 0xfebf;
};

// IPv4-compatible (::a.b.c.d), NAT64 (64:ff9b::/96) and 6to4 (2002::/16) addresses
// carry an IPv4 address that some hosts route to; check that address too.
const embeddedIPv4 = (ip: string): string | null => {
  if (net.isIP(ip) !== 6) return null;
  const [head = '', tail = ''] = normalizeIPv6(ip).toLowerCase().split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const groups = [
    ...headGroups,
    ...Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0'),
    ...tailGroups,
  ].map((group) => Number.parseInt(group, 16));
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group))) return null;
  const v4 = (high: number, low: number): string =>
    [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const zeroMiddle = g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if (g0 === 0 && g1 === 0 && zeroMiddle) return v4(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b && zeroMiddle) return v4(g6, g7);
  if (g0 === 0x2002) return v4(g1, g2);
  return null;
};

const isBlockedIP = (ip: string): boolean => {
  const embedded = embeddedIPv4(ip);
  if (embedded && isBlockedIP(embedded)) return true;
  let check = ip;
  if (net.isIP(ip) === 6) {
    check = normalizeIPv6(ip);
  }
  const lower = check.toLowerCase();

  if (BLOCKED_IPV6.includes(lower)) return true;
  if (isIPv6LinkLocal(lower)) return true;
  return BLOCKED_IP_PREFIXES.some((prefix) => lower.startsWith(prefix));
};

const isBlockedResolvedIP = (ip: string): boolean => {
  if (isBlockedIP(ip)) return true;

  const normalized = net.isIP(ip) === 6 ? normalizeIPv6(ip).toLowerCase() : ip.toLowerCase();
  return /^f[cd][0-9a-f]{2}:/.test(normalized);
};

const isValidHostname = (value: string): boolean => {
  if (value === 'localhost') return false;
  const labels = value.split('.');
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[A-Za-z0-9-]+$/.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-')
  );
};

/** Why a host is refused before any lookup: malformed, or a blocked literal address. */
const serverHostRejection = (host: string): 'invalid' | 'blocked' | null => {
  if (typeof host !== 'string') return 'invalid';
  const value = host.trim();
  if (!value || value.length > 253) return 'invalid';
  // IPv6 zone ids (`::1%lo`) defeat canonicalisation and are never needed for a game server.
  if (value.includes('%')) return 'invalid';
  if (net.isIP(value) !== 0) return isBlockedIP(value) ? 'blocked' : null;
  return isValidHostname(value) ? null : 'invalid';
};

const isValidServerHost = (host: string): boolean => serverHostRejection(host) === null;

const firstAllowedResolvedAddress = (
  addresses: ReadonlyArray<{ address: string }>
): string | null => {
  if (addresses.length === 0) return null;
  if (!addresses.every(({ address }) => !isBlockedResolvedIP(address))) return null;
  return addresses[0]?.address ?? null;
};

/**
 * Resolves a permitted server host once and returns the literal address that
 * callers must use for their connection.  Passing the original hostname to a
 * later network API would allow that API to perform a second lookup after the
 * validation result, reopening the DNS-rebinding boundary.
 */
const resolveValidServerHost = async (host: string): Promise<string | null> => {
  if (!isValidServerHost(host)) return null;

  // If the host is already a literal IP, check it directly.
  if (net.isIP(host) !== 0) {
    return isBlockedResolvedIP(host) ? null : host;
  }

  // Resolve hostname and verify the resolved IP is not in a blocked range.
  try {
    const addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
    return firstAllowedResolvedAddress(addresses);
  } catch {
    // DNS resolution failed - reject for safety.
    return null;
  }
};

const isValidServerHostResolved = async (host: string): Promise<boolean> =>
  (await resolveValidServerHost(host)) !== null;

export {
  isBlockedIP,
  isValidServerHost,
  isValidServerHostResolved,
  resolveValidServerHost,
  serverHostRejection,
};
