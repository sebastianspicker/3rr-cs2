/** Minimal, in-memory RconManager stand-in for HTTP route contract tests. No real sockets. */
import type { RconManager } from '../../../src/integrations/rcon';

interface ConnectionInfo {
  host: string;
  port: number;
  connected: boolean;
  authenticated: boolean;
}

export interface FakeRconManager extends RconManager {
  connections: Map<string, ConnectionInfo>;
  removedServerIds: string[];
  connectServerResult: boolean;
  probeServerShouldFail: boolean;
  observeCommandImpl: (
    serverId: string,
    command: string
  ) => Promise<{ value: string; observedAt: string }>;
}

export function createFakeRconManager(overrides: Partial<FakeRconManager> = {}): FakeRconManager {
  const connections = overrides.connections ?? new Map<string, ConnectionInfo>();
  const removedServerIds: string[] = [];

  const manager: FakeRconManager = {
    totalDeadlineMs: 12_000,
    connections,
    removedServerIds,
    connectServerResult: overrides.connectServerResult ?? true,
    probeServerShouldFail: overrides.probeServerShouldFail ?? false,
    observeCommandImpl:
      overrides.observeCommandImpl ??
      (async (_serverId: string, command: string) => ({
        value: `${command} ok`,
        observedAt: new Date().toISOString(),
      })),
    getInitSummary: () => ({
      complete: true,
      total: 0,
      connected: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }),
    async probeServer() {
      if (manager.probeServerShouldFail) throw new Error('RCON authentication failed');
    },
    async connectServer(server: { id: number; serverIP: string; serverPort: number }) {
      const id = String(server.id);
      if (manager.connectServerResult) {
        connections.set(id, {
          host: server.serverIP,
          port: server.serverPort,
          connected: true,
          authenticated: true,
        });
      }
      return manager.connectServerResult;
    },
    async removeServer(serverId: string) {
      removedServerIds.push(serverId);
      connections.delete(serverId);
      return { disconnected: true } as never;
    },
    getConnectionInfo(serverId: string) {
      return connections.get(serverId) ?? null;
    },
    observeCommand(serverId: string, command: string) {
      return manager.observeCommandImpl(serverId, String(command));
    },
  } as unknown as FakeRconManager;

  return Object.assign(manager, overrides);
}
