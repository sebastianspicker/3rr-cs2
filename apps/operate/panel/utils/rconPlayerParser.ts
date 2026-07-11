import { cleanRconField, MAX_RCON_FIELD_LENGTH } from './rconParserDisplay';

const STEAMID64_BASE = 76561197960265728n;
export const RCON_USERID_RE = /^\d{1,5}$/;

export interface ParsedPlayer {
  userid: string;
  name: string;
  steam_account_id: string | null;
  steam_id64: string | null;
}

export function steamAccountIdToSteamId64(accountId: string): string | null {
  if (!/^\d+$/.test(accountId)) return null;
  return (STEAMID64_BASE + BigInt(accountId)).toString();
}

function buildPlayer(userid: string, rawName: string, line: string): ParsedPlayer | null {
  const cleanUserid = userid.trim();
  if (!RCON_USERID_RE.test(cleanUserid)) return null;
  const name = cleanRconField(rawName.replace(/^"+|"+$/g, ''), MAX_RCON_FIELD_LENGTH);
  if (!name) return null;
  const accountId = line.match(/\[U:1:(\d+)\]/)?.[1] ?? null;
  return {
    userid: cleanUserid,
    name,
    steam_account_id: accountId,
    steam_id64: accountId ? steamAccountIdToSteamId64(accountId) : null,
  };
}

function parseTokenPlayer(line: string): ParsedPlayer | null {
  const tokens = line.replace(/^#\s*/, '').split(/\s+/);
  const userid = tokens.shift() ?? '';
  if (!RCON_USERID_RE.test(userid)) return null;
  const terminator = tokens.findIndex(
    (token) =>
      /^\[U:1:\d+\]$/.test(token) || /^STEAM_[0-5]:/i.test(token) || /^\d{1,2}:\d{2}$/.test(token)
  );
  const nameTokens = terminator < 0 ? tokens : tokens.slice(0, terminator);
  return buildPlayer(userid, nameTokens.join(' '), line);
}

function parsePlayerLine(line: string): ParsedPlayer | null {
  const quoted = line.match(/^#?\s*(\d{1,5})\s+"([^"]+)"/);
  if (quoted?.[1] && quoted[2]) return buildPlayer(quoted[1], quoted[2], line);
  const colonPrefix = line.match(/^#?\s*(\d{1,5})\s*:\s*/);
  if (colonPrefix) {
    const userid = colonPrefix.at(1);
    if (typeof userid !== 'string') return parseTokenPlayer(line);
    const remainder = line.slice(colonPrefix[0].length);
    const separator = remainder.indexOf(':');
    const name = (separator >= 0 ? remainder.slice(separator + 1) : remainder).trim();
    if (name.length >= 1 && name.length <= 512) return buildPlayer(userid, name, line);
  }
  return parseTokenPlayer(line);
}

function isPlayerDataLine(line: string): boolean {
  if (!line || /^[-=]+$/.test(line)) return false;
  return !/^(users?|userid|name|uniqueid)\b/i.test(line) && /\d/.test(line);
}

export function parseUsersResponse(text: string): ParsedPlayer[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const players = new Map<string, ParsedPlayer>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!isPlayerDataLine(line)) continue;
    const parsed = parsePlayerLine(line);
    if (parsed) players.set(parsed.userid, parsed);
  }
  return [...players.values()].sort(
    (a, b) => Number.parseInt(a.userid, 10) - Number.parseInt(b.userid, 10)
  );
}
