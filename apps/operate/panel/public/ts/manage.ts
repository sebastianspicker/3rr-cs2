import { sendPostRequest, initToast, showToast, toastError, withLoading, showConfirm } from './common';
import { getServerId } from './context';

interface GameModesResponse {
  gameModes: string[];
}

interface MapsResponse {
  maps: string[];
}

interface LiveStatusResponse {
  map?: string;
  humans?: number;
  bots?: number;
  max_players?: number;
  last_game_type?: string;
  last_game_mode?: string;
}


function el<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

function on(sel: string, event: string, handler: EventListener): void {
  el(sel)?.addEventListener(event, handler);
}

function setToggleActive(groupKey: string, val: number): void {
  document.querySelectorAll<HTMLElement>(`[data-toggle-group="${groupKey}"]`).forEach(btn => {
    const btnVal = parseInt(btn.dataset['toggleVal'] ?? '', 10);
    if (btnVal === val) {
      btn.classList.remove('btn-outline-info');
      btn.classList.add('btn-info');
    } else {
      btn.classList.remove('btn-info');
      btn.classList.add('btn-outline-info');
    }
  });
}

function setPresetActive(containerSel: string, activeId: string): void {
  document.querySelectorAll<HTMLElement>(`${containerSel} .btn`).forEach(btn => btn.classList.remove('btn-active'));
  el(activeId)?.classList.add('btn-active');
}

function bindToggle(key: string, endpoint: string, label: string): void {
  on(`#${key}_on`, 'click', () =>
    sendPostRequest(`/api/${endpoint}`, { server_id: getServerId(), value: 1 })
      .then(d => { showToast(d.message, 'success'); setToggleActive(key, 1); })
      .catch(toastError(`${label} On failed.`)),
  );
  on(`#${key}_off`, 'click', () =>
    sendPostRequest(`/api/${endpoint}`, { server_id: getServerId(), value: 0 })
      .then(d => { showToast(d.message, 'success'); setToggleActive(key, 0); })
      .catch(toastError(`${label} Off failed.`)),
  );
}

function bindPreset(
  values: number[],
  endpoint: string,
  containerSel: string,
  idPrefix: string,
  label: string,
): void {
  values.forEach(v => {
    on(`#${idPrefix}${v}`, 'click', () =>
      sendPostRequest(`/api/${endpoint}`, { server_id: getServerId(), value: v })
        .then(d => { showToast(d.message, 'success'); setPresetActive(containerSel, `#${idPrefix}${v}`); })
        .catch(toastError(`${label} failed.`)),
    );
  });
}

