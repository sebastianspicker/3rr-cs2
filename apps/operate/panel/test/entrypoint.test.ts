import { test } from 'node:test';
import {
  tmpDir,
  dbPath,
  cmd,
  cmdArgs,
  STARTUP_TIMEOUT_MS,
  EXIT_TIMEOUT_MS,
  stripAnsi,
  get,
  getAvailablePort,
  canBindPort,
  startEntrypoint,
  stopEntrypoint,
  postLogin,
  fs,
  path,
  assert,
  spawn,
} from './entrypoint-fixture';

test('entrypoint listens on explicit PORT and ignores DEFAULT_PORT', async () => {
  const requestedPort = await getAvailablePort();
  const { child, port, output } = await startEntrypoint({
    PORT: String(requestedPort),
    DEFAULT_PORT: '0',
    DB_PATH: path.join(tmpDir, `explicit-port-${Date.now()}.db`),
    DEFAULT_USERNAME: 'explicit_port_admin',
    DEFAULT_PASSWORD: ['explicit', 'port', '12345'].join('_'),
    ALLOW_DEFAULT_CREDENTIALS: 'true',
  });

  try {
    assert.equal(port, requestedPort, output());
    const health = await get('/api/health', port);
    assert.equal(health.status, 200);
  } finally {
    await stopEntrypoint(child);
  }
});

test('entrypoint defaults to port 3000 when PORT is unset', async (t) => {
  if (!(await canBindPort(3000))) {
    t.skip('port 3000 is already in use');
    return;
  }

  const { child, port, output } = await startEntrypoint({
    PORT: undefined,
    DEFAULT_PORT: '0',
    DB_PATH: path.join(tmpDir, `default-port-${Date.now()}.db`),
    DEFAULT_USERNAME: 'default_port_admin',
    DEFAULT_PASSWORD: ['default', 'port', '12345'].join('_'),
    ALLOW_DEFAULT_CREDENTIALS: 'true',
  });

  try {
    assert.equal(port, 3000, output());
    const health = await get('/api/health', port);
    assert.equal(health.status, 200);
  } finally {
    await stopEntrypoint(child);
  }
});

test('entrypoint ignores CONTENT_SECURITY_POLICY and serves nonce-based CSP', async () => {
  const { child, port, output } = await startEntrypoint({
    CONTENT_SECURITY_POLICY: "default-src 'none'",
    DB_PATH: path.join(tmpDir, `csp-env-${Date.now()}.db`),
    DEFAULT_USERNAME: 'csp_admin',
    DEFAULT_PASSWORD: ['csp', 'admin', '12345'].join('_'),
    ALLOW_DEFAULT_CREDENTIALS: 'true',
  });

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200, output());
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
    assert.doesNotMatch(csp, /default-src 'none'/);

    const nonce = csp.match(/script-src 'self' 'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, csp);
    const html = await res.text();
    assert.ok(html.includes(`nonce="${nonce}"`), 'page script nonce should match CSP header');
  } finally {
    await stopEntrypoint(child);
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
      DEFAULT_PASSWORD: ['test', 'pass', '12345'].join(''),
      ALLOW_DEFAULT_CREDENTIALS: 'true',
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

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for startup log.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, STARTUP_TIMEOUT_MS);

    const onOutput = () => {
      const clean = stripAnsi(stdout);
      // Match legacy or JSON startup logs.
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

test('default admin bootstrap stores usernames that login normalization can find', async () => {
  const password = ['default', 'admin', '12345'].join('_');
  const cases = [
    {
      label: 'normal username',
      envUsername: 'normal_admin',
      loginUsername: 'normal_admin',
    },
    {
      label: 'leading and trailing whitespace',
      envUsername: '  trimmed_admin  ',
      loginUsername: 'trimmed_admin',
    },
  ];

  for (const { label, envUsername, loginUsername } of cases) {
    const { child, port, output } = await startEntrypoint({
      DB_PATH: path.join(tmpDir, `default-user-${label.replaceAll(' ', '-')}-${Date.now()}.db`),
      DEFAULT_USERNAME: envUsername,
      DEFAULT_PASSWORD: password,
      ALLOW_DEFAULT_CREDENTIALS: 'true',
    });
    try {
      const login = await postLogin(port, loginUsername, password);
      assert.equal(login.status, 200, `${label}\noutput:\n${output()}`);
    } finally {
      await stopEntrypoint(child);
    }
  }
});

test('default admin bootstrap rejects whitespace-only username', async () => {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      DB_PATH: path.join(tmpDir, `blank-default-user-${Date.now()}.db`),
      DEFAULT_USERNAME: '   ',
      DEFAULT_PASSWORD: ['default', 'admin', '12345'].join('_'),
      ALLOW_DEFAULT_CREDENTIALS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
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
  assert.match(output, /DEFAULT_USERNAME must not be empty/);
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
  child.stderr?.on('data', (chunk: Buffer) => {
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
  assert.match(stderr, /REDIS_URL is required in production/);
});

test('`tsx app.ts` rejects Redis host and port aliases in production', async () => {
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: path.join(tmpDir, `redis-alias-${Date.now()}.db`),
      SESSION_SECRET: 'prod-session-secret-strong-value',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
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
  assert.match(output, /REDIS_URL is required in production/);
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
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
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
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
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
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
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
  const invalidDbParent = path.join(tmpDir, 'not-a-directory');
  fs.writeFileSync(invalidDbParent, 'not a directory');
  const child = spawn(cmd, cmdArgs, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: path.join(invalidDbParent, 'cspanel.db'),
      SESSION_SECRET: 'prod-session-secret-strong-value',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://127.0.0.1:6380',
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
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
