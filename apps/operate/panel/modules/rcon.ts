/** Stable public facade for the panel's RCON lifecycle collaborators. */
import { sqlitePasswordProvider } from './rconProviders';
import { RconConnectionLifecycle } from './rconLifecycle';

export type {
  RconDisconnectResult,
  RconInitError,
  RconInitSummary,
  RconShutdownSummary,
} from './rconTypes';

/** Public API marker retained for routes, tests, and application lifecycle code. */
export class RconManager extends RconConnectionLifecycle {}

export default new RconManager(sqlitePasswordProvider);
