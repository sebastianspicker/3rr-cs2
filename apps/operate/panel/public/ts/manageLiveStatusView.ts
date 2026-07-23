/** Applies formatted live status to the DOM while preserving unknown states. */
import { el, formatObserved, setMessage, setText, type LiveStatusResponse } from './manageShared';
import { formatLiveStatus } from './manageLiveStatusFormat';

export function renderLiveStatus(data: LiveStatusResponse): void {
  const view = formatLiveStatus(data);
  setText('live-hostname', view.hostname);
  setText('live-map', view.map);
  setText('live-players', view.players);
  setText('live-bots', view.bots);
  setText('live-max-players', view.maximum);
  setText('live-status-state', view.state);
  setText('live-status-updated', view.updated);
  setText('manage-observed-at', view.updated);
  setText(
    'truth-observed-time',
    data.observed_at ? formatObserved(data.observed_at) : 'Unavailable'
  );
  setText(
    'truth-observed-detail',
    view.error
      ? `${view.state} · ${view.error}`
      : `${view.map} · ${view.players} players · ${view.bots} bots`
  );
  setMessage('live-status-error', view.error);
  // Night Desk truth rail (optional IDs; setText no-ops when absent)
  setText('truth-rail-map', view.map);
  setText('truth-rail-players', view.players);
  setText(
    'truth-rail-observed-at',
    data.observed_at ? formatObserved(data.observed_at) : 'No observation yet'
  );
  if (view.pageTitle) setText('truth-rail-server', view.pageTitle);
  const initialAlert = el<HTMLElement>('#manage-initial-alert');
  if (initialAlert && data.complete && !data.error) initialAlert.hidden = true;
  const dot = el<HTMLElement>('#manage-status-dot');
  if (dot) dot.className = `status-dot ${view.indicator.dotClass}`;
  // Includes #manage-status-badge, #rcon-console-status-badge, #truth-rail-status-badge
  document.querySelectorAll<HTMLElement>('[data-live-status-badge]').forEach((badge) => {
    badge.className = `badge ${view.indicator.badgeClass}`;
    badge.textContent = view.indicator.label;
  });
  if (!view.pageTitle) return;
  const title = el<HTMLElement>('#manage-title');
  if (title) title.textContent = view.pageTitle;
  document.title = `3RR - ${view.pageTitle}`;
}
