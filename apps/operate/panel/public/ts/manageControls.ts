import { sendPostRequest, showToast, toastError, showConfirm } from './common';
import { el, on } from './manageShared';

function setToggleActive(groupKey: string, val: number): void {
  document.querySelectorAll<HTMLElement>(`[data-toggle-group="${groupKey}"]`).forEach(btn => {
    const btnVal = parseInt(btn.dataset.toggleVal ?? '', 10);
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
  document.querySelectorAll<HTMLElement>(`${containerSel} .btn`).forEach(btn => {
    btn.classList.remove('btn-active');
  });
  el(activeId)?.classList.add('btn-active');
}

function bindToggle(serverId: string, key: string, endpoint: string, label: string): void {
  on(`#${key}_on`, 'click', () => {
    void sendPostRequest(`/api/${endpoint}`, { server_id: serverId, value: 1 })
      .then(d => { showToast(d.message, 'success'); setToggleActive(key, 1); })
      .catch(toastError(`${label} On failed.`));
  });
  on(`#${key}_off`, 'click', () => {
    void sendPostRequest(`/api/${endpoint}`, { server_id: serverId, value: 0 })
      .then(d => { showToast(d.message, 'success'); setToggleActive(key, 0); })
      .catch(toastError(`${label} Off failed.`));
  });
}

interface PresetBinding {
  values: number[];
  endpoint: string;
  container: string;
  idPrefix: string;
  label: string;
}

function bindPreset(serverId: string, binding: PresetBinding): void {
  binding.values.forEach(value => {
    on(`#${binding.idPrefix}${value}`, 'click', () => {
      void sendPostRequest(`/api/${binding.endpoint}`, { server_id: serverId, value })
        .then(data => {
          showToast(data.message, 'success');
          setPresetActive(binding.container, `#${binding.idPrefix}${value}`);
        })
        .catch(toastError(`${binding.label} failed.`));
    });
  });
}

export function initQuickCommands(serverId: string): void {
  const quickCommands: Array<{ selector: string; endpoint: string }> = [
    { selector: '#scramble_teams', endpoint: '/api/scramble-teams' },
    { selector: '#kick_all_bots',  endpoint: '/api/kick-all-bots' },
    { selector: '#add_bot',        endpoint: '/api/add-bot' },
    { selector: '#kill_bots',      endpoint: '/api/kill-bots' },
  ];
  quickCommands.forEach(cmd => {
    on(cmd.selector, 'click', () => {
      void sendPostRequest(cmd.endpoint, { server_id: serverId })
        .then(d => {
          showToast(d.message, 'success');
        })
        .catch(toastError('Quick command failed.'));
    });
  });
}

export function initMatchSettings(serverId: string): void {
  bindToggle(serverId, 'limitteams', 'limitteams-toggle', 'LimitTeams');
  bindToggle(serverId, 'autoteam', 'autoteam-toggle', 'AutoBalance');
  bindToggle(serverId, 'friendlyfire', 'friendlyfire-toggle', 'FriendlyFire');
  bindToggle(serverId, 'autokick', 'autokick-toggle', 'AutoKick');
}

export function initPracticeControls(serverId: string): void {
  // Toggles
  bindToggle(serverId, 'cheats', 'cheats-toggle', 'Cheats');
  bindToggle(serverId, 'free_armor', 'free-armor-toggle', 'Free Armor');
  bindToggle(serverId, 'buy_anywhere', 'buy-anywhere-toggle', 'Buy Anywhere');
  bindToggle(serverId, 'grenade_trail', 'grenade-trajectory-toggle', 'Grenade Trail');
  bindToggle(serverId, 'show_impacts', 'show-impacts-toggle', 'Show Impacts');
  bindToggle(serverId, 'respawn', 'respawn-toggle', 'Respawn');
  bindToggle(serverId, 'damage_print', 'damage-print-toggle', 'Damage Print');
  bindToggle(serverId, 'random_rounds', 'random-rounds-toggle', 'Random Rounds');
  bindToggle(serverId, 'rtd', 'rtd-toggle', 'RTD');

  on('#rtd_force_roll', 'click', () => {
    void showConfirm('Force-roll dice for all players?').then(confirmed => {
      if (!confirmed) return;
      sendPostRequest('/api/rtd-force-roll', { server_id: serverId })
        .then(d => {
          showToast(d.message, 'success');
        })
        .catch(toastError('Force roll failed.'));
    });
  });

  // Presets
  bindPreset(serverId, { values: [0, 1, 2], endpoint: 'infinite-ammo-toggle', container: '#inf-ammo-presets', idPrefix: 'inf_ammo_', label: 'Infinite ammo' });
  bindPreset(serverId, { values: [0, 5, 10, 15, 20], endpoint: 'set-freezetime', container: '#freezetime-presets', idPrefix: 'freezetime_', label: 'Freeze time' });
  bindPreset(serverId, { values: [0, 800, 1600, 3200, 16000], endpoint: 'set-startmoney', container: '#startmoney-presets', idPrefix: 'startmoney_', label: 'Start money' });
  bindPreset(serverId, { values: [0, 1, 2, 3], endpoint: 'bot-difficulty', container: '#bot-difficulty-presets', idPrefix: 'bot_difficulty_', label: 'Bot difficulty' });
  bindPreset(serverId, { values: [1, 2, 5, 60], endpoint: 'set-roundtime', container: '#roundtime-presets', idPrefix: 'roundtime_', label: 'Round time' });
  bindPreset(serverId, { values: [10, 15, 30, 45, 90], endpoint: 'set-buytime', container: '#buytime-presets', idPrefix: 'buytime_', label: 'Buy time' });

  // Per-team bot controls
  const botCmds: Array<{ id: string; endpoint: string }> = [
    { id: 'bot_add_ct',  endpoint: '/api/bot-add-ct' },
    { id: 'bot_add_t',   endpoint: '/api/bot-add-t' },
    { id: 'bot_kick_ct', endpoint: '/api/bot-kick-ct' },
    { id: 'bot_kick_t',  endpoint: '/api/bot-kick-t' },
  ];
  botCmds.forEach(cmd => {
    on(`#${cmd.id}`, 'click', () => {
      void sendPostRequest(cmd.endpoint, { server_id: serverId })
        .then(d => {
          showToast(d.message, 'success');
        })
        .catch(toastError('Bot action failed.'));
    });
  });

  // Give Nade Kit
  const nadeMap = new Map([
    ['give_flash', 'weapon_flashbang'],
    ['give_smoke', 'weapon_smokegrenade'],
    ['give_he', 'weapon_hegrenade'],
    ['give_molotov', 'weapon_molotov'],
    ['give_decoy', 'weapon_decoy'],
    ['give_incen', 'weapon_incgrenade'],
  ]);
  nadeMap.forEach((weapon, id) => {
    on(`#${id}`, 'click', () => {
      void sendPostRequest('/api/give-weapon', { server_id: serverId, weapon })
        .then(d => {
          showToast(d.message, 'success');
        })
        .catch(toastError('Give weapon failed.'));
    });
  });

  // Movement / quick practice
  const practiceButtons: Array<{ id: string; endpoint: string }> = [
    { id: 'noclip_btn',       endpoint: '/api/noclip' },
    { id: 'rethrow_nade_btn', endpoint: '/api/rethrow-grenade' },
  ];
  practiceButtons.forEach(cmd => {
    on(`#${cmd.id}`, 'click', () => {
      void sendPostRequest(cmd.endpoint, { server_id: serverId })
        .then(d => {
          showToast(d.message, 'success');
        })
        .catch(toastError('Command failed.'));
    });
  });
}

export function initScrimControls(serverId: string): void {
  let currentOtMaxrounds = 6;
  bindPreset(serverId, { values: [16, 24, 30], endpoint: 'set-maxrounds', container: '#maxrounds-presets', idPrefix: 'maxrounds_', label: 'Max rounds' });

  [3, 5, 6].forEach(n => {
    on(`#ot_rounds_${n}`, 'click', () => {
      currentOtMaxrounds = n;
      setPresetActive('#ot-rounds-presets', `#ot_rounds_${n}`);
    });
  });

  on('#overtime_on', 'click', () => {
    void sendPostRequest('/api/set-overtime', { server_id: serverId, enable: 1, ot_rounds: currentOtMaxrounds })
      .then(d => { showToast(d.message, 'success'); setToggleActive('overtime', 1); })
      .catch(toastError('Overtime On failed.'));
  });
  on('#overtime_off', 'click', () => {
    void sendPostRequest('/api/set-overtime', { server_id: serverId, enable: 0, ot_rounds: currentOtMaxrounds })
      .then(d => { showToast(d.message, 'success'); setToggleActive('overtime', 0); })
      .catch(toastError('Overtime Off failed.'));
  });
}

export function initConfirmActions(serverId: string): void {
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
    on(`#${id}`, 'click', () => {
      void showConfirm(msg).then(confirmed => {
        if (!confirmed) return;
        void sendPostRequest(endpoint, { server_id: serverId })
          .then(d => {
            showToast(d.message, 'success');
          })
          .catch(toastError(fallback));
      });
    });
  });
}