function initGameSetup(): void {
  const typeContainer = el<HTMLDivElement>('#gameTypeBtns');
  const modeContainer = el<HTMLDivElement>('#gameModeBtns');
  const mapSelect = el<HTMLSelectElement>('#selectedMap');
  const gameTypeVal = el<HTMLInputElement>('#gameTypeValue');
  const gameModeVal = el<HTMLInputElement>('#gameModeValue');
  if (!typeContainer || !modeContainer || !mapSelect || !gameTypeVal || !gameModeVal) return;

  function activateBtn(container: HTMLElement, attr: string, value: string): void {
    container.querySelectorAll<HTMLButtonElement>('.btn').forEach(btn => {
      btn.classList.toggle('btn-active', btn.getAttribute(attr) === value);
    });
  }

  function setModeColsClass(count: number): void {
    modeContainer!.className = 'btn-grid';
    const cols = count <= 2 ? 'cols-2' : count <= 4 ? 'cols-3' : 'cols-4';
    modeContainer!.classList.add(cols);
  }

  function setMapPlaceholder(text: string): void {
    mapSelect!.replaceChildren();
    const opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = text;
    mapSelect!.appendChild(opt);
  }

  async function loadModes(type: string): Promise<void> {
    try {
      const resp = await fetch(`/api/game-types/${encodeURIComponent(type)}/game-modes`);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const { gameModes: modes } = await resp.json() as GameModesResponse;
      modeContainer!.replaceChildren();
      if (!modes.length) {
        setModeColsClass(0);
        setMapPlaceholder('No maps available');
        return;
      }
      setModeColsClass(modes.length);
      modes.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary';
        btn.setAttribute('data-game-mode', m);
        btn.textContent = m;
        modeContainer!.appendChild(btn);
      });
      // Auto-select first mode (guard at line 112 ensures modes is non-empty here)
      const firstMode = modes[0]!;
      gameModeVal!.value = firstMode;
      activateBtn(modeContainer!, 'data-game-mode', firstMode);
      await loadMaps(type, firstMode);
    } catch {
      showToast('Failed to load game modes.', 'error');
    }
  }

  async function loadMaps(type: string, mode: string): Promise<void> {
    try {
      const resp = await fetch(
        `/api/game-types/${encodeURIComponent(type)}/game-modes/${encodeURIComponent(mode)}/maps`,
      );
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const { maps } = await resp.json() as MapsResponse;
      mapSelect!.replaceChildren();
      if (maps.length) {
        maps.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          mapSelect!.appendChild(opt);
        });
      } else {
        setMapPlaceholder('No maps available');
      }
    } catch {
      showToast('Failed to load maps.', 'error');
    }
  }

  // Wire game type buttons via delegation
  typeContainer.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-game-type]');
    if (!btn) return;
    const type = btn.getAttribute('data-game-type') ?? '';
    if (!type) return;
    gameTypeVal!.value = type;
    activateBtn(typeContainer, 'data-game-type', type);
    void loadModes(type);
  });

  // Wire mode buttons via delegation (reads current gameTypeVal to avoid stale closure)
  modeContainer.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-game-mode]');
    if (!btn) return;
    const m = btn.getAttribute('data-game-mode') ?? '';
    if (!m) return;
    gameModeVal!.value = m;
    activateBtn(modeContainer!, 'data-game-mode', m);
    void loadMaps(gameTypeVal!.value, m);
  });

  // Initialize with first game type
  const firstTypeBtn = typeContainer.querySelector<HTMLButtonElement>('[data-game-type]');
  if (firstTypeBtn) {
    const firstType = firstTypeBtn.getAttribute('data-game-type') ?? '';
    if (firstType) {
      gameTypeVal.value = firstType;
      firstTypeBtn.classList.add('btn-active');
      void loadModes(firstType);
    }
  }

  // Setup-game form
  const deployBtn = el<HTMLButtonElement>('button[form="server_setup_form"]');
  el('#server_setup_form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      server_id:   getServerId(),
      team1:       el<HTMLInputElement>('#team1')?.value ?? '',
      team2:       el<HTMLInputElement>('#team2')?.value ?? '',
      game_type:   gameTypeVal.value,
      game_mode:   gameModeVal.value,
      selectedMap: mapSelect.value,
    };
    withLoading(deployBtn, () =>
      sendPostRequest('/api/setup-game', payload)
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Setup Game failed.'))
    );
  });

  // Map group selector
  on('#setMapGroupBtn', 'click', () => {
    const group = el<HTMLSelectElement>('#mapGroupSelect')?.value ?? '';
    if (!group) return showToast('Select a map group first.', 'error');
    sendPostRequest('/api/set-mapgroup', { server_id: getServerId(), group })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Set map group failed.'));
  });
}

function initQuickCommands(): void {
  const quickCommands: Array<{ selector: string; endpoint: string }> = [
    { selector: '#scramble_teams', endpoint: '/api/scramble-teams' },
    { selector: '#kick_all_bots',  endpoint: '/api/kick-all-bots' },
    { selector: '#add_bot',        endpoint: '/api/add-bot' },
    { selector: '#kill_bots',      endpoint: '/api/kill-bots' },
  ];
  quickCommands.forEach(cmd => {
    on(cmd.selector, 'click', () => {
      sendPostRequest(cmd.endpoint, { server_id: getServerId() })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Quick command failed.'));
    });
  });
}

function initMatchSettings(): void {
  bindToggle('limitteams', 'limitteams-toggle', 'LimitTeams');
  bindToggle('autoteam', 'autoteam-toggle', 'AutoBalance');
  bindToggle('friendlyfire', 'friendlyfire-toggle', 'FriendlyFire');
  bindToggle('autokick', 'autokick-toggle', 'AutoKick');
}

