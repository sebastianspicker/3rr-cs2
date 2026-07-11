import { cleanRconField } from './rconParserDisplay';

export interface ParsedStatus {
  map: string | null;
  humans: number | null;
  bots: number | null;
  maxPlayers: number | null;
}

function parseMap(text: string): string | null {
  const mapMatch = text.match(/^\s*map\s*:\s*([^\r\n]+)/im);
  if (!mapMatch?.[1]) return null;
  return cleanRconField(mapMatch[1]).split(/\s+/)[0] || null;
}

function parsePlayerCounts(text: string): Omit<ParsedStatus, 'map'> {
  const playerLine = text
    .split(/\r?\n/)
    .find((line) => line.trimStart().toLowerCase().startsWith('players'));
  const players = playerLine?.match(/(\d+) humans?,\s*(\d+) bots?/i);
  if (!players?.[1] || !players[2]) return { humans: null, bots: null, maxPlayers: null };
  const maximumMatch = playerLine?.match(/\((\d+) max\)/i);
  const maximumValue = maximumMatch?.at(1);
  const maximum = typeof maximumValue === 'string' ? Number.parseInt(maximumValue, 10) : 0;
  return {
    humans: Number.parseInt(players[1], 10),
    bots: Number.parseInt(players[2], 10),
    maxPlayers: maximum > 0 ? maximum : null,
  };
}

export function parseStatusResponse(text: string): ParsedStatus {
  if (typeof text !== 'string' || !text.trim()) {
    return { map: null, humans: null, bots: null, maxPlayers: null };
  }
  return { map: parseMap(text), ...parsePlayerCounts(text) };
}
