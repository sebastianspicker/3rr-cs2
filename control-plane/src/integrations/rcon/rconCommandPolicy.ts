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
  'css_rcon',
  '_restart',
  'sv_shutdown',
  'sv_logfile',
  'sv_log_onefile',
];

// Every verb in these families changes RCON access, log destinations, loaded
// plugins, or runs another file.
export const RCON_BLOCKED_PREFIXES = ['sv_rcon_', 'logaddress_', 'plugin_', 'exec'];

// `css_plugins <sub>` can load or unload plugins; only listing them is read-only.
const READ_ONLY_PLUGIN_COMMAND_RE = /^css_plugins(\s+list)?$/i;

export const RCON_BLOCKED_SUMMARY = [
  ...RCON_BLOCKED_COMMANDS,
  ...RCON_BLOCKED_PREFIXES.map((prefix) => `${prefix}*`),
  'css_plugins (except list)',
].join(', ');

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

// The console tokenizer unquotes words and `+`/`-` mark bind-style variants of a
// command, so compare the bare verb.
function normalizeCommandName(token: string): string {
  return token
    .replace(/["']/g, '')
    .replace(/^[+-]+/, '')
    .toLowerCase();
}

// Source also ends a word at `{}()':` or a quote and drops `//` comments, so the
// engine may read a shorter verb than the first whitespace-separated token.
function tokenizerVerb(command: string): string {
  const word = /^[^\s"'(){}:]*/.exec(command.replace(/^["'+-]+/, ''))?.[0] ?? '';
  return normalizeCommandName(word.split('//', 1)[0] ?? '');
}

function isBlockedCommandName(commandName: string): boolean {
  return (
    RCON_BLOCKED_COMMANDS.includes(commandName) ||
    RCON_BLOCKED_PREFIXES.some((prefix) => commandName.startsWith(prefix))
  );
}

export function isRconCommandAllowed(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  const trimmed = command.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_RCON_COMMAND_LEN) return false;
  if (RCON_FORBIDDEN_SEPARATOR.test(trimmed) || NON_ASCII_RE.test(trimmed)) return false;
  const commandNames = [
    normalizeCommandName(trimmed.split(/\s+/)[0] ?? ''),
    tokenizerVerb(trimmed),
  ];
  if (commandNames.some(isBlockedCommandName)) return false;
  return !commandNames.includes('css_plugins') || READ_ONLY_PLUGIN_COMMAND_RE.test(trimmed);
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
