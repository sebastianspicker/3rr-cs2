import type { Response } from 'express';
import { currentExecutionOptions } from '../../../shared/executionContext';
import type { RconExecutionOptions } from '../../../integrations/rcon/rconTypes';
import { RconExecutionError } from '../../../integrations/rcon/rconErrors';
import type { RconManager } from '../../../integrations/rcon/rcon';
import logger from '../../../infrastructure/logging';
import { RconSecretDecryptError } from '../../../infrastructure/credentials/rconCredential';
import { sanitizeCfgName } from '../../../integrations/rcon/rconCommandPolicy';

export class RconCommandSequenceError extends Error {
  readonly appliedCommands: string[];
  readonly failedCommand: string;
  readonly failedCommandIndex: number;
  readonly failureReason: string;
  readonly executionError: RconExecutionError | undefined;

  constructor(appliedCommands: readonly string[], failedCommand: string, cause: unknown) {
    const partial = appliedCommands.length > 0;
    super(
      partial
        ? `RCON command sequence failed after ${appliedCommands.length} command(s) applied`
        : 'RCON command sequence failed before any commands were applied'
    );
    this.name = 'RconCommandSequenceError';
    this.executionError = cause instanceof RconExecutionError ? cause : undefined;
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
    res.status(err.executionError?.statusCode ?? 500).json({
      ...(err.executionError
        ? { outcome: err.executionError.outcome, code: err.executionError.name }
        : {}),
      error: err.partial
        ? 'RCON command sequence failed after earlier commands were applied; server may be partially updated'
        : err.executionError?.outcome === 'unknown'
          ? 'RCON command sequence failed; the dispatched command outcome is uncertain'
          : 'RCON command sequence failed before any commands were applied',
      partial: err.partial,
      applied_commands: err.appliedCommands,
      failed_command: err.failedCommand,
      failed_command_index: err.failedCommandIndex,
      failure_reason: err.failureReason,
    });
    return;
  }
  if (err instanceof RconExecutionError && err.cause instanceof RconSecretDecryptError) {
    sendGameRouteError(res, err.cause, tag);
    return;
  }
  if (err instanceof RconExecutionError) {
    res.status(err.statusCode).json({ error: err.message, code: err.name, outcome: err.outcome });
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

export async function runGameCmd(
  rcon: RconManager,
  serverId: string,
  command: string,
  options: RconExecutionOptions = currentExecutionOptions()
): Promise<void> {
  logger.debug({ server_id: serverId, cmd: command }, '[game] executing command');
  try {
    await rcon.executeCommand(serverId, command, options);
  } catch (error) {
    logger.warn({ server_id: serverId, cmd: command, error }, '[game] command failed');
    throw error;
  }
}

export function runGameCmdSequence(
  rcon: RconManager,
  serverId: string,
  commands: readonly string[],
  options: RconExecutionOptions = currentExecutionOptions()
): Promise<void> {
  const deadlineOptions = {
    ...options,
    deadlineAt: options.deadlineAt ?? Date.now() + (rcon.totalDeadlineMs ?? 12_000),
  };
  const appliedCommands: string[] = [];
  const runAt = (index: number): Promise<void> => {
    const command = commands.at(index);
    if (command === undefined) return Promise.resolve();
    return runGameCmd(rcon, serverId, command, deadlineOptions).then(
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

export async function execCfg(rcon: RconManager, serverId: string, cfgName: string): Promise<void> {
  const safeName = sanitizeCfgName(cfgName);
  if (!safeName) throw new Error('Invalid cfg name');
  await runGameCmd(rcon, serverId, `exec ${safeName}`);
}
