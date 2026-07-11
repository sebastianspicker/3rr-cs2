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
  try {
    const { servers } = await fetchJson<ServersResponse>('/api/servers');
    list.replaceChildren();
    if (!servers.length) {
      const empty = document.createElement('div');
      empty.className = 'alert alert-secondary';
      empty.textContent = 'No servers configured yet.';
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
    showToast('Failed to load server list.', 'error');
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
  if (!remove?.dataset.serverId || !(await showConfirm('Delete this server?'))) return;
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
