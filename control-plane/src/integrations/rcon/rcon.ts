/** Explicit RCON construction boundary. */
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
import type { RconManagerOptions, RconServerStore } from './rconTypes';

/** Public API marker retained for routes, tests, and application lifecycle code. */
export class RconManager extends RconConnectionLifecycle {}

export function createRconManager(
  store: RconServerStore,
  options: RconManagerOptions = {}
): RconManager {
  return new RconManager(store, options);
}
