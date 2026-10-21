/** Up/down recall of previously sent RCON commands, newest first, with the draft preserved. */
export interface CommandRecall {
  /** Replaces the remembered server history; commands sent in this page session stay on top. */
  setHistory(commands: string[]): void;
  remember(command: string): void;
  /** Returns the command to show, or null when there is nothing to move to. */
  older(currentValue: string): string | null;
  newer(): string | null;
  reset(): void;
}

export function createCommandRecall(): CommandRecall {
  let stored: string[] = [];
  let sessionSent: string[] = [];
  let merged: string[] = [];
  let position = -1;
  let draft = '';

  function rebuild(): void {
    merged = [...new Set([...sessionSent, ...stored])];
  }

  return {
    setHistory(commands) {
      stored = commands;
      rebuild();
    },
    remember(command) {
      sessionSent = [command, ...sessionSent.filter((item) => item !== command)];
      rebuild();
      position = -1;
    },
    older(currentValue) {
      if (position + 1 >= merged.length) return null;
      if (position === -1) draft = currentValue;
      position += 1;
      return merged[position] ?? null;
    },
    newer() {
      if (position === -1) return null;
      position -= 1;
      return position === -1 ? draft : (merged[position] ?? null);
    },
    reset() {
      position = -1;
    },
  };
}
