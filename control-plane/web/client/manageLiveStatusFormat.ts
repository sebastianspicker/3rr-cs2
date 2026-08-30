/** Converts partial RCON observations into safe live-status display values. */
import type { LiveStatusResponse } from './manageShared';
import {
  displayLiveError,
  displayLiveNumber,
  displayLiveObserved,
  displayLivePlayers,
  displayLiveText,
  liveStatusIndicator,
  type LiveStatusIndicator,
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
  indicator: LiveStatusIndicator;
}

export function formatLiveStatus(data: LiveStatusResponse): LiveStatusView {
  const indicator = liveStatusIndicator(data);
  return {
    hostname: displayLiveText(data.hostname),
    map: displayLiveText(data.map),
    players: displayLivePlayers(data),
    bots: displayLiveNumber(data.bots),
    maximum: displayLiveNumber(data.max_players),
    state: indicator.label,
    updated: displayLiveObserved(data),
    error: displayLiveError(data.error),
    pageTitle: data.hostname,
    indicator,
  };
}
