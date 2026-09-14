/** Server-page composition entry point. */
import { initToast } from './common';
import { handleServerAction } from './serverActions';
import { fetchServers, initServerListControls } from './serverListLoader';
import { initServerSelection } from './serverSelection';

export function initServersPage(): void {
  initToast();
  initServerSelection();
  initServerListControls();
  void fetchServers();
  document.getElementById('serverList')?.addEventListener('click', (event) => {
    void handleServerAction(event);
  });
}
