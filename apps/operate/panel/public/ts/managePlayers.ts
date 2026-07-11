import { fetchJson, sendPostRequest, showToast, toastError, showConfirm } from './common';
import { el, formatObserved, on, setMessage, setText, type PlayerRow, type PlayersResponse } from './manageShared';

function playerMatchesQuery(player: PlayerRow, query: string): boolean {
  return !query || [player.userid, player.name, player.steam_id64 ?? ''].some(value =>
    value.toLowerCase().includes(query)
  );
}

function createPlayerAction(action: 'mute' | 'unmute', player: PlayerRow): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-secondary btn-sm';
  button.textContent = action === 'mute' ? 'Mute' : 'Unmute';
  button.dataset.playerAction = action;
  if (player.steam_id64) button.dataset.steamid = player.steam_id64;
  else {
    button.disabled = true;
    button.title = 'SteamID64 was not observed in RCON output';
  }
  return button;
}

function createPlayerRow(player: PlayerRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'player-row';
  const main = document.createElement('div');
  main.className = 'player-main';
  const name = document.createElement('div');
  name.className = 'player-name';
  name.textContent = `#${player.userid} ${player.name}`;
  const meta = document.createElement('div');
  meta.className = 'player-meta';
  meta.textContent = player.steam_id64
    ? `SteamID64 ${player.steam_id64}`
    : 'SteamID64 not observed by RCON';
  main.append(name, meta);
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const kick = document.createElement('button');
  kick.type = 'button';
  kick.className = 'btn btn-warning btn-sm';
  kick.textContent = 'Kick';
  kick.dataset.playerAction = 'kick';
  kick.dataset.userid = player.userid;
  actions.append(kick, createPlayerAction('mute', player), createPlayerAction('unmute', player));
  row.append(main, actions);
  return row;
}

function searchQuery(search: HTMLInputElement | null): string {
  return search ? search.value.trim().toLowerCase() : '';
}

function renderPlayerList(
  list: HTMLElement,
  search: HTMLInputElement | null,
  players: PlayerRow[]
): void {
  const filtered = players.filter(player => playerMatchesQuery(player, searchQuery(search)));
  list.replaceChildren();
  if (filtered.length) {
    filtered.forEach(player => {
      list.appendChild(createPlayerRow(player));
    });
    return;
  }
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = players.length ? 'No players match the search.' : 'No RCON-observed players.';
  list.appendChild(empty);
}


async function handlePlayerAction(
  serverId: string,
  button: HTMLButtonElement,
  reload: () => Promise<void>
): Promise<void> {
  const action = button.dataset.playerAction;
  if (action === 'kick') {
    const userid = button.dataset.userid ?? '';
    if (!userid || !(await showConfirm(`Kick player ${userid}?`))) return;
    sendPostRequest('/api/player-kick', { server_id: serverId, userid })
      .then(data => {
        showToast(data.message, 'success');
        return reload();
      })
      .catch(toastError('Kick failed.'));
    return;
  }
  const steamid = button.dataset.steamid ?? '';
  if (!steamid) return;
  const endpoint = action === 'mute' ? '/api/player-mute' : '/api/player-unmute';
  void sendPostRequest(endpoint, { server_id: serverId, steamid })
    .then(data => { showToast(data.message, 'success'); })
    .catch(toastError('Player action failed.'));
}

export function initPlayerManagement(serverId: string): void {
  const list = el<HTMLDivElement>('#playersList');
  const search = el<HTMLInputElement>('#playerSearch');
  let players: PlayerRow[] = [];
  if (!list) return;
  const playerList = list;

  async function loadPlayers(): Promise<void> {
    try {
      const data = await fetchJson<PlayersResponse>(`/api/players/${serverId}`);
      players = data.players;
      renderPlayerList(playerList, search, players);
      setText('players-updated', data.observed_at
        ? `RCON observed at ${formatObserved(data.observed_at)}`
        : 'RCON player observation unavailable.');
      setMessage('players-error', data.error ? `RCON player warning: ${data.error}` : null);
    } catch (err) {
      setText('players-updated', `Player list stale after ${new Date().toLocaleTimeString()}`);
      setMessage('players-error', err instanceof Error ? err.message : 'Failed to load players.');
    }
  }

  search?.addEventListener('input', () => { renderPlayerList(playerList, search, players); });
  on('#refresh_players', 'click', () => { void loadPlayers(); });
  playerList.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-player-action]');
    if (!button) return;
    void handlePlayerAction(serverId, button, loadPlayers);
  });
  void loadPlayers();
}
