/** Composes the authenticated single-server management page. */
import { initToast, sendPostRequest, showToast, toastError, withLoading } from './common';
import { initPlayerManagement } from './managePlayers';
import { initRconControls } from './manageRcon';
import { initBackups, initLiveStatus, initWorkshopMap } from './manageWorkshopStatus';
import { initGameSetup } from './manageGameSetup';
import { initConfirmActions, initMatchSettings, initMatchzyCommands, initPracticeControls, initQuickCommands, initScrimControls } from './manageControls';
import { on } from './manageShared';

function initManageReconnect(serverId: string): void {
  on('#manage-reconnect', 'click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    withLoading(button, async () => {
      try {
        const result = await sendPostRequest('/api/reconnect-server', { server_id: serverId });
        showToast(result.message, 'success');
        window.location.reload();
      } catch (error) {
        toastError('Reconnect failed.')(error);
      }
    });
  });
}

export function initManagePage(serverId: string): void {
  initToast();
  initManageReconnect(serverId);
  initGameSetup(serverId);
  initQuickCommands(serverId);
  initMatchSettings(serverId);
  initPracticeControls(serverId);
  initScrimControls(serverId);
  initConfirmActions(serverId);
  initMatchzyCommands(serverId);
  initPlayerManagement(serverId);
  initRconControls(serverId);
  initBackups(serverId);
  initWorkshopMap(serverId);
  initLiveStatus(serverId);
}
