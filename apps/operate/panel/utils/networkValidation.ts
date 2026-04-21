import dns from 'dns';
import net from 'net';

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
  'fe80:', // IPv6 link-local (fe80::/10) — routable on local segment, may reach internal services
];
const BLOCKED_IPV6 = ['::1', '::'];

// Disallowed resolved ranges checked after DNS resolution to prevent SSRF via DNS rebinding.
// Keep private LAN IPv4 ranges allowed for self-hosted CS2 deployments, but continue
// blocking loopback, link-local/metadata, and unspecified targets.
// Both dotted (::ffff:127.0.0.1) and hex-grouped (::ffff:7f00:1) IPv4-mapped forms are
// checked because the WHATWG URL API normalizes to the hex form, not dotted.
const DISALLOWED_RESOLVED_IP_PREFIXES = [
  '127.', // IPv4 loopback
  '169.254.', // Link-local
  '0.', // Unspecified
  '::ffff:127.', // IPv4-mapped loopback (dotted notation)
  '::ffff:169.254.', // IPv4-mapped link-local (dotted notation)
  '::ffff:0.', // IPv4-mapped unspecified (dotted notation)
  '::ffff:7f', // IPv4-mapped loopback (hex: 0x7f = 127)
  '::ffff:a9fe:', // IPv4-mapped link-local (hex: 0xa9fe = 169.254)
  '::ffff:0:', // IPv4-mapped unspecified (hex: 0x0000)
  'fe80:', // IPv6 link-local (fe80::/10)
];
const DISALLOWED_RESOLVED_IPV6 = ['::1', '::'];

function isDisallowedResolvedIP(ip: string): boolean {
  let check = ip;
  if (net.isIP(ip) === 6) {
    check = normalizeIPv6(ip);
  }
  const lower = check.toLowerCase();

  if (DISALLOWED_RESOLVED_IPV6.includes(lower)) return true;
  if (DISALLOWED_RESOLVED_IP_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;

  // Check fc00::/7 (unique local addresses)
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;

  return false;
}

// Normalize an IPv6 address to canonical form using the WHATWG URL API.
// This catches non-canonical forms like 0:0:0:0:0:0:0:1 (→ ::1) and
// hex IPv4-mapped addresses like ::FFFF:127.0.0.1 (→ ::ffff:7f00:1).
function normalizeIPv6(ip: string): string {
  try {
    return new URL(`http://[${ip}]/`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return ip;
  }
}

export function isBlockedIP(ip: string): boolean {
  let check = ip;
  if (net.isIP(ip) === 6) {
    check = normalizeIPv6(ip);
  }
  const lower = check.toLowerCase();
  if (BLOCKED_IPV6.includes(lower)) return true;
  return BLOCKED_IP_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function isValidServerHost(host: string): boolean {
  if (typeof host !== 'string') return false;
  const value = host.trim();
  if (!value || value.length > 253) return false;
  if (net.isIP(value) !== 0) {
    if (isBlockedIP(value)) return false;
    return true;
  }
  // Reject hostnames that resolve to obvious loopback names
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
}

/**
 * Async version that additionally resolves hostnames via DNS and checks
 * whether the resolved IP falls in a private/reserved range. This prevents
 * SSRF via DNS rebinding where an attacker's hostname initially passes
 * validation but later resolves to an internal IP.
 */
export async function isValidServerHostResolved(host: string): Promise<boolean> {
  if (!isValidServerHost(host)) return false;

  // If the host is already a literal IP, check it directly.
  if (net.isIP(host) !== 0) {
    return !isDisallowedResolvedIP(host);
  }

  // Resolve hostname and verify the resolved IP is not in a private range.
  try {
    const addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) return false;
    for (const { address } of addresses) {
      if (isDisallowedResolvedIP(address)) return false;
    }
  } catch {
    // DNS resolution failed — reject for safety.
    return false;
  }

  return true;
}
