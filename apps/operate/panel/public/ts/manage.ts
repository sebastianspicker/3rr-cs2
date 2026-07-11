import { initToast } from './common';
import { initPlayerManagement } from './managePlayers';
import { initRconControls } from './manageRcon';
import { initBackups, initLiveStatus, initWorkshopMap } from './manageWorkshopStatus';
import { initGameSetup } from './manageGameSetup';
import { initConfirmActions, initMatchSettings, initMatchzyCommands, initPracticeControls, initQuickCommands, initScrimControls } from './manageControls';

export function initManagePage(serverId: string): void {
  initToast();
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
