import { assert } from './server-crud-fixture';
import type { ServerListItem } from './server-crud-fixture';

export function findListedServer(
  servers: ServerListItem[],
  serverId: number,
  message: string
): ServerListItem {
  const listed = servers.find((item) => item.id === serverId);
  assert.ok(listed, message);
  return listed;
}

export function assertUnobservedServerStatus(server: ServerListItem): void {
  assert.equal(server.hostname, '-');
  assert.equal(server.status, 'unknown');
  assert.equal(server.status_source, 'not_observed');
  assert.equal(server.observed_at, null);
  assert.equal(server.timed_out, false);
  assert.equal(server.error, null);
  assert.equal(server.connected, false);
  assert.equal(server.authenticated, false);
}

export function assertConnectedHostnameStatus(server: ServerListItem): void {
  assert.equal(server.hostname, 'Observed Server');
  assert.equal(server.status, 'connected');
  assert.equal(server.status_source, 'rcon_hostname');
  assert.match(server.observed_at ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(server.timed_out, false);
  assert.equal(server.error, null);
  assert.equal(server.connected, true);
  assert.equal(server.authenticated, true);
}

export function assertTimedOutHostnameStatus(server: ServerListItem): void {
  assert.equal(server.status, 'unknown');
  assert.notEqual(server.status, 'disconnected');
  assert.equal(server.status_source, 'rcon_hostname');
  assert.equal(server.observed_at, null);
  assert.equal(server.timed_out, true);
  assert.equal(server.error, 'hostname probe timed out');
}

export function assertFailedHostnameStatus(server: ServerListItem): void {
  assert.equal(server.status, 'error');
  assert.notEqual(server.status, 'disconnected');
  assert.equal(server.status_source, 'rcon_hostname');
  assert.equal(server.observed_at, null);
  assert.equal(server.timed_out, false);
  assert.equal(server.error, 'hostname unavailable');
  assert.equal(server.connected, true);
  assert.equal(server.authenticated, true);
}
