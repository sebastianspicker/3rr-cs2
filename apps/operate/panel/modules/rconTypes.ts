import type Rcon from 'rcon-srcds';

export interface ServerRecord {
  id: number;
  serverIP: string;
  serverPort: number;
  rconPassword: string;
}

export interface ServerInfo {
  id: number;
  serverIP: string;
  serverPort: number;
}

export interface ServerDetails {
  host: string;
  port: number;
  connected: boolean;
  authenticated: boolean;
  heartbeatInterval?: ReturnType<typeof setInterval>;
  heartbeatFailures: number;
}

export interface RconManagerOptions {
  authTimeoutMs?: number;
}

export interface RconInitError {
  server_id?: string;
  serverIP?: string;
  message: string;
}

export interface RconInitSummary {
  complete: boolean;
  total: number;
  connected: number;
  failed: number;
  skipped: number;
  errors: RconInitError[];
}

export interface RconDisconnectResult {
  server_id: string;
  state: 'absent' | 'closed' | 'error' | 'no_connection_interface' | 'timeout';
  closed: boolean;
  error?: string;
}

export interface RconShutdownSummary {
  total: number;
  closed: number;
  failed: number;
  results: RconDisconnectResult[];
}

export interface RconConnectionState {
  connection?: Rcon;
}

export function emptyInitSummary(): RconInitSummary {
  return { complete: false, total: 0, connected: 0, failed: 0, skipped: 0, errors: [] };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
