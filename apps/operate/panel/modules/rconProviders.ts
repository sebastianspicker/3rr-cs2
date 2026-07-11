import { better_sqlite_client } from '../db';
import logger from '../utils/logger';
import type { ServerInfo } from './rconTypes';

export function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function sqlitePasswordProvider(serverId: number): string | null {
  const row = better_sqlite_client
    .prepare('SELECT rconPassword FROM servers WHERE id = ?')
    .get(serverId) as { rconPassword: string } | undefined;
  return row?.rconPassword ?? null;
}

export async function isResolvedHostAllowed(
  server_id: string,
  server: ServerInfo
): Promise<boolean> {
  const { isValidServerHostResolved } = await import('../utils/networkValidation');
  if (await isValidServerHostResolved(server.serverIP)) return true;
  logger.warn(
    { server_id, serverIP: server.serverIP },
    '[rcon] connect blocked: hostname resolves to a blocked local/control IP'
  );
  return false;
}
