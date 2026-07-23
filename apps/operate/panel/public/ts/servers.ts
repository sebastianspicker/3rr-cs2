/** Loads server cards and represents failed status checks as unknown rather than offline. */
import { fetchJson, sendPostRequest, initToast, showToast, toastError, showConfirm } from './common';
import {
  createServerCard,
  createSkeletonCard,
  type ServerListItem,
  type StatusResponse,
} from './serverCards';
import { renderPlayerCount } from './serverPlayerCount';
import { isServerOnline } from './serverStatus';

interface ServersResponse {
  servers: ServerListItem[];
}

function playerCountElement(list: HTMLElement, serverId: string | number): HTMLElement | null {
  return list.querySelector<HTMLElement>(
    `.server-player-count[data-server-id="${String(serverId)}"]`
  );
}

function fetchLivePlayerCount(list: HTMLElement, server: ServerListItem): void {
  void fetchJson<StatusResponse>(`/api/status/${encodeURIComponent(String(server.id))}`)
    .then(status => {
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

async function fetchServers(): Promise<void> {
  const list = document.getElementById('serverList');
  if (!list) return;
  list.replaceChildren(createSkeletonCard(), createSkeletonCard());
  list.setAttribute('aria-busy', 'true');
  try {
    const { servers } = await fetchJson<ServersResponse>('/api/servers');
    list.replaceChildren();
    list.setAttribute('aria-busy', 'false');
    if (!servers.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-secondary';
      empty.innerHTML = 'No servers configured yet. <a href="/add-server">Add a server</a> to begin.';
      list.appendChild(empty);
      return;
    }
    servers.forEach(server => {
      list.appendChild(createServerCard(server));
    });
    servers.filter(isServerOnline).forEach(server => {
      fetchLivePlayerCount(list, server);
    });
  } catch {
    list.replaceChildren();
    list.setAttribute('aria-busy', 'false');
    const error = document.createElement('div');
    error.className = 'alert alert-danger';
    error.textContent = 'The server list could not be loaded. ';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-secondary btn-sm';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => { void fetchServers(); });
    error.appendChild(retry);
    list.appendChild(error);
  }
}

async function handleServerAction(event: Event): Promise<void> {
  const htmlElement = event.target as HTMLElement;
  const reconnect = htmlElement.closest<HTMLElement>('.reconnect-server');
  const remove = htmlElement.closest<HTMLElement>('.delete-server');
  if (reconnect?.dataset.serverId) {
    sendPostRequest('/api/reconnect-server', { server_id: reconnect.dataset.serverId })
      .then(() => {
        showToast('Reconnected successfully.', 'success');
        return fetchServers();
      })
      .catch(toastError('Reconnect failed.'));
    return;
  }
  if (!remove?.dataset.serverId) return;
  const serverLabel = remove.dataset.serverLabel ?? 'this server';
  const confirmed = await showConfirm(
    `Remove ${serverLabel} from your server list? If no other operator has access, the saved endpoint is deleted.`,
    'Remove server'
  );
  if (!confirmed) return;
  sendPostRequest('/api/delete-server', { server_id: remove.dataset.serverId })
    .then(() => fetchServers())
    .catch(toastError('Delete failed.'));
}

export function initServersPage(): void {
  initToast();
  void fetchServers();
  document.getElementById('serverList')?.addEventListener('click', event => {
    void handleServerAction(event);
  });
}
