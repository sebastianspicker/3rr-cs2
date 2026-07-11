import { fetchJson, sendPostRequest, showConfirm, showToast, toastError } from './common';
import { el, type WorkshopFavoriteResponse } from './manageShared';
import { workshopIdFromInput } from './manageWorkshopHelpers';

export interface FavoriteActionContext {
  serverId: string;
  nameInput: HTMLInputElement | null;
  idInput: HTMLInputElement | null;
  saveButton: HTMLButtonElement | null;
  editingState: { value: number | null };
  reset: () => void;
  reload: () => Promise<void>;
}

function inputValue(input: HTMLInputElement | null): string {
  return input ? input.value.trim() : '';
}

function favoriteRequest(
  context: FavoriteActionContext,
  editingId: number | null,
  name: string,
  workshopId: string
): Promise<WorkshopFavoriteResponse> {
  if (editingId) {
    return fetchJson<WorkshopFavoriteResponse>(
      `/api/workshop-favorites/${context.serverId}/${editingId}`,
      { method: 'PATCH', data: { name, workshop_id: workshopId } }
    );
  }
  return fetchJson<WorkshopFavoriteResponse>(`/api/workshop-favorites/${context.serverId}`, {
    method: 'POST',
    data: { name, workshop_id: workshopId },
  });
}

export async function loadWorkshopMap(serverId: string): Promise<void> {
  const input = el<HTMLInputElement>('#workshopUrl');
  const raw = input?.value.trim() ?? '';
  if (!raw) {
    showToast('Paste a workshop URL first.', 'error');
    return;
  }
  const workshopId = workshopIdFromInput(raw);
  if (!workshopId) {
    showToast('Could not extract workshop ID from URL.', 'error');
    return;
  }
  if (!(await showConfirm(`Load workshop map ${workshopId}?`))) return;
  void sendPostRequest('/api/workshop-map', { server_id: serverId, workshop_id: workshopId })
    .then(data => {
      showToast(data.message, 'success');
      if (input) input.value = '';
    })
    .catch(toastError('Workshop map failed.'));
}

export function saveWorkshopFavorite(context: FavoriteActionContext): void {
  const name = inputValue(context.nameInput);
  const workshopId = inputValue(context.idInput);
  if (!name) {
    showToast('Enter a favorite name.', 'error');
    return;
  }
  if (!/^\d{5,20}$/.test(workshopId)) {
    showToast('Workshop ID must be 5–20 digits.', 'error');
    return;
  }
  const editingId = context.editingState.value;
  favoriteRequest(context, editingId, name, workshopId)
    .then(() => {
      showToast(editingId ? 'Favorite updated.' : 'Favorite saved.', 'success');
      context.reset();
      return context.reload();
    })
    .catch(toastError('Save favorite failed.'));
}

async function launchFavorite(context: FavoriteActionContext, workshopId: string): Promise<void> {
  if (!(await showConfirm(`Load workshop favorite ${workshopId}?`))) return;
  void sendPostRequest('/api/workshop-map', { server_id: context.serverId, workshop_id: workshopId })
    .then(data => { showToast(data.message, 'success'); })
    .catch(toastError('Workshop favorite launch failed.'));
}

function editFavorite(
  context: FavoriteActionContext,
  favoriteId: string,
  workshopId: string,
  favoriteName: string
): void {
  context.editingState.value = Number.parseInt(favoriteId, 10);
  if (context.nameInput) context.nameInput.value = favoriteName;
  if (context.idInput) context.idInput.value = workshopId;
  if (context.saveButton) context.saveButton.textContent = 'Update';
  context.nameInput?.focus();
}

async function deleteFavorite(
  context: FavoriteActionContext,
  favoriteId: string,
  workshopId: string
): Promise<void> {
  if (!(await showConfirm(`Delete workshop favorite ${workshopId}?`))) return;
  fetchJson<{ message: string }>(
    `/api/workshop-favorites/${context.serverId}/${favoriteId}`,
    { method: 'DELETE' }
  )
    .then(data => {
      showToast(data.message, 'success');
      return context.reload();
    })
    .catch(toastError('Delete favorite failed.'));
}

export async function handleFavoriteAction(
  context: FavoriteActionContext,
  event: Event
): Promise<void> {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-favorite-action]');
  if (!button) return;
  const { favoriteId = '', workshopId = '', favoriteName = '' } = button.dataset;
  if (button.dataset.favoriteAction === 'launch') {
    await launchFavorite(context, workshopId);
    return;
  }
  if (button.dataset.favoriteAction === 'edit') {
    editFavorite(context, favoriteId, workshopId, favoriteName);
    return;
  }
  if (button.dataset.favoriteAction === 'delete') await deleteFavorite(context, favoriteId, workshopId);
}
