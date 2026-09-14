/** Local setup intent and explicit observation; never treats command acceptance as live state. */
import { el, formatObserved, setMessage, setText, type LiveStatusResponse } from './manageShared';

export interface SessionSetup {
  server_id: string;
  game_type: string;
  game_mode: string;
  selectedMap: string;
  team1: string;
  team2: string;
}

let latest: LiveStatusResponse | undefined;
let submitted: SessionSetup | undefined;
let requestedAt = '';
let refreshStatus: (() => Promise<LiveStatusResponse | undefined>) | undefined;
let checking = false;
let setupFailed = false;
let submissionGeneration = 0;

export function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

export function playerObservation(data?: LiveStatusResponse): string {
  return `${data?.humans ?? 'Unknown'} humans · ${data?.bots ?? 'unknown'} bots`;
}

export function recordSessionObservation(data: LiveStatusResponse): void {
  latest = data;
  const count =
    data.humans === null ? 'Player count not observed' : `${data.humans} players observed`;
  setText('setup-player-warning', count);
  const submit = el<HTMLButtonElement>('#send-setup-commands');
  if (submit && !el<HTMLFieldSetElement>('#setup-fields')?.disabled) {
    submit.textContent = `Send setup to ${el('#manage-title')?.textContent ?? 'this server'}`;
  }
}

export function setSessionRefresh(refresh: () => Promise<LiveStatusResponse | undefined>): void {
  refreshStatus = refresh;
}

export function beginSessionSetup(): void {
  submissionGeneration += 1;
  const step = el<HTMLButtonElement>('#session-step-result');
  if (step) step.disabled = true;
}

function showResult(result: boolean, focus = true): void {
  const setup = el('#requested-setup');
  const panel = el('#session-result');
  if (setup) setup.hidden = result;
  if (panel) panel.hidden = !result;
  el('#session-step-setup')?.toggleAttribute('aria-current', !result);
  if (!result) el('#session-step-setup')?.setAttribute('aria-current', 'step');
  el('#session-step-result')?.toggleAttribute('aria-current', result);
  if (result) el('#session-step-result')?.setAttribute('aria-current', 'step');
  document.body.classList.toggle('session-showing-result', result);
  document.querySelectorAll<HTMLElement>('.session-advanced').forEach((section) => {
    section.hidden = result;
  });
  if (focus && !el('#manage-panel-setup')?.hidden)
    el(result ? '#session-result-heading' : '#requested-setup-heading')?.focus();
}

function renderRequested(payload: SessionSetup): void {
  document.querySelectorAll<HTMLElement>('[data-session-requested]').forEach((node) => {
    const key = node.dataset.sessionRequested as keyof SessionSetup;
    const value = payload[key];
    node.textContent =
      key === 'game_type' || key === 'game_mode' ? titleCase(value) : value || 'Keep current name';
  });
}

export function showSessionResult(payload: SessionSetup, error?: string): void {
  submissionGeneration += 1;
  submitted = { ...payload };
  el('#session-result-heading')?.classList.remove('session-map-matched');
  requestedAt = new Date().toLocaleTimeString();
  setupFailed = Boolean(error);
  renderRequested(payload);
  setText('session-requested-at', requestedAt);
  setText('session-result-heading', error ? 'Setup may be incomplete' : 'Setup commands sent');
  setText(
    'session-result-description',
    error
      ? 'Some commands may have been applied. Check server state before sending setup again.'
      : 'The request was sent. The live map has not been confirmed.'
  );
  setMessage('session-result-error', error ?? null);
  setText('session-previous-map', latest?.map ?? 'Unknown');
  setText(
    'session-previous-time',
    latest?.observed_at ? formatObserved(latest.observed_at) : 'Not observed'
  );
  setText('session-result-players', 'Unknown');
  setText('session-observation-state', 'Awaiting a new observation');
  setText('session-observation-label', 'Previous observation');
  const pending = el('#session-pending-result');
  const observed = el('#session-observed-result');
  if (pending) pending.hidden = false;
  if (observed) observed.hidden = true;
  const step = el<HTMLButtonElement>('#session-step-result');
  if (step) step.disabled = false;
  const check = el<HTMLButtonElement>('#session-check-map');
  if (check) {
    check.textContent = 'Check live map';
    check.className = 'btn btn-primary';
  }
  const back = el('#session-edit-setup');
  if (back) back.hidden = false;
  const done = el('#session-return');
  if (done) done.hidden = true;
  showResult(true);
}

