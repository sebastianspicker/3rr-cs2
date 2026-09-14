/** Request lifetime shared by explicitly invoked command helpers. */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ExecutionContext {
  deadlineAt?: number;
  signal?: AbortSignal;
}

export const executionContext = new AsyncLocalStorage<ExecutionContext>();

export function currentExecutionOptions(): ExecutionContext {
  return executionContext.getStore() ?? {};
}
