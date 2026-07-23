/** Collects match setup input before the server-side validation boundary. */
import { fetchJson, sendPostRequest, showToast, toastError, withLoading } from './common';
import { el, on, setText } from './manageShared';

interface GameModesResponse { gameModes: string[] }
interface MapsResponse { maps: string[] }

let modeRequestGeneration = 0;
let mapRequestGeneration = 0;

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
    const active = button.getAttribute(attribute) === value;
    button.classList.toggle('btn-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setMapPlaceholder(elements: GameSetupElements, text: string): void {
  const option = document.createElement('option');
  option.disabled = true;
  option.textContent = text;
  elements.mapSelect.replaceChildren(option);
}

function setSetupStatus(message: string | null, tone: 'secondary' | 'danger' = 'secondary'): void {
  const status = el<HTMLElement>('#setup-status');
  if (!status) return;
  status.hidden = !message;
  status.className = `alert mb-3 alert-${tone}`;
  status.textContent = message ?? '';
}

function setSetupPending(elements: GameSetupElements, pending: boolean): void {
  elements.mapSelect.disabled = pending;
  const submit = el<HTMLButtonElement>('#send-setup-commands');
  if (submit) submit.disabled = pending;
}

function loadMaps(
  elements: GameSetupElements,
  gameType: string,
  gameMode: string,
  preferredMap = ''
): Promise<void> {
  const generation = ++mapRequestGeneration;
  setSetupPending(elements, true);
  setSetupStatus('Loading maps…');
  return fetchJson<MapsResponse>(
      `/api/game-types/${encodeURIComponent(gameType)}/game-modes/${encodeURIComponent(gameMode)}/maps`
    )
    .then(({ maps }) => {
      if (generation !== mapRequestGeneration) return;
      elements.mapSelect.replaceChildren();
      maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map;
        option.textContent = map;
        elements.mapSelect.appendChild(option);
      });
      if (!maps.length) {
        setMapPlaceholder(elements, 'No maps available');
        setSetupStatus('No maps are available for this game mode.', 'danger');
        return;
      }
      elements.mapSelect.value =
        preferredMap && maps.includes(preferredMap) ? preferredMap : (maps[0] ?? '');
      setSetupPending(elements, false);
      setSetupStatus(null);
    })
    .catch(() => {
      if (generation !== mapRequestGeneration) return;
      setMapPlaceholder(elements, 'Maps unavailable');
      setSetupStatus('Maps could not be loaded. Choose a game mode to retry.', 'danger');
    });
}

function loadModes(
  elements: GameSetupElements,
  gameType: string,
  preferredMode = '',
  preferredMap = ''
): Promise<void> {
  const generation = ++modeRequestGeneration;
  mapRequestGeneration += 1;
  setSetupPending(elements, true);
  setSetupStatus('Loading game modes…');
  return fetchJson<GameModesResponse>(`/api/game-types/${encodeURIComponent(gameType)}/game-modes`)
    .then(({ gameModes }) => {
      if (generation !== modeRequestGeneration) return;
      elements.modeContainer.replaceChildren();
      elements.modeContainer.className = `btn-grid ${gameModes.length <= 2 ? 'cols-2' : gameModes.length <= 4 ? 'cols-3' : 'cols-4'}`;
      gameModes.forEach(mode => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.dataset.gameMode = mode;
        button.setAttribute('aria-pressed', 'false');
        button.textContent = mode;
        elements.modeContainer.appendChild(button);
      });
      const selected =
        preferredMode && gameModes.includes(preferredMode) ? preferredMode : gameModes.at(0);
      if (!selected) {
        setMapPlaceholder(elements, 'No maps available');
        setSetupStatus('No game modes are available for this game type.', 'danger');
        return;
      }
      elements.gameModeValue.value = selected;
      activateButton(elements.modeContainer, 'data-game-mode', selected);
      return loadMaps(elements, gameType, selected, preferredMap);
    })
    .catch(() => {
      if (generation !== modeRequestGeneration) return;
      elements.modeContainer.replaceChildren();
      setMapPlaceholder(elements, 'Maps unavailable');
      setSetupStatus('Game modes could not be loaded. Choose a game type to retry.', 'danger');
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
  const form = el<HTMLFormElement>('#server_setup_form');
  const deployButton = el<HTMLButtonElement>('#send-setup-commands');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
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
        .then(data => {
          showToast(data.message, 'success');
          setText('truth-requested-time', new Date().toLocaleTimeString());
          setText(
            'truth-requested-detail',
            `${payload.game_type} / ${payload.game_mode} / ${payload.selectedMap}`
          );
        })
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
