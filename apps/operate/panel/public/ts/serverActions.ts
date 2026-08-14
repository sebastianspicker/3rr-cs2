/** Handles reconnect and removal actions delegated from the server list. */
import { sendPostRequest, showConfirm, showToast, toastError } from './common';
import { fetchServers } from './serverListLoader';

export async function handleServerAction(event: Event): Promise<void> {
  const target = event.target as HTMLElement;
  const reconnect = target.closest<HTMLElement>('.reconnect-server');
  const remove = target.closest<HTMLElement>('.delete-server');
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
  const confirmed = await showConfirm(
    `Remove ${remove.dataset.serverLabel ?? 'this server'} from your server list? If no other operator has access, the saved endpoint is deleted.`,
    'Remove server'
  );
  if (!confirmed) return;
  sendPostRequest('/api/delete-server', { server_id: remove.dataset.serverId })
    .then(() => fetchServers())
    .catch(toastError('Delete failed.'));
}
