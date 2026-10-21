/** Request lifetime shared by explicitly invoked command helpers. */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ExecutionContext {
  deadlineAt?: number;
  signal?: AbortSignal;
  /** Correlates every log line of one HTTP request; also sent as X-Request-Id. */
  requestId?: string;
  /** Set once access to a server has been authorised for this request. */
  serverId?: string;
}

export const executionContext = new AsyncLocalStorage<ExecutionContext>();

export function currentExecutionOptions(): ExecutionContext {
  return executionContext.getStore() ?? {};
}
