import type { Response } from 'express';
import rcon from '../../modules/rcon';
import logger from '../../utils/logger';
import { RconSecretDecryptError } from '../../utils/rconSecret';
import { sanitizeCfgName } from './gameCommandPolicy';

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
      ? 'Server unreachable - RCON connection failed'
      : 'Internal server error';
  res.status(500).json({ error: message });
}

export async function runGameCmd(serverId: string, command: string): Promise<void> {
  logger.debug({ server_id: serverId, cmd: command }, '[game] executing command');
  try {
    await rcon.executeCommand(serverId, command);
  } catch (error) {
    logger.warn({ server_id: serverId, cmd: command, error }, '[game] command failed');
    throw error;
  }
}

export function runGameCmdSequence(serverId: string, commands: readonly string[]): Promise<void> {
  const appliedCommands: string[] = [];
  const runAt = (index: number): Promise<void> => {
    const command = commands.at(index);
    if (command === undefined) return Promise.resolve();
    return runGameCmd(serverId, command).then(
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

export async function execCfg(serverId: string, cfgName: string): Promise<void> {
  const safeName = sanitizeCfgName(cfgName);
  if (!safeName) throw new Error('Invalid cfg name');
  await runGameCmd(serverId, `exec ${safeName}`);
}