export function initMatchzyCommands(serverId: string): void {
  const matchzyCommands: Array<{ selector: string; endpoint: string }> = [
    { selector: '#matchzy_practice', endpoint: '/api/matchzy-practice' },
    { selector: '#matchzy_exitprac', endpoint: '/api/matchzy-exitprac' },
    { selector: '#matchzy_playout',  endpoint: '/api/matchzy-playout' },
  ];
  matchzyCommands.forEach(cmd => {
    on(cmd.selector, 'click', () => {
      void sendPostRequest(cmd.endpoint, { server_id: serverId })
        .then(d => {
          showToast(d.message, 'success');
        })
        .catch(toastError('MatchZy command failed.'));
    });
  });

  on('#matchzy_coach_ct', 'click', () => {
    void sendPostRequest('/api/matchzy-coach', { server_id: serverId, side: 'ct' })
      .then(d => {
        showToast(d.message, 'success');
      })
      .catch(toastError('Coach CT failed.'));
  });
  on('#matchzy_coach_t', 'click', () => {
    void sendPostRequest('/api/matchzy-coach', { server_id: serverId, side: 't' })
      .then(d => {
        showToast(d.message, 'success');
      })
      .catch(toastError('Coach T failed.'));
  });

  on('#matchzy_load_match_file_btn', 'click', () => {
    const input = el<HTMLInputElement>('#matchzy_match_file_input');
    const filename = input?.value.trim() ?? '';
    if (!filename) {
      showToast('Enter a filename (e.g. match.json)', 'error');
      return;
    }
    void showConfirm(`Load match config from ${filename}?`).then(confirmed => {
      if (!confirmed) return;
      void sendPostRequest('/api/matchzy-load-match-file', { server_id: serverId, filename })
        .then(d => {
          showToast(d.message, 'success');
          if (input) input.value = '';
        })
        .catch(toastError('Load match file failed.'));
    });
  });
}
