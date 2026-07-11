import { createStatusHeader } from './serverCardHeader';
import { isServerOnline, serverStatus } from './serverStatus';

export interface ServerListItem {
  id: string | number;
  hostname: string;
  serverIP: string;
  serverPort: string | number;
  connected: boolean;
  authenticated: boolean;
  status?: 'connected' | 'disconnected' | 'unknown' | 'error';
  observed_at?: string | null;
  status_source?: 'not_observed' | 'rcon_connection' | 'rcon_hostname';
  timed_out?: boolean;
  error?: string | null;
}

export interface StatusResponse {
  humans?: number | null;
  max_players?: number | null;
  error?: string | null;
}

function initialPlayerCount(server: ServerListItem): string {
  if (isServerOnline(server)) return '–/–';
  if (server.timed_out) return ' status timed out';
  return serverStatus(server) === 'error' ? ' status unavailable' : '';
}

function createServerActions(server: ServerListItem): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'server-card-actions';
  if (!isServerOnline(server)) {
    const reconnect = document.createElement('button');
    reconnect.className = 'btn btn-sm btn-success reconnect-server';
    reconnect.textContent = 'Reconnect';
    reconnect.setAttribute('aria-label', 'Reconnect to server');
    reconnect.dataset.serverId = String(server.id);
    actions.appendChild(reconnect);
  }
  const manage = document.createElement('a');
  manage.href = `/manage/${encodeURIComponent(String(server.id))}`;
  manage.className = 'btn btn-sm btn-primary';
  manage.textContent = 'Manage';
  manage.setAttribute('aria-label', 'Manage server');
  const remove = document.createElement('button');
  remove.className = 'btn btn-sm btn-danger delete-server';
  remove.textContent = 'Delete';
  remove.setAttribute('aria-label', 'Delete server');
  remove.dataset.serverId = String(server.id);
  actions.append(manage, remove);
  return actions;
}

export function createServerCard(server: ServerListItem): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card server-card mb-3';
  const body = document.createElement('div');
  body.className = 'card-body';
  const address = document.createElement('p');
  address.className = 'status mb-1 server-addr-line';
  address.appendChild(document.createTextNode(`${String(server.serverIP)}:${String(server.serverPort)}`));
  const players = document.createElement('span');
  players.className = 'server-player-count';
  players.dataset.serverId = String(server.id);
  players.textContent = initialPlayerCount(server);
  address.appendChild(players);
  body.append(address, createServerActions(server));
  card.append(createStatusHeader(server), body);
  return card;
}

export function createSkeletonCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'server-card skeleton-card';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML =
    '<div class="card-header"><div class="skeleton-line skeleton-title"></div>' +
    '<div class="skeleton-line skeleton-badge"></div></div><div class="card-body">' +
    '<div class="skeleton-line skeleton-addr"></div><div class="skeleton-actions">' +
    '<div class="skeleton-line skeleton-btn"></div><div class="skeleton-line skeleton-btn"></div>' +
    '</div></div>';
  return card;
}