function initPracticeControls(): void {
  // Toggles
  bindToggle('cheats', 'cheats-toggle', 'Cheats');
  bindToggle('free_armor', 'free-armor-toggle', 'Free Armor');
  bindToggle('buy_anywhere', 'buy-anywhere-toggle', 'Buy Anywhere');
  bindToggle('grenade_trail', 'grenade-trajectory-toggle', 'Grenade Trail');
  bindToggle('show_impacts', 'show-impacts-toggle', 'Show Impacts');
  bindToggle('respawn', 'respawn-toggle', 'Respawn');
  bindToggle('damage_print', 'damage-print-toggle', 'Damage Print');
  bindToggle('random_rounds', 'random-rounds-toggle', 'Random Rounds');
  bindToggle('rtd', 'rtd-toggle', 'RTD');

  on('#rtd_force_roll', 'click', () => {
    void showConfirm('Force-roll dice for all players?').then(confirmed => {
      if (!confirmed) return;
      sendPostRequest('/api/rtd-force-roll', { server_id: getServerId() })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Force roll failed.'));
    });
  });

  // Presets
  bindPreset([0, 1, 2], 'infinite-ammo-toggle', '#inf-ammo-presets', 'inf_ammo_', 'Infinite ammo');
  bindPreset([0, 5, 10, 15, 20], 'set-freezetime', '#freezetime-presets', 'freezetime_', 'Freeze time');
  bindPreset([0, 800, 1600, 3200, 16000], 'set-startmoney', '#startmoney-presets', 'startmoney_', 'Start money');
  bindPreset([0, 1, 2, 3], 'bot-difficulty', '#bot-difficulty-presets', 'bot_difficulty_', 'Bot difficulty');
  bindPreset([1, 2, 5, 60], 'set-roundtime', '#roundtime-presets', 'roundtime_', 'Round time');
  bindPreset([10, 15, 30, 45, 90], 'set-buytime', '#buytime-presets', 'buytime_', 'Buy time');

  // Per-team bot controls
  const botCmds: Array<{ id: string; endpoint: string }> = [
    { id: 'bot_add_ct',  endpoint: '/api/bot-add-ct' },
    { id: 'bot_add_t',   endpoint: '/api/bot-add-t' },
    { id: 'bot_kick_ct', endpoint: '/api/bot-kick-ct' },
    { id: 'bot_kick_t',  endpoint: '/api/bot-kick-t' },
  ];
  botCmds.forEach(cmd => {
    on(`#${cmd.id}`, 'click', () =>
      sendPostRequest(cmd.endpoint, { server_id: getServerId() })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Bot action failed.')),
    );
  });

  // Give Nade Kit
  const nadeMap: Record<string, string> = {
    give_flash:   'weapon_flashbang',
    give_smoke:   'weapon_smokegrenade',
    give_he:      'weapon_hegrenade',
    give_molotov: 'weapon_molotov',
    give_decoy:   'weapon_decoy',
    give_incen:   'weapon_incgrenade',
  };
  Object.keys(nadeMap).forEach(id => {
    on(`#${id}`, 'click', () =>
      sendPostRequest('/api/give-weapon', { server_id: getServerId(), weapon: nadeMap[id] ?? '' })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Give weapon failed.')),
    );
  });

  // Movement / quick practice
  const practiceButtons: Array<{ id: string; endpoint: string }> = [
    { id: 'noclip_btn',       endpoint: '/api/noclip' },
    { id: 'rethrow_nade_btn', endpoint: '/api/rethrow-grenade' },
  ];
  practiceButtons.forEach(cmd => {
    on(`#${cmd.id}`, 'click', () =>
      sendPostRequest(cmd.endpoint, { server_id: getServerId() })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Command failed.')),
    );
  });
}

