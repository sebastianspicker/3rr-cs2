/** Presentation-only interactions for the Ops Deck shell. */
import { fetchJson } from './common';
import type { ServerListItem } from './serverTypes';

type PaletteAction = {
  label: string;
  meta: string;
  run: () => void;
};

function activateManageTab(tab: HTMLButtonElement, focus = false): void {
  const tabList = document.getElementById('manage-tabs');
  if (!tabList) return;
  tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((candidate) => {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panelId = candidate.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) panel.hidden = !selected;
  });
  document.dispatchEvent(new CustomEvent('manage:tab', { detail: tab.dataset.manageTab }));
  if (focus) tab.focus();
}

function initManageTabs(): void {
  const tabList = document.getElementById('manage-tabs');
  if (!tabList) return;
  const tabs = Array.from(tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateManageTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (nextTab) activateManageTab(nextTab, true);
    });
  });
  const selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') ?? tabs[0];
  if (selected) activateManageTab(selected);
}

function selectTab(name: string): void {
  const tab = document.querySelector<HTMLButtonElement>(`[data-manage-tab="${name}"]`);
  if (!tab) return;
  activateManageTab(tab, true);
}

function focusRconInput(): void {
  selectTab('console');
  window.requestAnimationFrame(() => document.getElementById('rconInput')?.focus());
}

function paletteActions(isManagePage: boolean): PaletteAction[] {
  const actions: PaletteAction[] = [
    { label: 'Open fleet', meta: 'Navigation', run: () => window.location.assign('/servers') },
    { label: 'Add server', meta: 'Navigation', run: () => window.location.assign('/add-server') },
    { label: 'Open settings', meta: 'Navigation', run: () => window.location.assign('/settings') },
  ];
  if (isManagePage) {
    actions.push(
      { label: 'Open console', meta: 'Server tab', run: focusRconInput },
      { label: 'Open match controls', meta: 'Server tab', run: () => selectTab('match') },
      { label: 'Open players', meta: 'Server tab', run: () => selectTab('players') },
      { label: 'Open setup', meta: 'Server tab', run: () => selectTab('setup') }
    );
  }
  return actions;
}

function createPalette(isManagePage: boolean): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.id = 'command-palette';
  dialog.className = 'command-palette';
  dialog.setAttribute('aria-labelledby', 'command-palette-title');

  const title = document.createElement('h2');
  title.id = 'command-palette-title';
  title.className = 'visually-hidden';
  title.textContent = 'Command palette';

  const input = document.createElement('input');
  input.id = 'command-palette-input';
  input.className = 'command-palette-input';
  input.type = 'search';
  input.placeholder = 'Type a command or search…';
  input.setAttribute('aria-label', 'Search commands');
  input.setAttribute('autocomplete', 'off');

  const list = document.createElement('div');
  list.className = 'command-palette-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Commands');

  const footer = document.createElement('div');
  footer.className = 'command-palette-footer';
  footer.textContent = '↑↓ select  ·  Enter open  ·  Esc close';
  dialog.append(title, input, list, footer);

  const actions = paletteActions(isManagePage);
  let visibleActions = actions;
  let selectedIndex = 0;

  const render = (): void => {
    list.replaceChildren();
    visibleActions.forEach((action, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-palette-item';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selectedIndex));
      const label = document.createElement('span');
      label.textContent = action.label;
      const meta = document.createElement('span');
      meta.className = 'command-palette-meta';
      meta.textContent = action.meta;
      button.append(label, meta);
      button.addEventListener('click', () => {
        dialog.close();
        action.run();
      });
      list.appendChild(button);
    });
    if (!visibleActions.length) {
      const empty = document.createElement('p');
      empty.className = 'command-palette-empty';
      empty.textContent = 'No matching commands';
      list.appendChild(empty);
    }
  };

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    visibleActions = actions.filter((action) => action.label.toLowerCase().includes(query));
    selectedIndex = 0;
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (!visibleActions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      selectedIndex = (selectedIndex + delta + visibleActions.length) % visibleActions.length;
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = visibleActions[selectedIndex];
      if (selected) {
        dialog.close();
        selected.run();
      }
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    input.value = '';
    visibleActions = actions;
    selectedIndex = 0;
    render();
  });
  render();
  return dialog;
}

