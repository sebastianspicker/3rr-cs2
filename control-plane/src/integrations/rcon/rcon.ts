/** Explicit RCON construction boundary. */
import type Database from 'better-sqlite3';
import { createSqlitePasswordProvider } from './rconProviders';
import { RconConnectionLifecycle } from './rconLifecycle';

export type {
  RconExecutionOptions,
  RconDisconnectResult,
  RconInitError,
  RconInitSummary,
  RconShutdownSummary,
  RconObservation,
  RconObservationOptions,
  RconObservedCommand,
} from './rconTypes';
export {
  RconCancelledError,
  RconDeadlineError,
  RconExecutionError,
  RconOverloadError,
} from './rconErrors';
import type { RconManagerOptions } from './rconTypes';

/** Public API marker retained for routes, tests, and application lifecycle code. */
export class RconManager extends RconConnectionLifecycle {}

export function createRconManager(
  db: Database.Database,
  options: RconManagerOptions = {}
): RconManager {
  return new RconManager(createSqlitePasswordProvider(db), db, options);
}
