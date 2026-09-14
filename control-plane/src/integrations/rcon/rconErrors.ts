/** Typed execution failures that HTTP callers can map without parsing messages. */
import type { RconExecutionOutcome } from './rconTypes';

export class RconExecutionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly outcome: RconExecutionOutcome,
    options: { cause?: unknown } = {}
  ) {
    super(message, options);
    this.name = 'RconExecutionError';
  }
}

export class RconOverloadError extends RconExecutionError {
  constructor(message = 'RCON command queue is full') {
    super(message, 503, 'not_sent');
    this.name = 'RconOverloadError';
  }
}

export class RconDeadlineError extends RconExecutionError {
  constructor(outcome: RconExecutionOutcome = 'not_sent') {
    super('RCON command deadline exceeded', 504, outcome);
    this.name = 'RconDeadlineError';
  }
}

export class RconCancelledError extends RconExecutionError {
  constructor(outcome: RconExecutionOutcome = 'not_sent') {
    super('RCON command cancelled', 499, outcome);
    this.name = 'AbortError';
  }
}

export function executionError(error: unknown, sent: boolean): RconExecutionError {
  if (error instanceof RconExecutionError) {
    if (sent && error.outcome === 'not_sent') {
      if (error instanceof RconDeadlineError) return new RconDeadlineError('unknown');
      if (error instanceof RconCancelledError) return new RconCancelledError('unknown');
      return new RconExecutionError(error.message, error.statusCode, 'unknown', { cause: error });
    }
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new RconExecutionError(message, 502, sent ? 'unknown' : 'not_sent', { cause: error });
}