function initCommandPalette(isManagePage: boolean): void {
  const palette = createPalette(isManagePage);
  document.body.appendChild(palette);
  const openPalette = (): void => {
    if (!palette.open) palette.showModal();
    document.getElementById('command-palette-input')?.focus();
  };
  document.getElementById('command-palette-trigger')?.addEventListener('click', openPalette);
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (palette.open) palette.close();
      else openPalette();
    }
  });
}

function createRailServer(
  server: ServerListItem,
  activeId: string,
  activeServerName: string
): HTMLLIElement {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = `/manage/${encodeURIComponent(String(server.id))}`;
  link.className = 'nav-server rail-server';
  if (String(server.id) === activeId) {
    link.classList.add('is-active');
    link.setAttribute('aria-current', 'location');
  }
  const copy = document.createElement('span');
  copy.className = 'nav-server-copy';
  const name = document.createElement('strong');
  const hostname = String(server.hostname).trim();
  name.textContent =
    String(server.id) === activeId && activeServerName
      ? activeServerName
      : hostname && hostname !== '-' && hostname !== '–'
        ? hostname
        : `Server ${String(server.id)}`;
  const endpoint = document.createElement('span');
  endpoint.className = 'rail-server-endpoint';
  endpoint.textContent = `${String(server.serverIP)}:${String(server.serverPort)}`;
  copy.append(name, endpoint);
  link.appendChild(copy);
  item.appendChild(link);
  return item;
}

function activeServerId(): string {
  return document.getElementById('main')?.dataset.serverId ?? '';
}

function createRailMessage(message: string): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'rail-server-message';
  item.textContent = message;
  return item;
}

export function renderRailLoading(): void {
  const list = document.getElementById('nav-server-list');
  if (!list) return;
  list.replaceChildren(createRailMessage('Loading authorized servers…'));
  list.setAttribute('aria-busy', 'true');
}

export function renderRailLoadError(retry: () => void): void {
  const list = document.getElementById('nav-server-list');
  if (!list) return;
  const item = createRailMessage('Authorized servers unavailable. ');
  item.classList.add('rail-server-error');
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'btn btn-ghost btn-sm';
  retryButton.textContent = 'Retry';
  retryButton.addEventListener('click', retry);
  item.appendChild(retryButton);
  list.replaceChildren(item);
  list.setAttribute('aria-busy', 'false');
}

export function renderRailServers(servers: ServerListItem[]): void {
  const list = document.getElementById('nav-server-list');
  if (!list) return;
  const activeId = activeServerId();
  const activeServerName = document.getElementById('manage-title')?.textContent?.trim() ?? '';
  list.replaceChildren(
    ...servers.map((server) => createRailServer(server, activeId, activeServerName))
  );
  list.setAttribute('aria-busy', 'false');
  if (!servers.length) list.appendChild(createRailMessage('No authorized servers'));
}

async function loadRailServers(): Promise<void> {
  if (!document.getElementById('nav-server-list')) return;
  renderRailLoading();
  try {
    const { servers } = await fetchJson<{ servers: ServerListItem[] }>('/api/servers?observe=0');
    renderRailServers(servers);
  } catch {
    renderRailLoadError(() => {
      void loadRailServers();
    });
  }
}

function markCurrentNavigation(currentPath: string): void {
  document
    .querySelectorAll<HTMLAnchorElement>('#nav-links-list a, #nav-server-list a')
    .forEach((link) => {
      const active = link.pathname === currentPath;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
}

export function initOpsDeck(currentPath: string): void {
  const isManagePage = currentPath.startsWith('/manage/');
  markCurrentNavigation(currentPath);
  initManageTabs();
  initCommandPalette(isManagePage);
  if (currentPath !== '/servers') void loadRailServers();
}
