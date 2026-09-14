/** Fetches, filters, and renders the server inventory plus live player counts. */
import { fetchJson, showToast } from './common';
import { renderRailLoadError, renderRailLoading, renderRailServers } from './opsDeck';
import { createServerCard, createSkeletonCard, type StatusResponse } from './serverCards';
import { renderPlayerCount } from './serverPlayerCount';
import { cacheServerStatus, registerServerChoices } from './serverSelection';
import { isServerOnline, serverStatus, type ServerStatus } from './serverStatus';
import type { ServerListItem } from './serverTypes';

interface ActiveFleetLoad {
  promise: Promise<void>;
}

let activeLoad: ActiveFleetLoad | undefined;
let loadGeneration = 0;
let fleetServerCount = 0;
let hasFleetResults = false;
let controlsInitialized = false;

function setFleetStat(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderFleetStats(servers: ServerListItem[]): void {
  setFleetStat('fleet-total', String(servers.length));
  setFleetStat('fleet-connected', String(servers.filter(isServerOnline).length));
  setFleetStat(
    'fleet-unobserved',
    String(servers.filter((server) => ['unknown', 'error'].includes(serverStatus(server))).length)
  );
  setFleetStat(
    'fleet-disconnected',
    String(servers.filter((server) => serverStatus(server) === 'disconnected').length)
  );
  setFleetStat('fleet-players', servers.some(isServerOnline) ? '…' : 'Unavailable');
}

function selectedStatus(): ServerStatus | 'all' {
  const value = document.getElementById('server-status-filter');
  if (!(value instanceof HTMLSelectElement)) return 'all';
  return ['connected', 'unknown', 'disconnected', 'error'].includes(value.value)
    ? (value.value as ServerStatus)
    : 'all';
}

function searchQuery(): string {
  const search = document.getElementById('server-search');
  return search instanceof HTMLInputElement ? search.value.trim().toLocaleLowerCase() : '';
}

export function applyFleetFilters(): void {
  const list = document.getElementById('serverList');
  if (!list) return;
  const query = searchQuery();
  const status = selectedStatus();
  const cards = Array.from(list.querySelectorAll<HTMLElement>('.server-card:not(.skeleton-card)'));
  let visibleCount = 0;
  cards.forEach((card) => {
    const matchesQuery = !query || (card.dataset.search ?? '').includes(query);
    const matchesStatus = status === 'all' || card.dataset.status === status;
    card.hidden = !(matchesQuery && matchesStatus);
    if (!card.hidden) visibleCount += 1;
  });

  const summary = document.getElementById('fleet-filter-summary');
  if (summary) summary.textContent = `Showing ${visibleCount} of ${fleetServerCount} servers`;
  const hasFilters = Boolean(query) || status !== 'all';
  const emptyFilter = document.getElementById('fleet-empty-filter');
  if (emptyFilter) emptyFilter.hidden = !(hasFleetResults && hasFilters && visibleCount === 0);
  const clearFilters = document.getElementById('fleet-clear-filters');
  if (clearFilters) clearFilters.hidden = !hasFilters;
}

function clearFleetFilters(): void {
  const search = document.getElementById('server-search');
  if (search instanceof HTMLInputElement) search.value = '';
  const status = document.getElementById('server-status-filter');
  if (status instanceof HTMLSelectElement) status.value = 'all';
  applyFleetFilters();
  if (search instanceof HTMLInputElement) search.focus();
}

export function initServerListControls(): void {
  if (controlsInitialized) return;
  controlsInitialized = true;
  document.getElementById('server-search')?.addEventListener('input', applyFleetFilters);
  document.getElementById('server-status-filter')?.addEventListener('change', applyFleetFilters);
  document.getElementById('fleet-clear-filters')?.addEventListener('click', clearFleetFilters);
  const refresh = document.getElementById('fleet-refresh');
  if (refresh instanceof HTMLButtonElement) {
    refresh.addEventListener('click', () => {
      void fetchServers(true);
    });
  }
  applyFleetFilters();
}

async function fetchLivePlayerCount(
  list: HTMLElement,
  server: ServerListItem,
  refresh: boolean,
  generation: number
): Promise<number | null> {
  const suffix = refresh ? '?refresh=1' : '';
  return fetchJson<StatusResponse>(`/api/status/${encodeURIComponent(String(server.id))}${suffix}`)
    .then((status) => {
      if (generation !== loadGeneration) return null;
      cacheServerStatus(server.id, status);
      const element = playerCountElement(list, server.id);
      if (element) renderPlayerCount(element, status);
      return typeof status.humans === 'number' && Number.isFinite(status.humans)
        ? status.humans
        : null;
    })
    .catch(() => {
      if (generation !== loadGeneration) return null;
      const element = playerCountElement(list, server.id);
      if (element) {
        element.textContent = ' status unavailable';
        element.title = 'Live player status unavailable';
      }
      return null;
    });
}

async function loadFleet(refresh: boolean): Promise<void> {
  const list = document.getElementById('serverList');
  if (!list) return;
  const generation = ++loadGeneration;
  if (!hasFleetResults) {
    list.replaceChildren(createSkeletonCard(), createSkeletonCard());
    renderRailLoading();
  }
  list.setAttribute('aria-busy', 'true');
  try {
    const endpoint = refresh ? '/api/servers?refresh=1' : '/api/servers';
    const { servers } = await fetchJson<{ servers: ServerListItem[] }>(endpoint);
    if (generation !== loadGeneration) return;
    renderRailServers(servers);
    renderFleetStats(servers);
    list.replaceChildren();
    fleetServerCount = servers.length;
    hasFleetResults = servers.length > 0;
    if (!servers.length) {
      registerServerChoices([]);
      const empty = document.createElement('div');
      empty.className = 'alert alert-secondary';
      empty.innerHTML =
        'No servers configured yet. <a href="/add-server">Add a server</a> to begin.';
      list.appendChild(empty);
      applyFleetFilters();
      return;
    }
    servers.forEach((server) => {
      list.appendChild(createServerCard(server));
    });
    registerServerChoices(servers);
    applyFleetFilters();

    const pending = servers.filter(isServerOnline);
    const expectedCounts = pending.length;
    const playerCounts: number[] = [];
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, async () => {
        for (let server = pending.shift(); server; server = pending.shift()) {
          const count = await fetchLivePlayerCount(list, server, refresh, generation);
          if (count !== null) playerCounts.push(count);
        }
      })
    );
    if (generation !== loadGeneration) return;
    const total = playerCounts.reduce((sum, count) => sum + count, 0);
    setFleetStat(
      'fleet-players',
      !playerCounts.length
        ? 'Unavailable'
        : playerCounts.length < expectedCounts
          ? `${total} observed · partial`
          : String(total)
    );
  } catch {
    if (generation !== loadGeneration) return;
    renderRailLoadError(() => {
      void fetchServers(refresh);
    });
    if (hasFleetResults) {
      showToast('Fleet refresh failed. Current results remain visible.', 'error');
    } else {
      fleetServerCount = 0;
      registerServerChoices([]);
      renderLoadError(list);
      applyFleetFilters();
    }
  } finally {
    if (generation === loadGeneration) list.setAttribute('aria-busy', 'false');
  }
}