async function checkMap(): Promise<void> {
  if (!submitted || !refreshStatus || checking) return;
  checking = true;
  const requestGeneration = submissionGeneration;
  const selection = submitted;
  const check = el<HTMLButtonElement>('#session-check-map');
  const doneButton = el<HTMLButtonElement>('#session-return');
  if (doneButton) doneButton.disabled = true;
  if (check) {
    check.disabled = true;
    check.textContent = 'Checking live map…';
  }
  setText('session-result-status', 'Checking the live map.');
  try {
    const data = await refreshStatus();
    if (requestGeneration !== submissionGeneration) return;
    if (!data) throw new Error('The observation could not be completed. Refresh to check again.');
    const observed = Boolean(data.map && data.observed_at);
    const matches = observed && data.map === selection.selectedMap;
    setText(
      'session-result-heading',
      matches ? 'Requested map observed' : 'Requested map not confirmed'
    );
    setText(
      'session-result-description',
      observed
        ? `The server reported ${data.map} at ${formatObserved(data.observed_at)}.`
        : 'The server did not report a map. The requested setup remains unverified.'
    );
    setText('session-observed-map', data.map ?? 'Not reported');
    setText('session-observed-players', playerObservation(data));
    setText('session-comparison-observed', `Observed · ${formatObserved(data.observed_at)}`);
    setText('session-observation-label', 'Observed');
    const pending = el('#session-pending-result');
    const result = el('#session-observed-result');
    if (pending) pending.hidden = true;
    if (result) result.hidden = false;
    el('#session-result-heading')?.classList.toggle('session-map-matched', matches);
    setMessage(
      'session-result-error',
      [
        setupFailed
          ? 'The setup request failed. A matching map does not confirm the other commands.'
          : '',
        data.error ?? '',
      ]
        .filter(Boolean)
        .join(' ') || null
    );
    const done = el('#session-return');
    if (done) done.hidden = !matches || setupFailed;
    const back = el('#session-edit-setup');
    if (back) back.hidden = matches && !setupFailed;
    setText(
      'session-result-status',
      matches
        ? 'Requested map observed. Mode and team names remain unverified.'
        : 'Map not confirmed. Setup has not been sent again.'
    );
    el('#session-result-heading')?.focus();
  } catch (error) {
    if (requestGeneration !== submissionGeneration) return;
    setMessage(
      'session-result-error',
      error instanceof Error ? error.message : 'Observation unavailable.'
    );
    setText('session-result-heading', 'Observation unavailable');
    el('#session-result-heading')?.classList.remove('session-map-matched');
    setText(
      'session-result-description',
      'The latest check failed. Previous observations may be stale.'
    );
    setText('session-comparison-observed', 'Previous observation');
    const done = el('#session-return');
    if (done) done.hidden = true;
    const back = el('#session-edit-setup');
    if (back) back.hidden = false;
    setText('session-result-status', 'Observation failed. Setup has not been sent again.');
  } finally {
    checking = false;
    if (doneButton) doneButton.disabled = false;
    if (check) {
      check.disabled = false;
      if (requestGeneration === submissionGeneration) {
        check.textContent = 'Refresh observation';
        check.className = 'btn btn-secondary';
      }
    }
  }
}

export function initSessionFlow(): void {
  document.addEventListener('manage:tab', (event) => {
    const name = (event as CustomEvent<string>).detail;
    const result = document.body.classList.contains('session-showing-result');
    for (const [id, selected] of [
      ['session-step-setup', !result],
      ['session-step-result', result],
    ] as const) {
      const step = document.getElementById(id);
      if (name === 'setup' && selected) step?.setAttribute('aria-current', 'step');
      else step?.removeAttribute('aria-current');
    }
  });
  const showSetup = (): void => {
    el<HTMLButtonElement>('[data-manage-tab="setup"]')?.click();
    showResult(false);
  };
  el('#session-step-setup')?.addEventListener('click', showSetup);
  el('#session-edit-setup')?.addEventListener('click', showSetup);
  el('#session-step-result')?.addEventListener('click', () => {
    if (!submitted) return;
    el<HTMLButtonElement>('[data-manage-tab="setup"]')?.click();
    showResult(true);
  });
  el('#session-check-map')?.addEventListener('click', () => {
    void checkMap();
  });
  el('#session-return')?.addEventListener('click', () => {
    showSetup();
    el('#manage-title')?.focus();
  });
}
