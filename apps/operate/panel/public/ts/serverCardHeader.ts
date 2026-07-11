import { serverStatusClass, serverStatusLabel } from './serverStatus';
import type { ServerListItem } from './serverCards';

export function createStatusHeader(server: ServerListItem): HTMLElement {
  const statusClass = serverStatusClass(server);
  const header = document.createElement('div');
  header.className = 'card-header';
  const title = document.createElement('h3');
  title.className = 'card-title';
  const statusDot = document.createElement('span');
  const dotClass = statusClass === 'connected' ? 'online' : statusClass === 'disconnected' ? 'offline' : 'unknown';
  statusDot.className = `status-dot ${dotClass}`;
  title.append(statusDot, document.createTextNode(String(server.hostname)));
  const badge = document.createElement('span');
  const badgeClass = statusClass === 'connected'
    ? 'badge-connected'
    : statusClass === 'disconnected'
      ? 'badge-disconnected'
      : 'badge-unknown';
  badge.className = `badge ${badgeClass}`;
  badge.textContent = serverStatusLabel(server);
  if (server.error) badge.title = server.error;
  header.append(title, badge);
  return header;
}
