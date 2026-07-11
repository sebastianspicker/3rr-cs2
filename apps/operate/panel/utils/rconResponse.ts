import { cleanRconDisplayText } from './rconDisplay';

const MAX_HOSTNAME_LENGTH = 128;

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
  return cleanRconDisplayText(result, { maxLength: MAX_HOSTNAME_LENGTH });
}

export { parseHostnameResponse };
