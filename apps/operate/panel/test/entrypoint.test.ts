import fs from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

let tmpDir: string;
let dbPath: string;

// Use compiled JS in CI (faster, no tsx overhead), fall back to tsx for local dev.
const distEntry = path.resolve('dist/app.js');
const useCompiled = fs.existsSync(distEntry);
const cmd = useCompiled ? process.execPath : 'npx';
const cmdArgs = useCompiled ? [distEntry] : ['tsx', 'app.ts'];
// npx tsx can be slow on CI runners; give it more headroom.
const STARTUP_TIMEOUT_MS = useCompiled ? 10_000 : 30_000;
const EXIT_TIMEOUT_MS = useCompiled ? 10_000 : 15_000;
const ANSI_RE = /\u001b\[[0-9;]*m/g;

function get(pathname: string, port: number): Promise<{ status: number; body: string }> {
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

test('`tsx app.ts` starts and logs listening port', async () => {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      DB_PATH: dbPath,
      DEFAULT_USERNAME: 'testuser',
      DEFAULT_PASSWORD: 'testpass12345',
      ALLOW_DEFAULT_CREDENTIALS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout!.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for startup log.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, STARTUP_TIMEOUT_MS);

    const onOutput = () => {
      const clean = stdout.replace(ANSI_RE, '');
      // Match legacy format: "Server is running on PORT."
      // or pino-pretty format (may include ANSI codes): "Server is running\n    port: PORT"
      const m =
        clean.match(/Server is running on (\d+)\./) ||
        (clean.includes('Server is running') ? clean.match(/port[^\d]*(\d+)/) : null);
      if (m) {
        clearTimeout(timeout);
        resolve(Number(m[1]));
      }
    };

    child.stdout!.on('data', onOutput);
    child.stderr!.on('data', onOutput);
  });

  assert.ok(Number.isInteger(port) && port > 0);
  const css = await get('/css/panel.css', port);
  const js = await get('/js/console.js', port);
  assert.equal(css.status, 200);
  assert.match(css.body, /\.auth-page|\.panel/);
  assert.equal(js.status, 200);
  assert.match(js.body, /DOMContentLoaded/);

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
});

test('`tsx app.ts` fails fast in production without Redis config', async () => {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: dbPath,
      SESSION_SECRET: 'prod-session-secret-strong-value',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for process exit.\nstderr:\n${stderr}`));
    }, EXIT_TIMEOUT_MS);
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  assert.notEqual(code, 0);
  assert.match(stderr, /REDIS_URL .* required in production/);
});

test('`tsx app.ts` fails fast in production with weak default password', async () => {
  const weakDbPath = path.join(tmpDir, `weak-default-${Date.now()}.db`);
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: weakDbPath,
      SESSION_SECRET: 'prod-session-secret-strong-value',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://127.0.0.1:6380',
      ALLOW_DEFAULT_CREDENTIALS: 'true',
      DEFAULT_USERNAME: 'admin',
      DEFAULT_PASSWORD: 'change-me',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

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

  assert.notEqual(code, 0);
  assert.match(output, /DEFAULT_PASSWORD uses a weak placeholder value in production/);
});

test('`tsx app.ts` fails fast in production with weak SESSION_SECRET', async () => {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: path.join(tmpDir, `weak-session-${Date.now()}.db`),
      SESSION_SECRET: 'change-me',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://127.0.0.1:6380',
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

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

  assert.notEqual(code, 0);
  assert.match(
    output,
    /SESSION_SECRET must be a strong secret in production \(32\+ chars, not a placeholder, and not trivially guessable\)/
  );
});

test('`tsx app.ts` fails fast in production with short SESSION_SECRET', async () => {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: path.join(tmpDir, `short-session-${Date.now()}.db`),
      SESSION_SECRET: 'abc12345',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://127.0.0.1:6380',
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

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

  assert.notEqual(code, 0);
  assert.match(
    output,
    /SESSION_SECRET must be a strong secret in production \(32\+ chars, not a placeholder, and not trivially guessable\)/
  );
});

test('`tsx app.ts` fails fast in production when explicit DB_PATH is invalid', async () => {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: '/dev/null/cspanel.db',
      SESSION_SECRET: 'prod-session-secret-strong-value',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://127.0.0.1:6380',
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

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

  assert.notEqual(code, 0);
  assert.match(output, /Failed to open DB/);
});
