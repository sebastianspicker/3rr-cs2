const MAX_HOSTNAME_LENGTH = 128;

// Strip non-printable, zero-width, and bidirectional override Unicode codepoints
// to prevent confusing UI output from malicious game server hostnames.
const UNSAFE_UNICODE_RE =
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u2028-\u202f\u2060\ufeff\ufff9-\ufffb]/g;

function parseHostnameResponse(text: string, fallback = '–'): string {
  if (typeof text !== 'string') return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  let result: string;
  if (trimmed.includes('=')) {
    const after = trimmed.split('=')[1]?.trim();
    result = after || fallback;
  } else {
    result = trimmed || fallback;
  }
  return result.replace(UNSAFE_UNICODE_RE, '').slice(0, MAX_HOSTNAME_LENGTH);
}

export { parseHostnameResponse };
