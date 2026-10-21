/** Throttles autocomplete error feedback: one toast per failure streak, pause after a 429. */
export const rateLimitPauseMs = 60_000;

export interface SuggestGate {
  /** False while a 429 pause is active; typing must not keep hitting a limited endpoint. */
  canRequest(now: number): boolean;
  onSuccess(): void;
  /** Records a failure and returns whether this one should be surfaced to the operator. */
  onFailure(status: number | undefined, now: number): boolean;
}

export function createSuggestGate(): SuggestGate {
  let pausedUntil = 0;
  let notified = false;
  return {
    canRequest: (now) => now >= pausedUntil,
    onSuccess() {
      pausedUntil = 0;
      notified = false;
    },
    onFailure(status, now) {
      if (status === 429) pausedUntil = now + rateLimitPauseMs;
      const first = !notified;
      notified = true;
      return first;
    },
  };
}