function initScrimControls(): void {
  let currentOtMaxrounds = 6;
  bindPreset([16, 24, 30], 'set-maxrounds', '#maxrounds-presets', 'maxrounds_', 'Max rounds');

  [3, 5, 6].forEach(n => {
    on(`#ot_rounds_${n}`, 'click', () => {
      currentOtMaxrounds = n;
      setPresetActive('#ot-rounds-presets', `#ot_rounds_${n}`);
    });
  });

  on('#overtime_on', 'click', () =>
    sendPostRequest('/api/set-overtime', { server_id: getServerId(), enable: 1, ot_rounds: currentOtMaxrounds })
      .then(d => { showToast(d.message, 'success'); setToggleActive('overtime', 1); })
      .catch(toastError('Overtime On failed.')),
  );
  on('#overtime_off', 'click', () =>
    sendPostRequest('/api/set-overtime', { server_id: getServerId(), enable: 0, ot_rounds: currentOtMaxrounds })
      .then(d => { showToast(d.message, 'success'); setToggleActive('overtime', 0); })
      .catch(toastError('Overtime Off failed.')),
  );
}

function initConfirmActions(): void {
  const confirmActions: Array<{ id: string; endpoint: string; prompt: string; fallback: string }> = [
    { id: 'pause_game',    endpoint: '/api/pause',         prompt: 'Pause the game?',            fallback: 'Pause failed.' },
    { id: 'unpause_game',  endpoint: '/api/unpause',       prompt: 'Unpause the game?',          fallback: 'Unpause failed.' },
    { id: 'restart_game',  endpoint: '/api/restart',       prompt: 'Restart the game?',          fallback: 'Restart failed.' },
    { id: 'start_warmup',  endpoint: '/api/start-warmup',  prompt: 'Start warmup?',              fallback: 'Warmup failed.' },
    { id: 'knife_start',   endpoint: '/api/start-knife',   prompt: 'Start knife round?',         fallback: 'Knife start failed.' },
    { id: 'swap_team',     endpoint: '/api/swap-team',     prompt: 'Swap teams?',                fallback: 'Swap teams failed.' },
    { id: 'matchzy_match', endpoint: '/api/matchzy-match', prompt: 'Start match via MatchZy?',   fallback: 'Start match failed.' },
    { id: 'matchzy_abort', endpoint: '/api/matchzy-abort', prompt: 'Abort the current match?',   fallback: 'Abort failed.' },
  ];
  confirmActions.forEach(({ id, endpoint, prompt: msg, fallback }) => {
    on(`#${id}`, 'click', async () => {
      if (!(await showConfirm(msg))) return;
      sendPostRequest(endpoint, { server_id: getServerId() })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError(fallback));
    });
  });
}

function initMatchzyCommands(): void {
  const matchzyCommands: Array<{ selector: string; endpoint: string }> = [
    { selector: '#matchzy_practice', endpoint: '/api/matchzy-practice' },
    { selector: '#matchzy_exitprac', endpoint: '/api/matchzy-exitprac' },
    { selector: '#matchzy_playout',  endpoint: '/api/matchzy-playout' },
  ];
  matchzyCommands.forEach(cmd => {
    on(cmd.selector, 'click', () => {
      sendPostRequest(cmd.endpoint, { server_id: getServerId() })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('MatchZy command failed.'));
    });
  });

  on('#matchzy_coach_ct', 'click', () =>
    sendPostRequest('/api/matchzy-coach', { server_id: getServerId(), side: 'ct' })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Coach CT failed.'))
  );
  on('#matchzy_coach_t', 'click', () =>
    sendPostRequest('/api/matchzy-coach', { server_id: getServerId(), side: 't' })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Coach T failed.'))
  );

  on('#matchzy_load_match_file_btn', 'click', async () => {
    const input = el<HTMLInputElement>('#matchzy_match_file_input');
    const filename = input?.value.trim() ?? '';
    if (!filename) return showToast('Enter a filename (e.g. match.json)', 'error');
    if (!(await showConfirm(`Load match config from ${filename}?`))) return;
    sendPostRequest('/api/matchzy-load-match-file', { server_id: getServerId(), filename })
      .then(d => { showToast(d.message, 'success'); if (input) input.value = ''; })
      .catch(toastError('Load match file failed.'));
  });
}

