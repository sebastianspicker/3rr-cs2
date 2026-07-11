import type { StatusResponse } from './serverCards';

export function renderPlayerCount(element: HTMLElement, status: StatusResponse): void {
  const humans = status.humans;
  const maximum = status.max_players;
  const state = Number(typeof humans === 'number') * 2 + Number(typeof maximum === 'number');
  if (status.error && state === 0) {
    element.textContent = ' status unavailable';
    return;
  }
  element.textContent = state === 1
    ? ` –/${maximum}`
    : state === 2
      ? ` ${humans}`
      : state === 3
        ? ` ${humans}/${maximum}`
        : ' –/–';
}
