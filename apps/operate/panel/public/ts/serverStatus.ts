import type { ServerListItem } from './serverCards';

export type ServerStatus = 'connected' | 'disconnected' | 'unknown' | 'error';

export function serverStatus(server: ServerListItem): ServerStatus {
  return server.status ?? (server.connected && server.authenticated ? 'connected' : 'disconnected');
}

export function serverStatusLabel(server: ServerListItem): string {
  if (server.timed_out) return 'Status timed out';
  const labels: Record<ServerStatus, string> = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Status unavailable',
    unknown: 'Status unknown',
  };
  return labels[serverStatus(server)];
}

export function serverStatusClass(server: ServerListItem): 'connected' | 'disconnected' | 'unknown' {
  const status = serverStatus(server);
  return status === 'error' ? 'unknown' : status;
}

export function isServerOnline(server: ServerListItem): boolean {
  return serverStatus(server) === 'connected';
}
