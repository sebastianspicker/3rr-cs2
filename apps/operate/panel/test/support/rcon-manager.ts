/** Minimal RCON transport seam for the DNS-pinning contract. Import before RconManager. */
import { EventEmitter } from 'node:events';
import { mockModule } from './mock-module';

export const rconScenario = {
  resolvedHost: '203.0.113.77',
  createdHosts: [] as string[],
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
    return undefined;
  }

  async execute(command: string): Promise<string> {
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
mockModule('../../db.js', {
  better_sqlite_client: {
    prepare: () => ({ all: () => [], get: () => undefined }),
  },
});
mockModule('../../utils/networkValidation.js', {
  resolveValidServerHost: async (host: string) => rconScenario.resolvedHost || host,
});

export function resetRconScenario(): void {
  Object.assign(rconScenario, {
    resolvedHost: '203.0.113.77',
    createdHosts: [],
  });
}
