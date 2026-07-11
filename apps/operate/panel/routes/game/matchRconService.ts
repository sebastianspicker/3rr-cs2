import rcon from '../../modules/rcon';
import { recordRconCommand } from '../../utils/rconHistory';
import logger from '../../utils/logger';
import { isRconCommandAllowed } from './helpers';

export function validatedRconCommand(value: unknown): string | null {
  if (!isRconCommandAllowed(value) || typeof value !== 'string') return null;
  return value.trim();
}

export async function executeRecordedCommand(
  serverId: string,
  userId: number,
  command: string
): Promise<Record<string, unknown>> {
  const output = await rcon.executeCommand(serverId, command);
  try {
    recordRconCommand(userId, serverId, command);
    return {
      message: 'Command sent.',
      output: output || undefined,
      command_sent: true,
      history_recorded: true,
      partial: false,
    };
  } catch (error) {
    logger.warn(
      { err: error, server_id: serverId },
      '[rcon] command sent but history persistence failed'
    );
    return {
      message: 'Command sent, but history was not recorded.',
      output: output || undefined,
      command_sent: true,
      history_recorded: false,
      partial: true,
    };
  }
}
