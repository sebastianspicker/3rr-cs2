import type { NextFunction, RequestHandler, Response } from 'express';
import rcon from '../../modules/rcon';
import { requireAuthorizedServerId } from '../../utils/serverAccess';
import { RconSecretDecryptError } from '../../utils/rconSecret';
import logger from '../../utils/logger';

export const MAX_TEAM_NAME_LEN = 64;
export const MAX_SAY_MESSAGE_LEN = 256;
export const MAX_RCON_COMMAND_LEN = 512;
export const RCON_FORBIDDEN_SEPARATOR = {
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

// Reject any non-ASCII characters to prevent Unicode-to-ASCII truncation attacks.
// The rcon-srcds library encodes commands as ASCII, silently truncating high bytes.
// A char like U+013B ('\u013B') passes JavaScript-level ';' checks but becomes
// 0x3B (semicolon) after encoding — enabling command separator injection.
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

/** Strip dangerous chars + non-ASCII, trim, then truncate. maxLen applies to the sanitized result. */
export function sanitizeString(s: unknown, maxLen: number): string {
  if (typeof s !== 'string') return '';
  return stripUnsafeNameCharacters(s)
    .replace(NON_ASCII_GLOBAL_RE, '') // Strip non-ASCII to prevent encoding truncation attacks
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
  const lower = trimmed.toLowerCase().split(/\s+/)[0] ?? '';
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

export class RconCommandSequenceError extends Error {
  readonly appliedCommands: string[];
  readonly failedCommand: string;
  readonly failedCommandIndex: number;
  readonly failureReason: string;

  constructor(appliedCommands: readonly string[], failedCommand: string, cause: unknown) {
    const partial = appliedCommands.length > 0;
    super(
      partial
        ? `RCON command sequence failed after ${appliedCommands.length} command(s) applied`
        : 'RCON command sequence failed before any commands were applied'
    );
    this.name = 'RconCommandSequenceError';
    this.appliedCommands = [...appliedCommands];
    this.failedCommand = failedCommand;
    this.failedCommandIndex = appliedCommands.length;
    this.failureReason = cause instanceof Error ? cause.message : String(cause);
  }

  get partial(): boolean {
    return this.appliedCommands.length > 0;
  }
}

export function sendGameRouteError(res: Response, err: unknown, tag = 'game'): void {
  logger.error({ err, tag }, `[${tag}] Error`);
  if (err instanceof RconCommandSequenceError) {
    res.status(500).json({
      error: err.partial
        ? 'RCON command sequence failed after earlier commands were applied; server may be partially updated'
        : 'RCON command sequence failed before any commands were applied',
      partial: err.partial,
      applied_commands: err.appliedCommands,
      failed_command: err.failedCommand,
      failed_command_index: err.failedCommandIndex,
      failure_reason: err.failureReason,
    });
    return;
  }
  if (err instanceof RconSecretDecryptError) {
    res.status(500).json({
      error:
        'Stored RCON credential could not be decrypted; check RCON_SECRET_KEY or saved credential',
      credential_error: err.kind,
    });
    return;
  }
  const message =
    err instanceof Error && /connection|rcon|timed out|unreachable/i.test(err.message)
      ? 'Server unreachable — RCON connection failed'
      : 'Internal server error';
  res.status(500).json({ error: message });
}

export function parseIntBody(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) ? val : Number.NaN;
  }
  if (typeof val !== 'string') return Number.NaN;
  const trimmed = val.trim();
  if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
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
  try {
    await rcon.executeCommand(server_id, cmd);
  } catch (error) {
    logger.warn({ server_id, cmd, error }, '[game] command failed');
    throw error;
  }
}

export function runGameCmdSequence(server_id: string, commands: readonly string[]): Promise<void> {
  const appliedCommands: string[] = [];
  const runAt = (index: number): Promise<void> => {
    const command = commands.at(index);
    if (command === undefined) return Promise.resolve();
    return runGameCmd(server_id, command).then(
      () => {
        appliedCommands.push(command);
        return runAt(index + 1);
      },
      (error: unknown) => {
        throw new RconCommandSequenceError(appliedCommands, command, error);
      }
    );
  };
  return runAt(0);
}

export async function execCfg(server_id: string, cfgName: string): Promise<void> {
  const safe = sanitizeCfgName(cfgName);
  if (!safe) throw new Error('Invalid cfg name');
  await runGameCmd(server_id, `exec ${safe}`);
}

function forwardRouteResult(result: Promise<void>, next: NextFunction): void {
  void result.catch((error: unknown) => {
    next(error);
  });
}

export function makeToggleRoute(action: string, convar: string, msgLabel?: string): RequestHandler {
  return (req, res, next) => {
    forwardRouteResult(
      (async () => {
        try {
          const server_id = requireAuthorizedServerId(req, res);
          if (!server_id) return;
          const value = parseConVarValue(req.body?.value);
          if (value === null) {
            res.status(400).json({ error: 'value must be 0 or 1' });
            return;
          }
          logger.info(
            { user: req.session?.user?.username ?? 'unknown', action, value },
            '[game] action'
          );
          await runGameCmd(server_id, `${convar} ${value}`);
          res
            .status(200)
            .json({ message: `${msgLabel ?? convar} command sent with value ${value}.` });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      })(),
      next
    );
  };
}

export function makeSimpleCmdRoute(
  action: string,
  cmd: string,
  successMsg: string
): RequestHandler {
  return (req, res, next) => {
    forwardRouteResult(
      (async () => {
        try {
          const server_id = requireAuthorizedServerId(req, res);
          if (!server_id) return;
          logger.info({ user: req.session?.user?.username ?? 'unknown', action }, '[game] action');
          await runGameCmd(server_id, cmd);
          res.status(200).json({ message: successMsg });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      })(),
      next
    );
  };
}

export function makeSequenceRoute(
  action: string,
  steps: (string | { cfg: string })[],
  successMsg: string
): RequestHandler {
  return (req, res, next) => {
    forwardRouteResult(
      (async () => {
        try {
          const server_id = requireAuthorizedServerId(req, res);
          if (!server_id) return;
          logger.info({ user: req.session?.user?.username ?? 'unknown', action }, '[game] action');
          const commands = steps.map((step) => {
            if (typeof step === 'string') return step;
            const safe = sanitizeCfgName(step.cfg);
            if (!safe) throw new Error('Invalid cfg name');
            return `exec ${safe}`;
          });
          await runGameCmdSequence(server_id, commands);
          res.status(200).json({ message: successMsg });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      })(),
      next
    );
  };
}

export function makePresetRoute(
  action: string,
  convar: string,
  allowlist: readonly number[]
): RequestHandler {
  return (req, res, next) => {
    forwardRouteResult(
      (async () => {
        try {
          const server_id = requireAuthorizedServerId(req, res);
          if (!server_id) return;
          const n = parseIntBody(req.body?.value);
          if (
            !requireAllowlisted(res, n, allowlist, `value must be one of: ${allowlist.join(', ')}`)
          )
            return;
          logger.info(
            { user: req.session?.user?.username ?? 'unknown', action, value: n },
            '[game] action'
          );
          await runGameCmd(server_id, `${convar} ${n}`);
          res.status(200).json({ message: `${convar} command sent with value ${n}.` });
        } catch (err) {
          sendGameRouteError(res, err, action);
        }
      })(),
      next
    );
  };
}
