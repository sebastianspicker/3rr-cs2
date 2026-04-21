import type { RequestHandler, Response } from 'express';
import rcon from '../../modules/rcon';
import { requireAuthorizedServerId } from '../../utils/parseServerId';
import logger from '../../utils/logger';

export const MAX_TEAM_NAME_LEN = 64;
export const MAX_SAY_MESSAGE_LEN = 256;
export const MAX_RCON_COMMAND_LEN = 512;
export const RCON_FORBIDDEN_SEPARATOR = /[;\r\n\x00]/;
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

// Reject any non-ASCII characters to prevent Unicode-to-ASCII truncation attacks.
// The rcon-srcds library encodes commands as ASCII, silently truncating high bytes.
// A char like U+013B ('\u013B') passes JavaScript-level ';' checks but becomes
// 0x3B (semicolon) after encoding — enabling command separator injection.
const NON_ASCII_RE = /[^\x20-\x7e]/g;

export function parseConVarValue(val: unknown): 0 | 1 | null {
  if (val === 0 || val === '0') return 0;
  if (val === 1 || val === '1') return 1;
  return null;
}

/** Strip dangerous chars + non-ASCII, trim, then truncate. maxLen applies to the sanitized result. */
export function sanitizeString(s: unknown, maxLen: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/["'`\\\r\n;|{}%$\x00-\x1f\x7f]/g, '')
    .replace(NON_ASCII_RE, '') // Strip non-ASCII to prevent encoding truncation attacks
    .trim()
    .slice(0, maxLen);
}

export function isRconCommandAllowed(cmd: unknown): boolean {
  if (typeof cmd !== 'string') return false;
  const trimmed = cmd.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_RCON_COMMAND_LEN) return false;
  if (RCON_FORBIDDEN_SEPARATOR.test(trimmed)) return false;
  if (NON_ASCII_RE.test(trimmed)) return false; // Reject non-ASCII to prevent encoding attacks
  // trimmed is non-empty (checked above), so split always has at least one element
  const lower = trimmed.toLowerCase().split(/\s+/)[0]!;
  return !RCON_BLOCKED_COMMANDS.includes(lower);
}

export function sanitizeCfgName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const s = name.trim();
  return /^[a-zA-Z0-9_.-]+$/.test(s) ? s : null;
}

export function sanitizeBackupFileName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const s = name.trim();
  if (!s || s.includes('/') || s.includes('\\') || s.includes('..')) return null;
  return /^[a-zA-Z0-9_.-]+\.txt$/.test(s) ? s : null;
}

export function sendGameRouteError(res: Response, err: unknown, tag = 'game'): void {
  logger.error({ err, tag }, `[${tag}] Error`);
  const message =
    err instanceof Error && /connection|rcon|timed out|unreachable/i.test(err.message)
      ? 'Server unreachable — RCON connection failed'
      : 'Internal server error';
  res.status(500).json({ error: message });
}

export function parseIntBody(val: unknown): number {
  return typeof val === 'number' ? Math.trunc(val) : parseInt(String(val), 10);
}

export function requireAllowlisted(
  res: Response,
  val: number,
  list: readonly number[],
  msg: string
): boolean {
  if (!list.includes(val)) {
    res.status(400).json({ error: msg });
    return false;
  }
  return true;
}

export async function runGameCmd(server_id: string, cmd: string): Promise<void> {
  logger.debug({ server_id, cmd }, '[game] executing command');
  await rcon.executeCommand(server_id, cmd);
}

export async function execCfg(server_id: string, cfgName: string): Promise<void> {
  const safe = sanitizeCfgName(cfgName);
  if (!safe) throw new Error('Invalid cfg name');
  await runGameCmd(server_id, `exec ${safe}`);
}

export function makeToggleRoute(action: string, convar: string, msgLabel?: string): RequestHandler {
  return async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const value = parseConVarValue(req.body?.value);
      if (value === null) {
        return res.status(400).json({ error: 'value must be 0 or 1' });
      }
      logger.info(
        { user: req.session?.user?.username ?? 'unknown', action, value },
        '[game] action'
      );
      await runGameCmd(server_id, `${convar} ${value}`);
      return res.status(200).json({ message: `${msgLabel ?? convar} set to ${value}` });
    } catch (err) {
      return sendGameRouteError(res, err, action);
    }
  };
}

export function makeSimpleCmdRoute(
  action: string,
  cmd: string,
  successMsg: string
): RequestHandler {
  return async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      logger.info({ user: req.session?.user?.username ?? 'unknown', action }, '[game] action');
      await runGameCmd(server_id, cmd);
      return res.status(200).json({ message: successMsg });
    } catch (err) {
      return sendGameRouteError(res, err, action);
    }
  };
}

export function makeSequenceRoute(
  action: string,
  steps: (string | { cfg: string })[],
  successMsg: string
): RequestHandler {
  return async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      logger.info({ user: req.session?.user?.username ?? 'unknown', action }, '[game] action');
      for (const step of steps) {
        if (typeof step === 'string') {
          await runGameCmd(server_id, step);
        } else {
          await execCfg(server_id, step.cfg);
        }
      }
      return res.status(200).json({ message: successMsg });
    } catch (err) {
      return sendGameRouteError(res, err, action);
    }
  };
}

export function makePresetRoute(
  action: string,
  convar: string,
  allowlist: readonly number[]
): RequestHandler {
  return async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const n = parseIntBody(req.body?.value);
      if (!requireAllowlisted(res, n, allowlist, `value must be one of: ${allowlist.join(', ')}`))
        return;
      logger.info(
        { user: req.session?.user?.username ?? 'unknown', action, value: n },
        '[game] action'
      );
      await runGameCmd(server_id, `${convar} ${n}`);
      return res.status(200).json({ message: `${convar} set to ${n}` });
    } catch (err) {
      return sendGameRouteError(res, err, action);
    }
  };
}

export function makeMultiPresetRoute(
  action: string,
  allowlist: readonly number[],
  cmdBuilder: (server_id: string, value: number) => Promise<void>,
  msgBuilder: (value: number) => string
): RequestHandler {
  return async (req, res) => {
    try {
      const server_id = requireAuthorizedServerId(req, res);
      if (!server_id) return;
      const n = parseIntBody(req.body?.value);
      if (!requireAllowlisted(res, n, allowlist, `value must be one of: ${allowlist.join(', ')}`))
        return;
      logger.info(
        { user: req.session?.user?.username ?? 'unknown', action, value: n },
        '[game] action'
      );
      await cmdBuilder(server_id, n);
      return res.status(200).json({ message: msgBuilder(n) });
    } catch (err) {
      return sendGameRouteError(res, err, action);
    }
  };
}
