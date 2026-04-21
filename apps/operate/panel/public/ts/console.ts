import { setServerId } from './context';
import { initServersPage } from './servers';
import { initManagePage } from './manage';

document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname;
  if (currentPath === '/servers') initServersPage();
  if (currentPath.startsWith('/manage/')) {
    const sid = document.getElementById('main')?.dataset.serverId;
    if (sid) setServerId(sid);
    initManagePage();
  }
});
