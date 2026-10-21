/** Coordinates explicit RCON commands, debounced suggestions, and bounded history. */
import {
  ApiError,
  fetchJson,
  sendPostRequest,
  showToast,
  toastError,
  withLoading,
  showConfirm,
} from './common';
import {
  el,
  formatObserved,
  on,
  type AutocompleteResponse,
  type RconHistoryResponse,
  type RconHistoryRow,
} from './manageShared';
import { renderSuggestions } from './manageRconSuggestions';
import { createCommandRecall } from './manageRconRecall';
import { createSuggestGate } from './manageRconSuggestGate';
import { renderRconCommandResult, type RconCommandResponse } from './manageRconResult';

function autocompleteQuery(input: HTMLInputElement | null): string {
  return input ? input.value.trim() : '';
}

function autocompleteParams(query: string, refresh: boolean): URLSearchParams {
  const params = new URLSearchParams({ q: query, limit: '12' });
  if (refresh) params.set('refresh', '1');
  return params;
}

export function initRconControls(serverId: string): void {
  const rconInput = el<HTMLInputElement>('#rconInput');
  const suggestionsBox = el<HTMLDivElement>('#rconSuggestions');
  const historyList = el<HTMLDivElement>('#rconHistoryList');
  let suggestTimer: ReturnType<typeof setTimeout> | undefined;
  const recall = createCommandRecall();
  const suggestGate = createSuggestGate();

  async function loadSuggestions(refresh = false): Promise<void> {
    const q = autocompleteQuery(rconInput);
    if (!refresh && q.length < 2) {
      renderSuggestions(suggestionsBox, []);
      return;
    }
    // Typing must not keep hitting an endpoint that is rate limiting us; Suggest still works.
    if (!refresh && !suggestGate.canRequest(Date.now())) return;
    try {
      const params = autocompleteParams(q, refresh);
      const data = await fetchJson<AutocompleteResponse>(
        `/api/rcon/autocomplete/${serverId}?${params.toString()}`
      );
      renderSuggestions(suggestionsBox, data.suggestions);
      if (data.error) {
        if (suggestGate.onFailure(undefined, Date.now()) || refresh)
          showToast(`Autocomplete warning: ${data.error}`, 'info');
      } else {
        suggestGate.onSuccess();
      }
    } catch (err) {
      renderSuggestions(suggestionsBox, []);
      const status = err instanceof ApiError ? err.status : undefined;
      if (suggestGate.onFailure(status, Date.now()) || refresh)
        showToast(err instanceof Error ? err.message : 'Autocomplete failed.', 'error');
    }
  }

  function renderHistory(commands: RconHistoryRow[] | null): void {
    if (!historyList) return;
    historyList.replaceChildren();
    if (commands === null) {
      const error = document.createElement('p');
      error.className = 'empty-state';
      error.textContent = 'RCON sent-command history unavailable.';
      historyList.appendChild(error);
      return;
    }
    if (!commands.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No commands sent yet. Your command history appears here.';
      historyList.appendChild(empty);
      return;
    }
    commands.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'compact-row';
      const main = document.createElement('div');
      main.className = 'compact-row-main';
      const title = document.createElement('div');
      title.className = 'compact-row-title';
      title.textContent = item.command;
      const meta = document.createElement('div');
      meta.className = 'compact-row-meta';
      meta.textContent = `${item.use_count} use${item.use_count === 1 ? '' : 's'} · last ${formatObserved(item.last_used_at)}`;
      main.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'btn btn-secondary btn-sm';
      use.textContent = 'Use';
      use.dataset.historyCommand = item.command;
      actions.appendChild(use);
      row.append(main, actions);
      historyList.appendChild(row);
    });
  }

  async function loadHistory(): Promise<void> {
    try {
      const data = await fetchJson<RconHistoryResponse>(`/api/rcon/history/${serverId}`);
      recall.setHistory(data.commands.map((item) => item.command));
      renderHistory(data.commands);
    } catch (err) {
      renderHistory(null);
      showToast(
        err instanceof Error ? err.message : 'RCON sent-command history unavailable.',
        'error'
      );
    }
  }

  function sendSayMessage(): void {
    const input = el<HTMLInputElement>('#say_input');
    const msg = input?.value.trim() ?? '';
    if (!msg) {
      showToast('Message cannot be empty.', 'error');
      return;
    }
    sendPostRequest('/api/say-admin', { server_id: serverId, message: msg })
      .then((d) => {
        showToast(d.message, 'success');
        if (input) input.value = '';
      })
      .catch(toastError('Failed to send message.'));
  }
  on('#say_input_btn', 'click', sendSayMessage);
  el('#say_input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      sendSayMessage();
    }
  });

  // The input keeps the command until it succeeds, so a second Enter must not resend it.
  let commandInFlight = false;
  function sendRconCommand(): void {
    if (commandInFlight) return;
    const cmd = rconInput?.value.trim() ?? '';
    if (!cmd) {
      showToast('Command cannot be empty.', 'error');
      return;
    }
    const btn = el<HTMLButtonElement>('#rconInputBtn');
    commandInFlight = true;
    withLoading(btn, () =>
      sendPostRequest('/api/rcon', { server_id: serverId, command: cmd })
        .then((d: RconCommandResponse) => {
          recall.remember(cmd);
          if (rconInput && rconInput.value.trim() === cmd) rconInput.value = '';
          renderSuggestions(suggestionsBox, []);
          renderRconCommandResult(cmd, d);
          void loadHistory();
        })
        .catch(toastError('RCON command failed.'))
        .finally(() => {
          commandInFlight = false;
        })
    );
  }
  on('#rconInputBtn', 'click', sendRconCommand);
  rconInput?.addEventListener('keydown', (e) => {
    const key = (e as KeyboardEvent).key;
    if (key === 'Enter') {
      e.preventDefault();
      sendRconCommand();
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      const next = key === 'ArrowUp' ? recall.older(rconInput.value) : recall.newer();
      if (next === null) return;
      e.preventDefault();
      rconInput.value = next;
      rconInput.setSelectionRange(next.length, next.length);
    }
  });
  rconInput?.addEventListener('input', () => {
    recall.reset();
    if (suggestTimer) clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => {
      void loadSuggestions(false);
    }, 250);
  });
  on('#rconSuggestRefreshBtn', 'click', () => {
    void loadSuggestions(true);
  });

  suggestionsBox?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-suggestion]');
    const suggestion = button?.dataset.suggestion;
    if (!suggestion || !rconInput) return;
    rconInput.value = suggestion;
    rconInput.focus();
    renderSuggestions(suggestionsBox, []);
  });

  historyList?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-history-command]'
    );
    const command = button?.dataset.historyCommand;
    if (!command || !rconInput) return;
    rconInput.value = command;
    rconInput.focus();
  });

  on('#rconHistoryClearBtn', 'click', () => {
    void showConfirm('Clear sent RCON command history for this server?').then((confirmed) => {
      if (!confirmed) return;
      void fetchJson<{ message: string }>(`/api/rcon/history/${serverId}`, { method: 'DELETE' })
        .then((d) => {
          showToast(d.message, 'success');
          void loadHistory();
        })
        .catch(toastError('Clear history failed.'));
    });
  });

  on('#rconClearBtn', 'click', () => {
    const rconResultText = el<HTMLElement>('#rconResultText');
    const rconResultBox = el<HTMLElement>('#rconResultBox');
    if (rconResultText) rconResultText.textContent = '';
    if (rconResultBox) rconResultBox.style.removeProperty('display');
  });

  void loadHistory();
}
