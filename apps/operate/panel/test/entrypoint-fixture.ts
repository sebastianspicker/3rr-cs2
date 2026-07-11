import fs from 'node:fs';
import path from 'node:path';
import { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { getLoginPageCsrfAndCookie, loopbackFetch } from './http-helpers';
export { fs, path, assert, spawn, http };
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
    const server = http.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
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

export async function stopEntrypoint(child: ChildProcess): Promise<void> {
  child.kill('SIGINT');
  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, EXIT_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
  });
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
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-entry-cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
