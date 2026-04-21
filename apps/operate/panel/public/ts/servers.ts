import { sendPostRequest, initToast, showToast, toastError, showConfirm } from './common';

interface ServersResponse {
  servers: Array<{
    id: string | number;
    hostname: string;
    serverIP: string;
    serverPort: string | number;
    connected: boolean;
    authenticated: boolean;
  }>;
}

interface StatusResponse {
  humans?: number;
  max_players?: number;
}

function createSkeletonCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'server-card skeleton-card';
  card.setAttribute('aria-hidden', 'true');

  const header = document.createElement('div');
  header.className = 'card-header';
  const titleSkel = document.createElement('div');
  titleSkel.className = 'skeleton-line skeleton-title';
  const badgeSkel = document.createElement('div');
  badgeSkel.className = 'skeleton-line skeleton-badge';
  header.append(titleSkel, badgeSkel);

  const body = document.createElement('div');
  body.className = 'card-body';
  const addrSkel = document.createElement('div');
  addrSkel.className = 'skeleton-line skeleton-addr';
  const actionsSkel = document.createElement('div');
  actionsSkel.className = 'skeleton-actions';
  const btn1 = document.createElement('div');
  btn1.className = 'skeleton-line skeleton-btn';
  const btn2 = document.createElement('div');
  btn2.className = 'skeleton-line skeleton-btn';
  actionsSkel.append(btn1, btn2);
  body.append(addrSkel, actionsSkel);

  card.append(header, body);
  return card;
}

async function fetchServers(): Promise<void> {
  const list = document.getElementById('serverList');
  if (!list) return;

  list.textContent = '';
  for (let i = 0; i < 2; i++) list.appendChild(createSkeletonCard());

  try {
    const resp = await fetch('/api/servers');
    if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
    const data = await resp.json() as ServersResponse;

    list.textContent = '';

    if (!data.servers || data.servers.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'alert alert-secondary';
      emptyEl.textContent = 'No servers configured yet.';
      list.appendChild(emptyEl);
      return;
    }

    data.servers.forEach(server => {
      const isOnline = server.connected && server.authenticated;

      // Card
      const card = document.createElement('div');
      card.className = 'card server-card mb-3';

      // Card header
      const cardHeader = document.createElement('div');
      cardHeader.className = 'card-header';

      // Title
      const title = document.createElement('h3');
      title.className = 'card-title';

      const statusDot = document.createElement('span');
      statusDot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
      title.appendChild(statusDot);
      title.appendChild(document.createTextNode(String(server.hostname)));

      // Badge
      const badge = document.createElement('span');
      badge.className = `badge ${isOnline ? 'badge-connected' : 'badge-disconnected'}`;
      badge.textContent = isOnline ? 'Connected' : 'Disconnected';

      cardHeader.appendChild(title);
      cardHeader.appendChild(badge);

      // Card body
      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';

      const addrLine = document.createElement('p');
      addrLine.className = 'status mb-1 server-addr-line';

      const addrText = document.createTextNode(`${String(server.serverIP)}:${String(server.serverPort)}`);
      addrLine.appendChild(addrText);

      const playerCount = document.createElement('span');
      playerCount.className = 'server-player-count';
      playerCount.dataset['serverId'] = String(server.id);
      playerCount.textContent = isOnline ? '–/–' : '';
      addrLine.appendChild(playerCount);

      const actions = document.createElement('div');
      actions.className = 'server-card-actions';

      if (!isOnline) {
        const reconnectBtn = document.createElement('button');
        reconnectBtn.className = 'btn btn-sm btn-success reconnect-server';
        reconnectBtn.textContent = 'Reconnect';
        reconnectBtn.setAttribute('aria-label', 'Reconnect to server');
        reconnectBtn.dataset.serverId = String(server.id);
        actions.appendChild(reconnectBtn);
      }

      const manageLink = document.createElement('a');
      manageLink.href = `/manage/${encodeURIComponent(String(server.id))}`;
      manageLink.className = 'btn btn-sm btn-primary';
      manageLink.textContent = 'Manage';
      manageLink.setAttribute('aria-label', 'Manage server');
      actions.appendChild(manageLink);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-sm btn-danger delete-server';
      deleteBtn.textContent = 'Delete';
      deleteBtn.setAttribute('aria-label', 'Delete server');
      deleteBtn.dataset.serverId = String(server.id);
      actions.appendChild(deleteBtn);

      cardBody.appendChild(addrLine);
      cardBody.appendChild(actions);

      card.appendChild(cardHeader);
      card.appendChild(cardBody);
      list.appendChild(card);
    });
    // Fetch live player counts for online servers
    data.servers
      .filter(s => s.connected && s.authenticated)
      .forEach(server => {
        void fetch(`/api/status/${encodeURIComponent(String(server.id))}`)
          .then(r => r.ok ? r.json() as Promise<StatusResponse> : Promise.reject(new Error('status fetch failed')))
          .then(status => {
            const el = list.querySelector<HTMLElement>(`.server-player-count[data-server-id="${String(server.id)}"]`);
            if (!el) return;
            const h = status.humans ?? 0;
            const m = status.max_players;
            el.textContent = m != null ? ` ${h}/${m}` : ` ${h}`;
          })
          .catch(() => {/* silent — status is best-effort */});
      });
  } catch {
    list.textContent = '';
    showToast('Failed to load server list.', 'error');
  }
}

export function initServersPage(): void {
  initToast();
  fetchServers();
  const list = document.getElementById('serverList');
  if (!list) return;
  list.addEventListener('click', async function (e) {
    const target = e.target as HTMLElement;
    const reconnectBtn = target.closest('.reconnect-server') as HTMLElement | null;
    const deleteBtn = target.closest('.delete-server') as HTMLElement | null;
    if (reconnectBtn) {
      const sid = reconnectBtn.dataset.serverId;
      if (!sid) return;
      sendPostRequest('/api/reconnect-server', { server_id: sid })
        .then(() => {
          showToast('Reconnected successfully.', 'success');
          fetchServers();
        })
        .catch(toastError('Reconnect failed.'));
    } else if (deleteBtn) {
      const sid = deleteBtn.dataset.serverId;
      if (!sid) return;
      if (!(await showConfirm('Delete this server?'))) return;
      sendPostRequest('/api/delete-server', { server_id: sid })
        .then(() => fetchServers())
        .catch(toastError('Delete failed.'));
    }
  });
}
