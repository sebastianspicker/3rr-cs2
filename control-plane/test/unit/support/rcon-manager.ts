/** Minimal RCON transport seam for the DNS-pinning contract. Import before RconManager. */
import { EventEmitter } from 'node:events';
import { mockModule } from './mock-module';

export const rconScenario = {
  resolvedHost: '203.0.113.77',
  createdHosts: [] as string[],
  executeCalls: [] as string[],
  execute: undefined as ((command: string, connection: FakeRcon) => Promise<string>) | undefined,
  authenticate: undefined as (() => Promise<void>) | undefined,
};

class FakeSocket extends EventEmitter {
  writable = true;

  end(): void {
    this.writable = false;
    setImmediate(() => this.emit('close'));
  }

  destroy(): void {
    this.writable = false;
    setImmediate(() => this.emit('close'));
  }
}

export class FakeRcon {
  connection = new FakeSocket();
  constructor(options: { host: string }) {
    rconScenario.createdHosts.push(options.host);
  }

  async authenticate(): Promise<void> {
    return rconScenario.authenticate?.();
  }

  async execute(command: string): Promise<string> {
    rconScenario.executeCalls.push(command);
    if (rconScenario.execute) return rconScenario.execute(command, this);
    return `${command} ok`;
  }

  isConnected(): boolean {
    return true;
  }

  isAuthenticated(): boolean {
    return true;
  }
}

mockModule('rcon-srcds', { default: FakeRcon });
mockModule('../../../src/integrations/rcon/networkValidation.js', {
  resolveValidServerHost: async (host: string) => rconScenario.resolvedHost || host,
});

export function resetRconScenario(): void {
  Object.assign(rconScenario, {
    resolvedHost: '203.0.113.77',
    createdHosts: [],
    executeCalls: [],
    execute: undefined,
    authenticate: undefined,
  });
}
