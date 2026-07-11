import { fetchJson, sendPostRequest, showToast, toastError, withLoading } from './common';
import { el, on } from './manageShared';

interface GameModesResponse { gameModes: string[] }
interface MapsResponse { maps: string[] }

interface GameSetupElements {
  typeContainer: HTMLDivElement;
  modeContainer: HTMLDivElement;
  mapSelect: HTMLSelectElement;
  gameTypeValue: HTMLInputElement;
  gameModeValue: HTMLInputElement;
}

function gameSetupElements(): GameSetupElements | null {
  const typeContainer = el<HTMLDivElement>('#gameTypeBtns');
  const modeContainer = el<HTMLDivElement>('#gameModeBtns');
  const mapSelect = el<HTMLSelectElement>('#selectedMap');
  const gameTypeValue = el<HTMLInputElement>('#gameTypeValue');
  const gameModeValue = el<HTMLInputElement>('#gameModeValue');
  if (!typeContainer || !modeContainer || !mapSelect || !gameTypeValue || !gameModeValue) return null;
  return { typeContainer, modeContainer, mapSelect, gameTypeValue, gameModeValue };
}

function activateButton(container: HTMLElement, attribute: string, value: string): void {
  container.querySelectorAll<HTMLButtonElement>('.btn').forEach(button => {
    button.classList.toggle('btn-active', button.getAttribute(attribute) === value);
  });
}

function setMapPlaceholder(elements: GameSetupElements, text: string): void {
  const option = document.createElement('option');
  option.disabled = true;
  option.textContent = text;
  elements.mapSelect.replaceChildren(option);
}

function loadMaps(
  elements: GameSetupElements,
  gameType: string,
  gameMode: string,
  preferredMap = ''
): Promise<void> {
  return fetchJson<MapsResponse>(
      `/api/game-types/${encodeURIComponent(gameType)}/game-modes/${encodeURIComponent(gameMode)}/maps`
    )
    .then(({ maps }) => {
      elements.mapSelect.replaceChildren();
      maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map;
        option.textContent = map;
        elements.mapSelect.appendChild(option);
      });
      if (!maps.length) {
        setMapPlaceholder(elements, 'No maps available');
        return;
      }
      elements.mapSelect.value =
        preferredMap && maps.includes(preferredMap) ? preferredMap : (maps[0] ?? '');
    })
    .catch(() => {
      showToast('Failed to load maps.', 'error');
    });
}

function loadModes(
  elements: GameSetupElements,
  gameType: string,
  preferredMode = '',
  preferredMap = ''
): Promise<void> {
  return fetchJson<GameModesResponse>(`/api/game-types/${encodeURIComponent(gameType)}/game-modes`)
    .then(({ gameModes }) => {
      elements.modeContainer.replaceChildren();
      elements.modeContainer.className = `btn-grid ${gameModes.length <= 2 ? 'cols-2' : gameModes.length <= 4 ? 'cols-3' : 'cols-4'}`;
      gameModes.forEach(mode => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.dataset.gameMode = mode;
        button.textContent = mode;
        elements.modeContainer.appendChild(button);
      });
      const selected =
        preferredMode && gameModes.includes(preferredMode) ? preferredMode : gameModes.at(0);
      if (!selected) {
        setMapPlaceholder(elements, 'No maps available');
        return;
      }
      elements.gameModeValue.value = selected;
      activateButton(elements.modeContainer, 'data-game-mode', selected);
      return loadMaps(elements, gameType, selected, preferredMap);
    })
    .catch(() => {
      showToast('Failed to load game modes.', 'error');
    });
}

function bindModeSelectors(elements: GameSetupElements): void {
  elements.typeContainer.addEventListener('click', event => {
    const type = (event.target as HTMLElement)
      .closest<HTMLButtonElement>('[data-game-type]')?.dataset.gameType;
    if (!type) return;
    elements.gameTypeValue.value = type;
    activateButton(elements.typeContainer, 'data-game-type', type);
    void loadModes(elements, type);
  });
  elements.modeContainer.addEventListener('click', event => {
    const mode = (event.target as HTMLElement)
      .closest<HTMLButtonElement>('[data-game-mode]')?.dataset.gameMode;
    if (!mode) return;
    elements.gameModeValue.value = mode;
    activateButton(elements.modeContainer, 'data-game-mode', mode);
    void loadMaps(elements, elements.gameTypeValue.value, mode);
  });
}

function loadInitialMode(elements: GameSetupElements): void {
  const buttons = [...elements.typeContainer.querySelectorAll<HTMLButtonElement>('[data-game-type]')];
  const initial =
    buttons.find(button => button.dataset.gameType === elements.gameTypeValue.value) ?? buttons.at(0);
  const gameType = initial?.dataset.gameType;
  if (!gameType) return;
  elements.gameTypeValue.value = gameType;
  activateButton(elements.typeContainer, 'data-game-type', gameType);
  void loadModes(
    elements,
    gameType,
    elements.gameModeValue.value,
    elements.mapSelect.dataset.requestedMap ?? ''
  );
}

function bindSetupForm(serverId: string, elements: GameSetupElements): void {
  const deployButton = el<HTMLButtonElement>('button[form="server_setup_form"]');
  el('#server_setup_form')?.addEventListener('submit', event => {
    event.preventDefault();
    const payload = {
      server_id: serverId,
      team1: el<HTMLInputElement>('#team1')?.value ?? '',
      team2: el<HTMLInputElement>('#team2')?.value ?? '',
      game_type: elements.gameTypeValue.value,
      game_mode: elements.gameModeValue.value,
      selectedMap: elements.mapSelect.value,
    };
    withLoading(deployButton, () =>
      sendPostRequest('/api/setup-game', payload)
        .then(data => { showToast(data.message, 'success'); })
        .catch(toastError('Setup command failed.'))
    );
  });
}

export function initGameSetup(serverId: string): void {
  const elements = gameSetupElements();
  if (!elements) return;
  bindModeSelectors(elements);
  loadInitialMode(elements);
  bindSetupForm(serverId, elements);
  on('#setMapGroupBtn', 'click', () => {
    const group = el<HTMLSelectElement>('#mapGroupSelect')?.value ?? '';
    if (!group) {
      showToast('Select a map group first.', 'error');
      return;
    }
    void sendPostRequest('/api/set-mapgroup', { server_id: serverId, group })
      .then(data => { showToast(data.message, 'success'); })
      .catch(toastError('Set map group failed.'));
  });
}
