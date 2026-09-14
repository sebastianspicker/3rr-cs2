/** Selects the appropriate page initializer after the shared browser bundle loads. */
import { initServersPage } from './servers';
import { initManagePage } from './manage';
import { initOpsDeck } from './opsDeck';

document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname;
  initOpsDeck(currentPath);
  if (currentPath === '/servers') initServersPage();
  if (currentPath.startsWith('/manage/')) {
    const serverId = document.getElementById('main')?.dataset.serverId ?? '';
    initManagePage(serverId);
  }
});
