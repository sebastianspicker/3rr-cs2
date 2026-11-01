/** Converts hostname command output into bounded operator-facing text. */
import { cleanRconDisplayText } from '../../shared/rconDisplay';

const MAX_HOSTNAME_LENGTH = 128;

function parseHostnameResponse(text: string, fallback = '–'): string {
  if (typeof text !== 'string') return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  // Everything after the first "=" is the name, which may itself contain "=".
  const result = trimmed.includes('=')
    ? trimmed.slice(trimmed.indexOf('=') + 1).trim() || fallback
    : trimmed;
  return cleanRconDisplayText(result, { maxLength: MAX_HOSTNAME_LENGTH });
}

export { parseHostnameResponse };
