export interface LiveStatusResponse {
  hostname: string | null;
  map: string | null;
  humans: number | null;
  bots: number | null;
  max_players: number | null;
  connected: boolean;
  authenticated: boolean;
  partial: boolean;
  complete: boolean;
  observed_at: string | null;
  error: string | null;
}

export interface PlayerRow {
  userid: string;
  name: string;
  steam_account_id: string | null;
  steam_id64: string | null;
}

export interface PlayersResponse {
  players: PlayerRow[];
  humans: number | null;
  bots: number | null;
  max_players: number | null;
  observed_at: string | null;
  error: string | null;
}

export interface AutocompleteResponse {
  suggestions: string[];
  observed_at: string | null;
  error: string | null;
}

export interface WorkshopFavorite {
  id: number;
  workshop_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkshopFavoritesResponse {
  favorites: WorkshopFavorite[];
}

export interface WorkshopFavoriteResponse {
  favorite: WorkshopFavorite;
}

export interface RconHistoryRow {
  id: number;
  command: string;
  use_count: number;
  last_used_at: string;
}

export interface RconHistoryResponse {
  commands: RconHistoryRow[];
  history_state?: 'available';
}

export function el<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function on(selector: string, event: string, handler: EventListener): void {
  el(selector)?.addEventListener(event, handler);
}

export function setText(id: string, value: string): void {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

export function setMessage(id: string, message: string | null): void {
  const node = el<HTMLElement>(`#${id}`);
  if (!node) return;
  node.hidden = !message;
  node.textContent = message ?? '';
}

export function formatObserved(value: string | null): string {
  if (!value) return '--';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '--';
  return time.toLocaleTimeString();
}
