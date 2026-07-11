import { fetchJson, sendPostRequest, showToast, toastError, showConfirm } from './common';
import { el, formatObserved, on, setMessage, setText, type LiveStatusResponse, type WorkshopFavorite, type WorkshopFavoritesResponse } from './manageShared';
import { renderLiveStatus } from './manageLiveStatusView';
import { validRestoreRound } from './manageWorkshopHelpers';
import { handleFavoriteAction, loadWorkshopMap, saveWorkshopFavorite, type FavoriteActionContext } from './manageWorkshopActions';

export function initBackups(serverId: string): void {
  on('#list_backups', 'click', () => {
    sendPostRequest('/api/list-backups', { server_id: serverId })
      .then(d => { showToast(d.message, 'info'); })
      .catch(toastError('List backups failed.'));
  });
  on('#restore_latest_backup', 'click', () => {
    void showConfirm('Restore latest backup?').then(confirmed => {
      if (!confirmed) return;
      void sendPostRequest('/api/restore-latest-backup', { server_id: serverId })
        .then(d => {
          showToast(d.message, 'success');
        })
        .catch(toastError('Restore latest failed.'));
    });
  });
  on('#restore_backup', 'click', () => {
    const row = el<HTMLElement>('#restore_backup_row');
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) {
      const input = el<HTMLInputElement>('#restore_round_input');
      if (input) { input.focus(); input.value = ''; }
    }
  });
  on('#restore_round_cancel', 'click', () => {
    const row = el<HTMLElement>('#restore_backup_row');
    if (row) row.hidden = true;
  });
  el('#restore_round_input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      el<HTMLButtonElement>('#restore_round_submit')?.click();
    }
  });
  on('#restore_round_submit', 'click', () => {
    const n = parseInt(el<HTMLInputElement>('#restore_round_input')?.value ?? '', 10);
    if (!validRestoreRound(n)) {
      showToast('Invalid round number (1–99)', 'error');
      return;
    }
    void sendPostRequest('/api/restore-round', { server_id: serverId, round_number: n })
      .then(d => { showToast(d.message, 'success'); })
      .catch(toastError('Restore failed.'));
    const row = el<HTMLElement>('#restore_backup_row');
    if (row) row.hidden = true;
  });
}

export function initWorkshopMap(serverId: string): void {
  const favoritesList = el<HTMLDivElement>('#workshopFavoritesList');
  const favoriteNameInput = el<HTMLInputElement>('#favoriteWorkshopName');
  const favoriteIdInput = el<HTMLInputElement>('#favoriteWorkshopId');
  const favoriteSaveButton = el<HTMLButtonElement>('#addWorkshopFavorite');
  const editingState: { value: number | null } = { value: null };

  function resetFavoriteForm(): void {
    editingState.value = null;
    if (favoriteNameInput) favoriteNameInput.value = '';
    if (favoriteIdInput) favoriteIdInput.value = '';
    if (favoriteSaveButton) favoriteSaveButton.textContent = 'Save';
  }

  function renderFavorites(favorites: WorkshopFavorite[]): void {
    if (!favoritesList) return;
    favoritesList.replaceChildren();
    if (!favorites.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No saved workshop favorites for this server.';
      favoritesList.appendChild(empty);
      return;
    }

    favorites.forEach((favorite) => {
      const row = document.createElement('div');
      row.className = 'compact-row';
      const main = document.createElement('div');
      main.className = 'compact-row-main';
      const title = document.createElement('div');
      title.className = 'compact-row-title';
      title.textContent = favorite.name;
      const meta = document.createElement('div');
      meta.className = 'compact-row-meta';
      meta.textContent = `Workshop ${favorite.workshop_id} · updated ${formatObserved(favorite.updated_at)}`;
      main.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const favoriteActions = [
        ['launch', 'Load', 'btn-primary'],
        ['edit', 'Edit', 'btn-secondary'],
        ['delete', 'Delete', 'btn-warning'],
      ] as const;
      favoriteActions.forEach(([action, label, klass]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn ${klass} btn-sm`;
        button.textContent = label;
        button.dataset.favoriteAction = action;
        button.dataset.favoriteId = String(favorite.id);
        button.dataset.workshopId = favorite.workshop_id;
        button.dataset.favoriteName = favorite.name;
        actions.appendChild(button);
      });

      row.append(main, actions);
      favoritesList.appendChild(row);
    });
  }

  async function loadFavorites(): Promise<void> {
    try {
      const data = await fetchJson<WorkshopFavoritesResponse>(
        `/api/workshop-favorites/${serverId}`
      );
      renderFavorites(data.favorites);
    } catch (err) {
      renderFavorites([]);
      showToast(err instanceof Error ? err.message : 'Failed to load favorites.', 'error');
    }
  }

  const actionContext: FavoriteActionContext = {
    serverId,
    nameInput: favoriteNameInput,
    idInput: favoriteIdInput,
    saveButton: favoriteSaveButton,
    editingState,
    reset: resetFavoriteForm,
    reload: loadFavorites,
  };

  on('#loadWorkshopMap', 'click', () => {
    void loadWorkshopMap(serverId);
  });

  on('#addWorkshopFavorite', 'click', () => {
    saveWorkshopFavorite(actionContext);
  });

  on('#refreshWorkshopFavorites', 'click', () => { void loadFavorites(); });

  favoritesList?.addEventListener('click', event => {
    void handleFavoriteAction(actionContext, event);
  });

  const COLLECTION_ID_RE = /^\d{5,20}$/;

  on('#loadWorkshopCollection', 'click', () => {
    const collInput = el<HTMLInputElement>('#workshopCollectionId');
    const raw = collInput?.value.trim() ?? '';
    if (!raw) {
      showToast('Paste a Workshop Collection ID first.', 'error');
      return;
    }
    if (!COLLECTION_ID_RE.test(raw)) {
      showToast('Collection ID must be 5–20 digits.', 'error');
      return;
    }
    void showConfirm(`Load workshop collection ${raw}?`).then(confirmed => {
      if (!confirmed) return;
      void sendPostRequest('/api/workshop-collection', { server_id: serverId, collection_id: raw })
        .then(d => {
          showToast(d.message, 'success');
          if (collInput) collInput.value = '';
        })
        .catch(toastError('Workshop collection failed.'));
    });
  });

  void loadFavorites();
}

export function initLiveStatus(serverId: string): void {
  let liveStatusInterval: ReturnType<typeof setInterval> | undefined;

  async function fetchLiveStatus(): Promise<void> {
    try {
      const data = await fetchJson<LiveStatusResponse>(`/api/status/${serverId}`);
      renderLiveStatus(data);
    } catch (err) {
      setText('live-status-state', 'RCON status stale');
      setText('live-status-updated', `RCON refresh failed at ${new Date().toLocaleTimeString()}`);
      setMessage('live-status-error', err instanceof Error ? err.message : 'Failed to refresh status.');
    }
  }

  void fetchLiveStatus();
  on('#refresh_status', 'click', () => { void fetchLiveStatus(); });
  liveStatusInterval = setInterval(() => { void fetchLiveStatus(); }, 30000);
  window.addEventListener('beforeunload', () => { clearInterval(liveStatusInterval); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(liveStatusInterval);
      liveStatusInterval = undefined;
    } else if (!liveStatusInterval) {
      void fetchLiveStatus();
  liveStatusInterval = setInterval(() => { void fetchLiveStatus(); }, 30000);
    }
  });
}
