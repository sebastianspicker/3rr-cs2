/** Selects the appropriate page initializer after the shared browser bundle loads. */
import { initServersPage } from './servers';
import { initManagePage } from './manage';

document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname;
  if (currentPath === '/servers') initServersPage();
  if (currentPath.startsWith('/manage/')) {
    const serverId = document.getElementById('main')?.dataset.serverId ?? '';
    initManagePage(serverId);
  }
});
