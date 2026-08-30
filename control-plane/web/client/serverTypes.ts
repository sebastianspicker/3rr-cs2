/** Browser data contracts for the server inventory feature. */
export interface ServerListItem {
  id: string | number;
  hostname: string;
  serverIP: string;
  serverPort: string | number;
  connected: boolean;
  authenticated: boolean;
  status?: 'connected' | 'disconnected' | 'unknown' | 'error';
  observed_at?: string | null;
  status_source?: 'not_observed' | 'rcon_connection' | 'rcon_hostname';
  timed_out?: boolean;
  error?: string | null;
}
