import type { LiveStatusResponse } from './manageShared';
import {
  displayLiveError,
  displayLiveNumber,
  displayLiveObserved,
  displayLivePlayers,
  displayLiveState,
  displayLiveText,
} from './manageLiveStatusParts';

export interface LiveStatusView {
  hostname: string;
  map: string;
  players: string;
  bots: string;
  maximum: string;
  state: string;
  updated: string;
  error: string | null;
  pageTitle: string | null;
}

export function formatLiveStatus(data: LiveStatusResponse): LiveStatusView {
  return {
    hostname: displayLiveText(data.hostname),
    map: displayLiveText(data.map),
    players: displayLivePlayers(data),
    bots: displayLiveNumber(data.bots),
    maximum: displayLiveNumber(data.max_players),
    state: displayLiveState(data),
    updated: displayLiveObserved(data),
    error: displayLiveError(data.error),
    pageTitle: data.hostname,
  };
}
