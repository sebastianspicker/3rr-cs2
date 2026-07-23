/** Renders individual status fields without assuming a complete RCON response. */
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
  return liveStatusIndicator(data).label;
}

export interface LiveStatusIndicator {
  dotClass: 'online' | 'offline' | 'unknown';
  badgeClass: 'badge-connected' | 'badge-disconnected' | 'badge-unknown';
  label: string;
}

/** Keeps every observed-status indicator on the manage page semantically aligned. */
export function liveStatusIndicator(data: LiveStatusResponse): LiveStatusIndicator {
  if (data.partial) {
    return { dotClass: 'unknown', badgeClass: 'badge-unknown', label: 'RCON partial' };
  }
  if (data.error) {
    return { dotClass: 'unknown', badgeClass: 'badge-unknown', label: 'RCON error' };
  }
  if ([data.connected, data.authenticated, data.complete].every(Boolean)) {
    return { dotClass: 'online', badgeClass: 'badge-connected', label: 'RCON authenticated' };
  }
  return { dotClass: 'offline', badgeClass: 'badge-disconnected', label: 'RCON disconnected' };
}

export function displayLiveObserved(data: LiveStatusResponse): string {
  if (data.observed_at) return `RCON observed at ${formatObserved(data.observed_at)}`;
  return `RCON observation unavailable at ${new Date().toLocaleTimeString()}`;
}

export function displayLiveError(error: string | null): string | null {
  return error ? `RCON warning: ${error}` : null;
}