function initPlayerManagement(): void {
  on('#player_kick_btn', 'click', async () => {
    const input = el<HTMLInputElement>('#player_userid_input');
    const userid = input?.value.trim() ?? '';
    if (!userid) return showToast('Enter a user ID first.', 'error');
    if (!(await showConfirm(`Kick player ${userid}?`))) return;
    sendPostRequest('/api/player-kick', { server_id: getServerId(), userid })
      .then(d => { showToast(d.message, 'success'); if (input) input.value = ''; })
      .catch(toastError('Kick failed.'));
  });

  on('#player_mute_btn', 'click', () => {
    const steamid = el<HTMLInputElement>('#player_steamid_input')?.value.trim() ?? '';
    if (!steamid) return showToast('Enter a SteamID64 first.', 'error');
    sendPostRequest('/api/player-mute', { server_id: getServerId(), steamid })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Mute failed.'));
  });

  on('#player_unmute_btn', 'click', () => {
    const steamid = el<HTMLInputElement>('#player_steamid_input')?.value.trim() ?? '';
    if (!steamid) return showToast('Enter a SteamID64 first.', 'error');
    sendPostRequest('/api/player-unmute', { server_id: getServerId(), steamid })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Unmute failed.'));
  });
}

function initRconControls(): void {
  function sendSayMessage(): void {
    const input = el<HTMLInputElement>('#say_input');
    const msg = input?.value.trim() ?? '';
    if (!msg) return showToast('Message cannot be empty.', 'error');
    sendPostRequest('/api/say-admin', { server_id: getServerId(), message: msg })
      .then(d => { showToast(d.message, 'success'); if (input) input.value = ''; })
      .catch(toastError('Failed to send message.'));
  }
  on('#say_input_btn', 'click', sendSayMessage);
  el('#say_input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); sendSayMessage(); }
  });

  function sendRconCommand(): void {
    const rconInput = el<HTMLInputElement>('#rconInput');
    const cmd = rconInput?.value.trim() ?? '';
    if (!cmd) return showToast('Command cannot be empty.', 'error');
    const btn = el<HTMLButtonElement>('#rconInputBtn');
    withLoading(btn, () =>
      sendPostRequest('/api/rcon', { server_id: getServerId(), command: cmd })
        .then(d => {
          if (d.output) {
            const rconResultBox = el<HTMLElement>('#rconResultBox');
            const rconResultText = el<HTMLElement>('#rconResultText');
            const timestamp = new Date().toLocaleTimeString();
            const prev = rconResultText?.textContent ?? '';
            const entry = `[${timestamp}] > ${cmd}\n${d.output}`;
            if (rconResultText) rconResultText.textContent = prev ? `${prev}\n${entry}` : entry;
            if (rconResultBox) rconResultBox.style.display = 'block';
            if (rconResultText) rconResultText.scrollTop = rconResultText.scrollHeight;
          } else {
            showToast(d.message, 'success');
          }
        })
        .catch(toastError('RCON command failed.'))
    );
    if (rconInput) rconInput.value = '';
  }
  on('#rconInputBtn', 'click', sendRconCommand);
  el('#rconInput')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); sendRconCommand(); }
  });

  on('#rconClearBtn', 'click', () => {
    const rconResultText = el<HTMLElement>('#rconResultText');
    const rconResultBox = el<HTMLElement>('#rconResultBox');
    if (rconResultText) rconResultText.textContent = '';
    if (rconResultBox) rconResultBox.style.removeProperty('display');
  });
}

function initBackups(): void {
  on('#list_backups', 'click', () => {
    sendPostRequest('/api/list-backups', { server_id: getServerId() })
      .then(d => showToast(d.message, 'info'))
      .catch(toastError('List backups failed.'));
  });
  on('#restore_latest_backup', 'click', async () => {
    if (!(await showConfirm('Restore latest backup?'))) return;
    sendPostRequest('/api/restore-latest-backup', { server_id: getServerId() })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Restore latest failed.'));
  });
  on('#restore_backup', 'click', () => {
    const row = el<HTMLElement>('#restore_backup_row');
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) {
      const input = el<HTMLInputElement>('#restore_round_input');
      if (input) { input.focus(); input.value = ''; }
    }
  });
  on('#restore_round_cancel', 'click', () => {
    const row = el<HTMLElement>('#restore_backup_row');
    if (row) row.hidden = true;
  });
  el('#restore_round_input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      el<HTMLButtonElement>('#restore_round_submit')?.click();
    }
  });
  on('#restore_round_submit', 'click', () => {
    const n = parseInt(el<HTMLInputElement>('#restore_round_input')?.value ?? '', 10);
    if (isNaN(n) || n < 1 || n > 99) {
      showToast('Invalid round number (1–99)', 'error');
      return;
    }
    sendPostRequest('/api/restore-round', { server_id: getServerId(), round_number: n })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Restore failed.'));
    const row = el<HTMLElement>('#restore_backup_row');
    if (row) row.hidden = true;
  });
}

