import fs from 'node:fs';
import path from 'node:path';
import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { getLoginPageCsrfAndCookie, loopbackFetch } from './http-helpers';
export { fs, path, assert };
export type { ChildProcess };

export let tmpDir: string;
export let dbPath: string;

// Use compiled JS in CI (faster, no tsx overhead), fall back to tsx for local dev.
export const distEntry = path.resolve('dist/app.js');
export const useCompiled = path.extname(__filename) === '.js';
export const cmd = useCompiled ? process.execPath : 'npx';
export const cmdArgs = useCompiled ? [distEntry] : ['tsx', 'app.ts'];
// npx tsx can be slow on CI runners; give it more headroom.
export const STARTUP_TIMEOUT_MS = useCompiled ? 10_000 : 30_000;
export const EXIT_TIMEOUT_MS = useCompiled ? 10_000 : 15_000;
export const ANSI_PREFIX = `${String.fromCharCode(27)}[`;

export function stripAnsi(value: string): string {
  return value
    .split(ANSI_PREFIX)
    .map((segment, index) => (index === 0 ? segment : segment.slice(segment.indexOf('m') + 1)))
    .join('');
}

export function get(pathname: string, port: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
  });
}

export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

export function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(250);
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      const server = http.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
  });
}

export async function startEntrypoint(
  envOverrides: NodeJS.ProcessEnv
): Promise<{ child: ChildProcess; port: number; output: () => string }> {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const output = (): string => `${stdout}${stderr}`;
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for startup log.\noutput:\n${output()}`));
    }, STARTUP_TIMEOUT_MS);

    const onOutput = () => {
      const clean = stripAnsi(stdout);
      const m =
        clean.match(/Server is running on (\d+)\./) ||
        (clean.includes('Server is running') ? clean.match(/port[^\d]*(\d+)/) : null);
      if (m) {
        clearTimeout(timeout);
        resolve(Number(m[1]));
      }
    };

    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);
  });

  return { child, port, output };
}

export async function stopEntrypoint(child: ChildProcess): Promise<number | null> {
  child.kill('SIGINT');
  return new Promise<number | null>((resolve) => {
    const forceKill = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(null);
    }, EXIT_TIMEOUT_MS);
    child.once('exit', (code) => {
      clearTimeout(forceKill);
      resolve(code);
    });
  });
}

/** Starts an entrypoint process and guarantees the existing SIGINT teardown order. */
export async function withEntrypoint<T>(
  envOverrides: NodeJS.ProcessEnv,
  run: (entrypoint: { port: number; output: () => string }) => Promise<T>
): Promise<T> {
  const { child, port, output } = await startEntrypoint(envOverrides);
  try {
    return await run({ port, output });
  } finally {
    await stopEntrypoint(child);
  }
}

/** Shared production preconditions for fail-fast entrypoint scenarios. */
export function productionEntrypointEnv(
  dbPath: string,
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DB_PATH: dbPath,
    SESSION_SECRET: 'prod-session-secret-strong-value',
    RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
    ALLOW_DEFAULT_CREDENTIALS: 'false',
    ...overrides,
  };
}

/** Runs a deliberately invalid production configuration until its fail-fast exit. */
export async function runEntrypointToExit(
  envOverrides: NodeJS.ProcessEnv
): Promise<{ code: number | null; output: string }> {
  const child = spawn(cmd, cmdArgs, {
    env: { ...process.env, PORT: '0', ...envOverrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const collectOutput = (chunk: Buffer) => {
    output += chunk.toString();
  };
  child.stdout?.on('data', collectOutput);
  child.stderr?.on('data', collectOutput);

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for process exit.\noutput:\n${output}`));
    }, EXIT_TIMEOUT_MS);
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });
  return { code, output };
}

/** Asserts the common fail-fast process contract while scenarios supply the reason. */
export async function expectEntrypointFailure(
  envOverrides: NodeJS.ProcessEnv,
  expectedOutput: RegExp
): Promise<void> {
  const { code, output } = await runEntrypointToExit(envOverrides);
  assert.notEqual(code, 0);
  assert.match(output, expectedOutput);
}

export async function postLogin(
  port: number,
  username: string,
  password: string
): Promise<{ status: number; body: unknown }> {
  const { cookie, csrfToken } = await getLoginPageCsrfAndCookie(port);
  const res = await loopbackFetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, body: await res.json() };
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-entry-3rr-'));
  dbPath = path.join(tmpDir, '3rr.db');
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
