/** Renders independent live-status regions from the shared display model. */
import { el, formatObserved, setMessage, setText, type LiveStatusResponse } from './manageShared';
import type { LiveStatusView } from './manageLiveStatusFormat';

export function renderStatusMetrics(view: LiveStatusView): void {
  setText('live-hostname', view.hostname);
  setText('live-map', view.map);
  setText('live-players', view.players);
  setText('live-bots', view.bots);
  setText('live-max-players', view.maximum);
}

export function renderStatusFeedback(view: LiveStatusView): void {
  setText('live-status-state', view.state);
  setText('live-status-updated', view.updated);
  setMessage('live-status-error', view.error);
}

export function renderTruthRail(data: LiveStatusResponse, view: LiveStatusView): void {
  const observedAt = data.observed_at ? formatObserved(data.observed_at) : 'Unavailable';
  setText('manage-observed-at', view.updated);
  setText('truth-observed-time', observedAt);
  setText(
    'truth-observed-detail',
    view.error
      ? `${view.state} · ${view.error}`
      : `${view.map} · ${view.players} players · ${view.bots} bots`
  );
  setText('truth-rail-map', view.map);
  setText('truth-rail-players', view.players);
  setText('truth-rail-observed-at', data.observed_at ? observedAt : 'No observation yet');
  if (view.pageTitle) setText('truth-rail-server', view.pageTitle);
}

export function renderStatusIndicators(data: LiveStatusResponse, view: LiveStatusView): void {
  const initialAlert = el<HTMLElement>('#manage-initial-alert');
  if (initialAlert && data.complete && !data.error) initialAlert.hidden = true;
  const dot = el<HTMLElement>('#manage-status-dot');
  if (dot) dot.className = `status-dot ${view.indicator.dotClass}`;
  document.querySelectorAll<HTMLElement>('[data-live-status-badge]').forEach((badge) => {
    badge.className = `badge ${view.indicator.badgeClass}`;
    badge.textContent = view.indicator.label;
  });
}

export function renderPageTitle(view: LiveStatusView): void {
  if (!view.pageTitle) return;
  const title = el<HTMLElement>('#manage-title');
  if (title) title.textContent = view.pageTitle;
  document.title = `3RR - ${view.pageTitle}`;
}
