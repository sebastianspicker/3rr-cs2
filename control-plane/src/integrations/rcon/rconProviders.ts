/** Injectable RCON dependencies for persisted credentials and safe network targets. */
import logger from '../../infrastructure/logging';
import type { ServerInfo } from './rconTypes';

export function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function validatedManagerOption(
  name: string,
  value: number | undefined,
  fallback: number
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new RangeError(`${name} must be an integer between 1 and 2147483647`);
  }
  return value;
}

/** Resolves and pins an allowed literal address for one RCON connection attempt. */
export async function resolveAllowedRconAddress(
  server_id: string,
  server: ServerInfo
): Promise<string | null> {
  const { resolveValidServerHost } = await import('./networkValidation');
  const address = await resolveValidServerHost(server.serverIP);
  if (address) return address;
  logger.warn(
    { server_id, serverIP: server.serverIP },
    '[rcon] connect blocked: hostname resolves to a blocked local/control IP'
  );
  return null;
}
