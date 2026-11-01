/** Keeps the oldest observation time, so a merged snapshot is never newer than its stalest input. */
export function earliestObservedAt(current: string | null, next: string): string {
  return current && current < next ? current : next;
}
