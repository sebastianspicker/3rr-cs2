/** Builds inventory cells from explicit connected, disconnected, or unknown state. */
import { serverStatusClass, serverStatusLabel } from './serverStatus';
import type { ServerListItem } from './serverCards';

export function createServerTitle(server: ServerListItem): HTMLElement {
  const header = document.createElement('div');
  header.className = 'card-header';
  header.setAttribute('role', 'cell');
  const title = document.createElement('h3');
  title.className = 'card-title';
  const hostname = String(server.hostname).trim();
  title.textContent = hostname && hostname !== '-' && hostname !== '–'
    ? hostname
    : `Server ${String(server.id)}`;
  header.appendChild(title);
  return header;
}

export function createStatusIndicator(server: ServerListItem): HTMLElement {
  const statusClass = serverStatusClass(server);
  const status = document.createElement('div');
  status.className = 'server-status-cell';
  status.setAttribute('role', 'cell');
  const statusDot = document.createElement('span');
  const dotClass = statusClass === 'connected' ? 'online' : statusClass === 'disconnected' ? 'offline' : 'unknown';
  statusDot.className = `status-dot ${dotClass}`;
  const badge = document.createElement('span');
  const badgeClass = statusClass === 'connected'
    ? 'badge-connected'
    : statusClass === 'disconnected'
      ? 'badge-disconnected'
      : 'badge-unknown';
  badge.className = `badge ${badgeClass}`;
  badge.textContent = serverStatusLabel(server);
  status.append(statusDot, badge);
  if (server.error) {
    const detail = document.createElement('span');
    detail.id = `server-${String(server.id)}-status-detail`;
    detail.className = 'visually-hidden';
    detail.textContent = server.error;
    badge.setAttribute('aria-describedby', detail.id);
    status.appendChild(detail);
  }
  return status;
}
