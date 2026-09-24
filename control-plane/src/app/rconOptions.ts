/** Validated deployment settings for manager admission and execution budgets. */
import type { RconManagerOptions } from '../integrations/rcon';

export function rconOptionsFromEnvironment(env = process.env): RconManagerOptions {
  const settings = {
    RCON_COMMAND_TIMEOUT_MS: 'commandTimeoutMs',
    RCON_TOTAL_DEADLINE_MS: 'totalDeadlineMs',
    RCON_MAX_QUEUED_PER_SERVER: 'maxQueuedPerServer',
    RCON_MAX_QUEUED_GLOBAL: 'maxQueuedGlobal',
    RCON_STARTUP_CONCURRENCY: 'startupConcurrency',
  } as const;
  const options: RconManagerOptions = {};
  for (const [name, key] of Object.entries(settings)) {
    const raw = env[name];
    if (raw === undefined) continue;
    if (
      !/^[1-9]\d*$/.test(raw) ||
      !Number.isSafeInteger(Number(raw)) ||
      Number(raw) > 2_147_483_647
    ) {
      throw new Error(`${name} must be a positive integer no greater than 2147483647`);
    }
    options[key] = Number(raw);
  }
  return options;
}
