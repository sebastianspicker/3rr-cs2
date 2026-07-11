import { el, setMessage, setText, type LiveStatusResponse } from './manageShared';
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
  setMessage('live-status-error', view.error);
  if (!view.pageTitle) return;
  const title = el<HTMLElement>('#manage-title');
  if (title) title.textContent = view.pageTitle;
  document.title = `CS2 Panel — ${view.pageTitle}`;
}
