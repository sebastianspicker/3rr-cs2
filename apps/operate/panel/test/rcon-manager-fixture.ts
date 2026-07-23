/** Shared fake RCON transport and module mocks. Import before loading RconManager. */
import { EventEmitter } from 'node:events';
import { mockModule } from './mock-module';

export type Settlement<T> =
  | { settled: true; status: 'fulfilled'; value: T }
  | { settled: true; status: 'rejected'; reason: unknown }
  | { settled: false };

export async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<Settlement<T>> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(
        (value): Settlement<T> => ({ settled: true, status: 'fulfilled', value }),
        (reason: unknown): Settlement<T> => ({ settled: true, status: 'rejected', reason })
      ),
      new Promise<Settlement<T>>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ settled: false }), ms);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export const rconFixture = {
  allowResolvedHost: true,
  resolvedHost: undefined as string | null | undefined,
  createdHosts: [] as string[],
  concurrentExec: 0,
  maxConcurrentExec: 0,
  authenticateShouldFail: false,
  authenticateShouldHang: false,
  authenticateGate: null as Promise<void> | null,
  releaseAuthentication: null as (() => void) | null,
  socketClosesOnEnd: true,
  socketClosesOnDestroy: true,
  commandsThatFail: new Set<string>(),
  commandsThatHang: new Set<string>(),
  authFailuresByHost: new Set<string>(),
  dbServers: [] as Array<{ id: number; serverIP: string; serverPort: number }>,
  createdConnections: [] as FakeRcon[],
};

class FakeSocket extends EventEmitter {
  writable = true;

  end(): void {
    this.writable = false;
    if (rconFixture.socketClosesOnEnd) setImmediate(() => this.emit('close'));
  }

  destroy(): void {
    this.writable = false;
    if (rconFixture.socketClosesOnDestroy) setImmediate(() => this.emit('close'));
  }
}

export class FakeRcon {
  connection = new FakeSocket();
  private connected = true;
  private authenticated = false;
  private host: string;

  constructor(options: { host: string }) {
    this.host = options.host;
    rconFixture.createdHosts.push(options.host);
    rconFixture.createdConnections.push(this);
  }

  async authenticate(): Promise<void> {
    if (rconFixture.authenticateShouldFail || rconFixture.authFailuresByHost.has(this.host)) {
      throw new Error('auth failed');
    }
    if (rconFixture.authenticateShouldHang) return new Promise(() => undefined);
    if (rconFixture.authenticateGate) await rconFixture.authenticateGate;
    this.authenticated = true;
  }

  async execute(command: string): Promise<string> {
    if (rconFixture.commandsThatFail.has(command)) throw new Error(`command failed: ${command}`);
    if (rconFixture.commandsThatHang.has(command)) return new Promise(() => undefined);
    rconFixture.concurrentExec += 1;
    rconFixture.maxConcurrentExec = Math.max(
      rconFixture.maxConcurrentExec,
      rconFixture.concurrentExec
    );
    await new Promise((resolve) => setTimeout(resolve, command === 'status' ? 25 : 10));
    rconFixture.concurrentExec -= 1;
    return `${command} ok`;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }
}

mockModule('rcon-srcds', { default: FakeRcon });
mockModule('../db.js', {
  better_sqlite_client: {
    prepare: () => ({ all: () => rconFixture.dbServers, get: () => undefined }),
  },
});
mockModule('../utils/networkValidation.js', {
  resolveValidServerHost: async (host: string) =>
    rconFixture.allowResolvedHost ? (rconFixture.resolvedHost ?? host) : null,
});

export function resetRconFixture(): void {
  Object.assign(rconFixture, {
    allowResolvedHost: true,
    resolvedHost: undefined,
    createdHosts: [],
    concurrentExec: 0,
    maxConcurrentExec: 0,
    authenticateShouldFail: false,
    authenticateShouldHang: false,
    authenticateGate: null,
    releaseAuthentication: null,
    socketClosesOnEnd: true,
    socketClosesOnDestroy: true,
    commandsThatFail: new Set<string>(),
    commandsThatHang: new Set<string>(),
    authFailuresByHost: new Set<string>(),
    dbServers: [],
    createdConnections: [],
  });
}

export function deferAuthentication(): void {
  rconFixture.authenticateGate = new Promise<void>((resolve) => {
    rconFixture.releaseAuthentication = resolve;
  });
}
