/** Catalog-backed setup inputs and a single deliberate mutation. */
import { ApiError, sendPostRequest, fetchJson, showToast, toastError } from './common';
import { el, on, setText } from './manageShared';
import {
  beginSessionSetup,
  initSessionFlow,
  showSessionResult,
  titleCase,
  type SessionSetup,
} from './sessionFlow';

interface SetupElements {
  type: HTMLSelectElement;
  mode: HTMLSelectElement;
  map: HTMLSelectElement;
  form: HTMLFormElement;
  fields: HTMLFieldSetElement;
  submit: HTMLButtonElement;
}
let generation = 0;
let ready = false;
let sending = false;

function elements(): SetupElements | undefined {
  const type = el<HTMLSelectElement>('#gameTypeValue');
  const mode = el<HTMLSelectElement>('#gameModeValue');
  const map = el<HTMLSelectElement>('#selectedMap');
  const form = el<HTMLFormElement>('#server_setup_form');
  const fields = el<HTMLFieldSetElement>('#setup-fields');
  const submit = el<HTMLButtonElement>('#send-setup-commands');
  return type && mode && map && form && fields && submit
    ? { type, mode, map, form, fields, submit }
    : undefined;
}

function status(message: string, failed = false): void {
  const node = el('#setup-status');
  if (node) {
    node.hidden = !message;
    node.textContent = message;
    node.className = `alert ${failed ? 'alert-danger' : 'alert-secondary'}`;
  }
  const retry = el('#setup-retry');
  if (retry) retry.hidden = !failed;
}

function replaceOptions(
  select: HTMLSelectElement,
  values: string[],
  preferred = '',
  format = false
): void {
  select.replaceChildren(
    ...values.map((value) => new Option(format ? titleCase(value) : value, value))
  );
  select.value = values.includes(preferred) ? preferred : (values[0] ?? '');
}

function placeholder(select: HTMLSelectElement, label: string): void {
  select.replaceChildren(new Option(label, ''));
  select.disabled = true;
}

function review(e: SetupElements): void {
  setText(
    'setup-review-mode',
    `${titleCase(e.type.value)} / ${titleCase(e.mode.value) || 'Choose a mode'}`
  );
  setText('setup-review-map', e.map.value || 'Choose a map');
  const first = el<HTMLInputElement>('#team1')?.value.trim();
  const second = el<HTMLInputElement>('#team2')?.value.trim();
  setText(
    'setup-review-teams',
    !first && !second
      ? 'Keep current team names'
      : `${first || 'Keep team 1'} / ${second || 'Keep team 2'}`
  );
  setText(
    'setup-config-note',
    e.type.value === 'competitive' && e.mode.value === 'competitive'
      ? 'Competitive setup uses warmup.cfg.'
      : 'The selected configuration is applied before changing the map.'
  );
}

async function maps(e: SetupElements, request: number, preferred = ''): Promise<void> {
  const { maps: choices } = await fetchJson<{ maps: string[] }>(
    `/api/game-types/${encodeURIComponent(e.type.value)}/game-modes/${encodeURIComponent(e.mode.value)}/maps`
  );
  if (request !== generation) return;
  replaceOptions(e.map, choices, preferred);
  ready = choices.length > 0;
  e.map.disabled = !ready;
  e.submit.disabled = !ready;
  if (!ready) placeholder(e.map, 'No maps available');
  status(ready ? '' : 'No maps are available for this game mode.', !ready);
  review(e);
}

async function loadChoices(
  e: SetupElements,
  includeModes: boolean,
  preferredMode = '',
  preferredMap = ''
): Promise<void> {
  const request = ++generation;
  ready = false;
  e.submit.disabled = true;
  placeholder(e.map, 'Loading maps…');
  if (includeModes) placeholder(e.mode, 'Loading modes…');
  status(includeModes ? 'Loading game modes…' : 'Loading maps…');
  review(e);
  try {
    if (includeModes) {
      const { gameModes } = await fetchJson<{ gameModes: string[] }>(
        `/api/game-types/${encodeURIComponent(e.type.value)}/game-modes`
      );
      if (request !== generation) return;
      replaceOptions(e.mode, gameModes, preferredMode, true);
      e.mode.disabled = gameModes.length === 0;
      if (!gameModes.length) {
        placeholder(e.mode, 'No modes available');
        placeholder(e.map, 'No maps available');
        status('No game modes are available for this game type.', true);
        return;
      }
    }
    await maps(e, request, preferredMap);
  } catch {
    if (request !== generation) return;
    placeholder(e.map, 'Maps unavailable');
    status('Setup choices could not be loaded. Try again or choose another game type.', true);
  }
}

function payload(serverId: string, e: SetupElements): SessionSetup {
  return {
    server_id: serverId,
    game_type: e.type.value,
    game_mode: e.mode.value,
    selectedMap: e.map.value,
    team1: el<HTMLInputElement>('#team1')?.value.trim() ?? '',
    team2: el<HTMLInputElement>('#team2')?.value.trim() ?? '',
  };
}

async function submit(serverId: string, e: SetupElements): Promise<void> {
  if (sending || !ready || !e.form.reportValidity()) return;
  const selection = payload(serverId, e);
  beginSessionSetup();
  sending = true;
  e.fields.disabled = true;
  e.submit.disabled = true;
  e.submit.textContent = 'Sending setup commands…';
  e.form.setAttribute('aria-busy', 'true');
  status('Sending setup commands. This may interrupt play.');
  try {
    await sendPostRequest('/api/setup-game', { ...selection });
    showSessionResult(selection);
    status('');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Setup request failed.';
    if (error instanceof ApiError && [400, 403].includes(error.status)) {
      status(message);
      el('#setup-status')?.focus();
    } else {
      showSessionResult(selection, message);
      status('The previous setup may be incomplete. Check server state before sending again.');
    }
  } finally {
    sending = false;
    e.fields.disabled = false;
    e.submit.disabled = !ready;
    e.submit.textContent = `Send setup to ${el('#manage-title')?.textContent ?? 'this server'}`;
    e.form.setAttribute('aria-busy', 'false');
  }
}

export function initGameSetup(serverId: string): void {
  const e = elements();
  if (!e) return;
  initSessionFlow();
  e.type.addEventListener('change', () => {
    if (!sending) void loadChoices(e, true);
  });
  e.mode.addEventListener('change', () => {
    if (!sending) void loadChoices(e, false);
  });
  e.form.addEventListener('input', () => review(e));
  e.form.addEventListener('change', () => review(e));
  e.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit(serverId, e);
  });
  el('#setup-retry')?.addEventListener('click', () => {
    if (!sending) void loadChoices(e, true, e.mode.value, e.map.value);
  });
  void loadChoices(e, true, e.mode.dataset.requestedMode ?? '', e.map.dataset.requestedMap ?? '');
  on('#setMapGroupBtn', 'click', () => {
    const group = el<HTMLSelectElement>('#mapGroupSelect')?.value ?? '';
    if (!group) {
      showToast('Select a map group first.', 'error');
      return;
    }
    void sendPostRequest('/api/set-mapgroup', { server_id: serverId, group })
      .then((data) => {
        showToast(data.message, 'success');
      })
      .catch(toastError('Set map group failed.'));
  });
}
