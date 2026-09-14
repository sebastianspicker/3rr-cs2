/** Builds server cards without trusting incomplete status as a healthy connection. */
import { createServerTitle, createStatusIndicator } from './serverCardHeader';
import { isServerOnline, serverStatus } from './serverStatus';
import type { ServerListItem } from './serverTypes';

export interface StatusResponse {
  hostname?: string | null;
  map?: string | null;
  humans?: number | null;
  bots?: number | null;
  max_players?: number | null;
  connected?: boolean;
  authenticated?: boolean;
  partial?: boolean;
  complete?: boolean;
  observed_at?: string | null;
  error?: string | null;
}

function initialPlayerCount(server: ServerListItem): string {
  if (isServerOnline(server)) return '–/–';
  if (server.timed_out) return 'Timed out';
  return serverStatus(server) === 'error' ? 'Unavailable' : 'Not observed';
}

function createServerActions(server: ServerListItem, playerCount: HTMLElement): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'server-card-actions';
  const endpoint = `${String(server.serverIP)}:${String(server.serverPort)}`;
  let reconnect: HTMLButtonElement | null = null;
  if (!isServerOnline(server)) {
    reconnect = document.createElement('button');
    reconnect.className = 'btn btn-sm btn-secondary reconnect-server';
    reconnect.textContent = 'Reconnect';
    reconnect.setAttribute('aria-label', `Reconnect to ${endpoint}`);
    reconnect.dataset.serverId = String(server.id);
  }
  const manage = document.createElement('a');
  manage.href = `/manage/${encodeURIComponent(String(server.id))}`;
  manage.className = 'btn btn-sm btn-primary';
  manage.textContent = 'Manage';
  manage.setAttribute('aria-label', `Manage ${endpoint}`);

  const actionMenu = document.createElement('details');
  actionMenu.className = 'server-actions-menu server-overflow';
  const actionMenuSummary = document.createElement('summary');
  actionMenuSummary.textContent = 'More';
  actionMenuSummary.setAttribute('aria-label', `More actions for ${endpoint}`);
  const remove = document.createElement('button');
  remove.className = 'btn btn-sm btn-danger delete-server';
  remove.textContent = 'Delete';
  remove.setAttribute('aria-label', `Remove ${endpoint}`);
  remove.dataset.serverId = String(server.id);
  remove.dataset.serverLabel = endpoint;
  const playerSummary = document.createElement('span');
  playerSummary.className = 'server-overflow-players';
  playerSummary.append('Players ', playerCount);
  const actionMenuContent = document.createElement('div');
  actionMenuContent.className = 'server-overflow-menu';
  actionMenuContent.append(playerSummary, manage);
  if (reconnect) actionMenuContent.appendChild(reconnect);
  actionMenuContent.appendChild(remove);
  actionMenu.append(actionMenuSummary, actionMenuContent);
  actions.appendChild(actionMenu);
  return actions;
}

function formatLastCheck(server: ServerListItem): string {
  if (server.timed_out) return 'Probe timed out';
  if (!server.observed_at) return 'Unknown';
  const observed = new Date(server.observed_at);
  return Number.isNaN(observed.getTime()) ? 'Unknown' : observed.toLocaleTimeString();
}

export function createServerCard(server: ServerListItem): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card server-card server-choice-row mb-3';
  card.setAttribute('role', 'row');
  card.dataset.serverId = String(server.id);
  const endpoint = `${String(server.serverIP)}:${String(server.serverPort)}`;
  const hostname = String(server.hostname).trim();
  card.dataset.status = serverStatus(server);
  card.dataset.search = `${hostname} ${endpoint}`.toLocaleLowerCase();
  const address = document.createElement('div');
  address.className = 'server-address-cell';
  address.setAttribute('role', 'cell');
  address.setAttribute('aria-label', 'Address');
  address.textContent = endpoint;
  const players = document.createElement('span');
  players.className = 'server-player-count';
  players.setAttribute('aria-label', 'Players');
  players.dataset.serverId = String(server.id);
  players.textContent = initialPlayerCount(server);
  address.classList.add('server-choice-endpoint');
  const lastCheck = document.createElement('div');
  lastCheck.className = 'server-choice-time';
  lastCheck.setAttribute('role', 'cell');
  lastCheck.setAttribute('aria-label', 'Last check');
  const observed = document.createElement('span');
  observed.className = 'server-choice-time-value';
  observed.textContent = formatLastCheck(server);
  lastCheck.append(observed, createServerActions(server, players));
  card.append(createServerTitle(server), address, createStatusIndicator(server), lastCheck);
  return card;
}

export function createSkeletonCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'server-card skeleton-card';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML =
    '<div class="card-header"><div class="skeleton-line skeleton-title"></div></div>' +
    '<div class="server-status-cell"><div class="skeleton-line skeleton-badge"></div></div>' +
    '<div class="skeleton-line skeleton-addr"></div><div class="skeleton-line skeleton-count"></div>' +
    '<div class="skeleton-actions">' +
    '<div class="skeleton-line skeleton-btn"></div><div class="skeleton-line skeleton-btn"></div>' +
    '</div>';
  return card;
}
