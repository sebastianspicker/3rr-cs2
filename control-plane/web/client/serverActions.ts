/** Handles reconnect and removal actions delegated from the server list. */
import { sendPostRequest, showConfirm, showToast, toastError, withLoading } from './common';
import { refreshServersAfterMutation } from './serverListLoader';

function buttonOf(node: HTMLElement): HTMLButtonElement | null {
  return node instanceof HTMLButtonElement ? node : null;
}

export async function handleServerAction(event: Event): Promise<void> {
  const target = event.target as HTMLElement;
  const reconnect = target.closest<HTMLElement>('.reconnect-server');
  const remove = target.closest<HTMLElement>('.delete-server');
  if (reconnect?.dataset.serverId) {
    const serverId = reconnect.dataset.serverId;
    withLoading(buttonOf(reconnect), () =>
      sendPostRequest('/api/reconnect-server', { server_id: serverId })
        .then(() => {
          showToast('Reconnected successfully.', 'success');
          return refreshServersAfterMutation();
        })
        .catch(toastError('Reconnect failed.'))
    );
    return;
  }
  if (!remove?.dataset.serverId) return;
  const confirmed = await showConfirm(
    `Remove ${remove.dataset.serverLabel ?? 'this server'} from your server list? If no other operator has access, the saved endpoint is deleted.`,
    'Remove server'
  );
  if (!confirmed) return;
  const serverId = remove.dataset.serverId;
  withLoading(buttonOf(remove), () =>
    sendPostRequest('/api/delete-server', { server_id: serverId })
      .then(() => refreshServersAfterMutation())
      .catch(toastError('Delete failed.'))
  );
}
