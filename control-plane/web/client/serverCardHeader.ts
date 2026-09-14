/** Builds inventory cells from explicit connected, disconnected, or unknown state. */
import { serverStatusClass, serverStatusLabel } from './serverStatus';
import type { ServerListItem } from './serverTypes';

export function serverDisplayName(server: ServerListItem): string {
  const hostname = String(server.hostname).trim();
  return hostname && hostname !== '-' && hostname !== '–'
    ? hostname
    : `${String(server.serverIP)}:${String(server.serverPort)}`;
}

export function createServerTitle(server: ServerListItem): HTMLElement {
  const header = document.createElement('div');
  header.className = 'card-header server-choice';
  header.setAttribute('role', 'cell');
  const radio = document.createElement('input');
  radio.className = 'server-choice-input';
  radio.type = 'radio';
  radio.name = 'selected-server';
  radio.value = String(server.id);
  radio.id = `server-choice-${String(server.id)}`;
  radio.dataset.serverId = String(server.id);
  const label = document.createElement('label');
  label.htmlFor = radio.id;
  label.className = 'server-choice-label';
  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = serverDisplayName(server);
  label.appendChild(title);
  if (String(server.hostname).trim() === '-' || String(server.hostname).trim() === '–') {
    const fallback = document.createElement('span');
    fallback.className = 'server-choice-fallback';
    fallback.textContent = 'Hostname unavailable';
    label.appendChild(fallback);
  }
  header.append(radio, label);
  return header;
}

export function createStatusIndicator(server: ServerListItem): HTMLElement {
  const statusClass = serverStatusClass(server);
  const status = document.createElement('div');
  status.className = 'server-status-cell server-choice-status';
  status.setAttribute('role', 'cell');
  const statusDot = document.createElement('span');
  const dotClass =
    statusClass === 'connected' ? 'online' : statusClass === 'disconnected' ? 'offline' : 'unknown';
  statusDot.className = `status-dot ${dotClass}`;
  const badge = document.createElement('span');
  const badgeClass =
    statusClass === 'connected'
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
