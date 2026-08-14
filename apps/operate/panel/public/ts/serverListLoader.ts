/** Fetches and renders the server inventory plus live player counts. */
import { fetchJson } from './common';
import {
  createServerCard,
  createSkeletonCard,
  type ServerListItem,
  type StatusResponse,
} from './serverCards';
import { renderPlayerCount } from './serverPlayerCount';
import { isServerOnline } from './serverStatus';

export async function fetchServers(): Promise<void> {
  const list = document.getElementById('serverList');
  if (!list) return;
  list.replaceChildren(createSkeletonCard(), createSkeletonCard());
  list.setAttribute('aria-busy', 'true');
  try {
    const { servers } = await fetchJson<{ servers: ServerListItem[] }>('/api/servers');
    list.replaceChildren();
    list.setAttribute('aria-busy', 'false');
    if (!servers.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-secondary';
      empty.innerHTML = 'No servers configured yet. <a href="/add-server">Add a server</a> to begin.';
      list.appendChild(empty);
      return;
    }
    servers.forEach((server) => {
      list.appendChild(createServerCard(server));
    });
    servers.filter(isServerOnline).forEach((server) => {
      fetchLivePlayerCount(list, server);
    });
  } catch {
    renderLoadError(list);
  }
}

function fetchLivePlayerCount(list: HTMLElement, server: ServerListItem): void {
  void fetchJson<StatusResponse>(`/api/status/${encodeURIComponent(String(server.id))}`)
    .then((status) => {
      const element = playerCountElement(list, server.id);
      if (element) renderPlayerCount(element, status);
    })
    .catch(() => {
      const element = playerCountElement(list, server.id);
      if (!element) return;
      element.textContent = ' status unavailable';
      element.title = 'Live player status unavailable';
    });
}

function playerCountElement(list: HTMLElement, serverId: string | number): HTMLElement | null {
  return list.querySelector<HTMLElement>(
    `.server-player-count[data-server-id="${String(serverId)}"]`
  );
}

function renderLoadError(list: HTMLElement): void {
  list.replaceChildren();
  list.setAttribute('aria-busy', 'false');
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
}
