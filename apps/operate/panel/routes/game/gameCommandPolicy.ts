import type { Response } from 'express';

export const MAX_TEAM_NAME_LEN = 64;
export const MAX_SAY_MESSAGE_LEN = 256;
export const MAX_RCON_COMMAND_LEN = 512;

const RCON_FORBIDDEN_SEPARATOR = {
  test(value: string): boolean {
    return [...value].some(
      (char) => char === ';' || char === '\r' || char === '\n' || char === '\0'
    );
  },
};

export const RCON_BLOCKED_COMMANDS = [
  'quit',
  'exit',
  'shutdown',
  'q',
  'killserver',
  'restart',
  'sv_cheats',
  'rcon_password',
  'sv_password',
  'plugin',
  'meta',
  'exec',
  'host_writeconfig',
  'writeid',
  'writeip',
  'log',
  'css_admins_reload',
  'alias',
  'unalias',
  'logaddress_add',
  'logaddress_del',
  'logaddress_delall',
  'sv_downloadurl',
  'sv_rcon_maxfailures',
  'sv_rcon_maxpacketsize',
  'sv_rcon_maxpacketbans',
  'con_logfile',
  'rcon_address',
  'css_plugins_load',
  'css_plugins_unload',
  'sv_setsteamaccount',
];

// rcon-srcds encodes commands as ASCII, so reject Unicode before that conversion.
const NON_ASCII_RE = /[^\x20-\x7e]/;
const NON_ASCII_GLOBAL_RE = /[^\x20-\x7e]/g;
const UNSAFE_NAME_CHARACTERS = new Set(['"', "'", '`', '\\', ';', '|', '{', '}', '%', '$']);

function stripUnsafeNameCharacters(value: string): string {
  return [...value]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x1f && code !== 0x7f && !UNSAFE_NAME_CHARACTERS.has(char);
    })
    .join('');
}

export function parseConVarValue(val: unknown): 0 | 1 | null {
  if (val === 0 || val === '0') return 0;
  if (val === 1 || val === '1') return 1;
  return null;
}

export function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return stripUnsafeNameCharacters(value).replace(NON_ASCII_GLOBAL_RE, '').trim().slice(0, maxLen);
}

export function isRconCommandAllowed(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  const trimmed = command.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_RCON_COMMAND_LEN) return false;
  if (RCON_FORBIDDEN_SEPARATOR.test(trimmed) || NON_ASCII_RE.test(trimmed)) return false;
  const commandName = trimmed.toLowerCase().split(/\s+/)[0] ?? '';
  return !RCON_BLOCKED_COMMANDS.includes(commandName);
}

export function sanitizeCfgName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const value = name.trim();
  return /^[a-zA-Z0-9_.-]+$/.test(value) ? value : null;
}

export function sanitizeBackupFileName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const value = name.trim();
  const hasUnsafePath =
    value.length === 0 || value.includes('/') || value.includes('\\') || value.includes('..');
  if (hasUnsafePath) return null;
  return /^[a-zA-Z0-9_.-]+\.txt$/.test(value) ? value : null;
}

export function parseIntBody(value: unknown): number {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : Number.NaN;
  if (typeof value !== 'string') return Number.NaN;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

export function requireAllowlisted(
  res: Response,
  value: number,
  allowlist: readonly number[],
  message: string
): boolean {
  if (allowlist.includes(value)) return true;
  res.status(400).json({ error: message });
  return false;
}