function initWorkshopMap(): void {
  const WORKSHOP_URL_RE = /(?:id=|filedetails\/\?id=)(\d{5,20})/;

  on('#loadWorkshopMap', 'click', async () => {
    const urlInput = el<HTMLInputElement>('#workshopUrl');
    const raw = urlInput?.value.trim() ?? '';
    if (!raw) return showToast('Paste a workshop URL first.', 'error');
    const match = raw.match(WORKSHOP_URL_RE);
    const workshopId = match ? match[1] : (/^\d{5,20}$/.test(raw) ? raw : null);
    if (!workshopId) return showToast('Could not extract workshop ID from URL.', 'error');
    if (!(await showConfirm(`Load workshop map ${workshopId}?`))) return;
    sendPostRequest('/api/workshop-map', { server_id: getServerId(), workshop_id: workshopId })
      .then(d => { showToast(d.message, 'success'); if (urlInput) urlInput.value = ''; })
      .catch(toastError('Workshop map failed.'));
  });

  const COLLECTION_ID_RE = /^\d{5,20}$/;

  on('#loadWorkshopCollection', 'click', async () => {
    const collInput = el<HTMLInputElement>('#workshopCollectionId');
    const raw = collInput?.value.trim() ?? '';
    if (!raw) return showToast('Paste a Workshop Collection ID first.', 'error');
    if (!COLLECTION_ID_RE.test(raw)) return showToast('Collection ID must be 5–20 digits.', 'error');
    if (!(await showConfirm(`Load workshop collection ${raw}?`))) return;
    sendPostRequest('/api/workshop-collection', { server_id: getServerId(), collection_id: raw })
      .then(d => { showToast(d.message, 'success'); if (collInput) collInput.value = ''; })
      .catch(toastError('Workshop collection failed.'));
  });
}

function initLiveStatus(): void {
  let liveStatusInterval: ReturnType<typeof setInterval> | undefined;
  function setEl(id: string, val: string): void {
    const e = document.getElementById(id);
    if (e) e.textContent = val;
  }

  async function fetchLiveStatus(): Promise<void> {
    try {
      const resp = await fetch(`/api/status/${getServerId()}`);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = await resp.json() as LiveStatusResponse;

      setEl('live-map',       data.map            ?? '–');
      const playersStr = data.humans != null
        ? (data.max_players != null ? `${data.humans}/${data.max_players}` : String(data.humans))
        : '–';
      setEl('live-players',   playersStr);
      setEl('live-bots',      data.bots     != null ? String(data.bots)    : '–');
      setEl('last-game-type', data.last_game_type  ?? '–');
      setEl('last-game-mode', data.last_game_mode  ?? '–');

      const cfgLabel = (data.last_game_type && data.last_game_mode)
        ? `${data.last_game_type} / ${data.last_game_mode}`
        : '–';
      setEl('live-active-cfg', cfgLabel);

      const updated = el<HTMLElement>('#live-status-updated');
      if (updated) updated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
    } catch { /* polling — silent on network errors */ }
  }

  void fetchLiveStatus();
  on('#refresh_status', 'click', () => { void fetchLiveStatus(); });
  liveStatusInterval = setInterval(() => { void fetchLiveStatus(); }, 30000);
  window.addEventListener('beforeunload', () => clearInterval(liveStatusInterval));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(liveStatusInterval);
      liveStatusInterval = undefined;
    } else if (!liveStatusInterval) {
      void fetchLiveStatus();
      liveStatusInterval = setInterval(() => { void fetchLiveStatus(); }, 30000);
    }
  });
}

export function initManagePage(): void {
  initToast();
  initGameSetup();
  initQuickCommands();
  initMatchSettings();
  initPracticeControls();
  initScrimControls();
  initConfirmActions();
  initMatchzyCommands();
  initPlayerManagement();
  initRconControls();
  initBackups();
  initWorkshopMap();
  initLiveStatus();
}
