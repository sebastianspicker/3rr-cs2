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

const isBlockedIP = (ip: string): boolean => {
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

const isValidServerHost = (host: string): boolean => {
  if (typeof host !== 'string') return false;
  const value = host.trim();
  if (!value || value.length > 253) return false;
  return net.isIP(value) !== 0 ? !isBlockedIP(value) : isValidHostname(value);
};

/**
 * Async version that additionally resolves hostnames via DNS and checks
 * whether the resolved IP falls in a blocked local/control range. This prevents
 * SSRF via DNS rebinding where an attacker's hostname initially passes
 * validation but later resolves to an internal IP.
 */
const isValidServerHostResolved = async (host: string): Promise<boolean> => {
  if (!isValidServerHost(host)) return false;

  // If the host is already a literal IP, check it directly.
  if (net.isIP(host) !== 0) {
    return !isBlockedResolvedIP(host);
  }

  // Resolve hostname and verify the resolved IP is not in a blocked range.
  try {
    const addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) return false;
    for (const { address } of addresses) {
      if (isBlockedResolvedIP(address)) return false;
    }
  } catch {
    // DNS resolution failed — reject for safety.
    return false;
  }

  return true;
};

export { isBlockedIP, isValidServerHost, isValidServerHostResolved };
