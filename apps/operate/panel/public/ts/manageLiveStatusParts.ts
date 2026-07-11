import { formatObserved, type LiveStatusResponse } from './manageShared';

export function displayLiveText(value: string | null): string {
  return value ?? '–';
}

export function displayLiveNumber(value: number | null): string {
  return value === null ? '–' : String(value);
}

export function displayLivePlayers(data: LiveStatusResponse): string {
  const state = Number(data.humans !== null) * 2 + Number(data.max_players !== null);
  switch (state) {
    case 1: return `–/${data.max_players}`;
    case 2: return String(data.humans);
    case 3: return `${data.humans}/${data.max_players}`;
    default: return '–';
  }
}

export function displayLiveState(data: LiveStatusResponse): string {
  const authenticated = [data.connected, data.authenticated, data.complete].every(Boolean);
  const candidates: Array<[boolean, string]> = [
    [data.partial, 'RCON partial'],
    [Boolean(data.error), 'RCON error'],
    [authenticated, 'RCON authenticated'],
  ];
  return candidates.find(([active]) => active)?.[1] ?? 'RCON disconnected';
}

export function displayLiveObserved(data: LiveStatusResponse): string {
  if (data.observed_at) return `RCON observed at ${formatObserved(data.observed_at)}`;
  return `RCON observation unavailable at ${new Date().toLocaleTimeString()}`;
}

export function displayLiveError(error: string | null): string | null {
  return error ? `RCON warning: ${error}` : null;
}
