/** Explicit RCON construction boundary. */
import type Database from 'better-sqlite3';
import { createSqlitePasswordProvider } from './rconProviders';
import { RconConnectionLifecycle } from './rconLifecycle';

export type {
  RconDisconnectResult,
  RconInitError,
  RconInitSummary,
  RconShutdownSummary,
} from './rconTypes';

/** Public API marker retained for routes, tests, and application lifecycle code. */
export class RconManager extends RconConnectionLifecycle {}

export function createRconManager(db: Database.Database): RconManager {
  return new RconManager(createSqlitePasswordProvider(db), db);
}
