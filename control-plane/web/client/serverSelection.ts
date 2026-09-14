/** Keeps the chosen server and its already-requested live observation in sync. */
import { serverDisplayName } from './serverCardHeader';
import type { StatusResponse } from './serverCards';
import type { ServerListItem } from './serverTypes';

let initialized = false;
let selectedServerId: string | null = null;
const serversById = new Map<string, ServerListItem>();
const statusByServerId = new Map<string, StatusResponse>();

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatObserved(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const observed = new Date(value);
  return Number.isNaN(observed.getTime()) ? 'Unknown' : observed.toLocaleTimeString();
}

function displayCount(value: number | null | undefined, noun: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return `Unknown ${noun}s`;
  return `${String(value)} ${noun}${value === 1 ? '' : 's'}`;
}

function renderSelection(): void {
  const selected = selectedServerId ? serversById.get(selectedServerId) : undefined;
  const panel = document.getElementById('selected-server');
  const warning = document.getElementById('selected-server-warning');
  const actions = document.getElementById('selected-server-actions');
  panel?.toggleAttribute('hidden', !selected);
  warning?.toggleAttribute('hidden', !selected);
  actions?.toggleAttribute('hidden', !selected);
  if (!selected || !selectedServerId) return;

  const status = statusByServerId.get(selectedServerId);
  const name = serverDisplayName(selected);
  setText('selected-server-name', name);
  setText(
    'selected-server-observed',
    formatObserved(status ? status.observed_at : selected.observed_at)
  );
  setText('selected-server-map', status?.map ?? 'Unknown');
  setText(
    'selected-server-players',
    `${displayCount(status?.humans, 'human')} · ${displayCount(status?.bots, 'bot')}`
  );

  const prepare = document.getElementById('prepare-selected-server');
  if (prepare instanceof HTMLAnchorElement) {
    prepare.href = `/manage/${encodeURIComponent(selectedServerId)}`;
    prepare.textContent = `Prepare ${name}`;
    prepare.setAttribute('aria-label', `Prepare a session on ${name}`);
  }

  document.querySelectorAll<HTMLElement>('#serverList .server-choice-row').forEach((row) => {
    const isSelected = row.dataset.serverId === selectedServerId;
    row.classList.toggle('is-selected', isSelected);
    row.setAttribute('aria-selected', String(isSelected));
    const radio = row.querySelector<HTMLInputElement>('.server-choice-input');
    if (radio) radio.checked = isSelected;
  });
}

function selectServer(serverId: string): void {
  if (!serversById.has(serverId)) return;
  selectedServerId = serverId;
  renderSelection();
}

export function registerServerChoices(servers: ServerListItem[]): void {
  serversById.clear();
  servers.forEach((server) => serversById.set(String(server.id), server));
  if (!selectedServerId || !serversById.has(selectedServerId)) {
    selectedServerId = servers[0] ? String(servers[0].id) : null;
  }
  renderSelection();
}

export function cacheServerStatus(serverId: string | number, status: StatusResponse): void {
  const id = String(serverId);
  statusByServerId.set(id, status);
  const row = Array.from(
    document.querySelectorAll<HTMLElement>('#serverList .server-choice-row')
  ).find((candidate) => candidate.dataset.serverId === id);
  const time = row?.querySelector<HTMLElement>('.server-choice-time-value');
  if (time) time.textContent = formatObserved(status.observed_at);
  if (selectedServerId === id) renderSelection();
}

export function initServerSelection(): void {
  if (initialized) return;
  initialized = true;
  const list = document.getElementById('serverList');
  list?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches('.server-choice-input')) return;
    selectServer(target.value);
  });
  list?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('a, button, details, input, label, summary')) return;
    const row = target.closest<HTMLElement>('.server-choice-row');
    if (row?.dataset.serverId) selectServer(row.dataset.serverId);
  });
}