function startFleetLoad(refresh: boolean): Promise<void> {
  const promise = loadFleet(refresh);
  activeLoad = { promise };
  void promise.finally(() => {
    if (activeLoad?.promise === promise) activeLoad = undefined;
  });
  return promise;
}

export function fetchServers(refresh = false): Promise<void> {
  if (!activeLoad) return startFleetLoad(refresh);
  return activeLoad.promise;
}

export function refreshServersAfterMutation(): Promise<void> {
  const current = activeLoad?.promise;
  return current ? current.then(() => startFleetLoad(true)) : startFleetLoad(true);
}

function playerCountElement(list: HTMLElement, serverId: string | number): HTMLElement | null {
  return list.querySelector<HTMLElement>(
    `.server-player-count[data-server-id="${String(serverId)}"]`
  );
}

function renderLoadError(list: HTMLElement): void {
  list.replaceChildren();
  const error = document.createElement('div');
  error.className = 'alert alert-danger';
  error.textContent = 'The server list could not be loaded. ';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn-secondary btn-sm';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => void fetchServers());
  error.appendChild(retry);
  list.appendChild(error);
  [
    'fleet-total',
    'fleet-connected',
    'fleet-unobserved',
    'fleet-disconnected',
    'fleet-players',
  ].forEach((id) => setFleetStat(id, '–'));
}
