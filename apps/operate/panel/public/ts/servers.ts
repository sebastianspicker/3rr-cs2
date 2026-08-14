/** Server-page composition entry point. */
import { initToast } from './common';
import { handleServerAction } from './serverActions';
import { fetchServers } from './serverListLoader';

export function initServersPage(): void {
  initToast();
  void fetchServers();
  document.getElementById('serverList')?.addEventListener('click', (event) => {
    void handleServerAction(event);
  });
}
