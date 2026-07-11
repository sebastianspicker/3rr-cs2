import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const projectRoot = path.resolve(__dirname, '..', '..');

async function rmRecursiveWithRetry(target: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
}

function createValidationFixture(): { workspace: string } {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-panel-validate-fixture-'));
  const scriptsDir = path.join(workspace, 'scripts');
  const libDir = path.join(scriptsDir, 'lib');
  const fakeBinDir = path.join(workspace, 'fake-bin');
  const cfgDir = path.join(workspace, 'cfg');

  fs.mkdirSync(cfgDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  for (const relativePath of [
    'scripts/validate.sh',
    'scripts/lib/common.sh',
    '.env.example',
    'docker-compose.yaml',
    'package.json',
    'package-lock.json',
    'cfg/maps.json',
  ]) {
    fs.copyFileSync(path.join(projectRoot, relativePath), path.join(workspace, relativePath));
  }

  for (const stub of ['shellcheck', 'shfmt', 'jq', 'ruby']) {
    fs.writeFileSync(path.join(fakeBinDir, stub), '#!/usr/bin/env bash\nexit 0\n', {
      mode: 0o755,
    });
  }
  fs.writeFileSync(
    path.join(fakeBinDir, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "info" || "$1" == "build" ]]; then exit 0; fi
if [[ "$1" == "compose" && "$2" == "version" ]]; then exit 0; fi
if [[ "$1" == "compose" ]]; then exit 42; fi
echo "unexpected docker invocation: $*" >&2
exit 99
`,
    { mode: 0o755 }
  );
  return { workspace };
}

async function runValidation(workspace: string) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(
      'bash',
      ['-lc', 'PATH="$PWD/fake-bin:$PATH" scripts/validate.sh --require-docker'],
      {
        cwd: workspace,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
}

test('`scripts/validate.sh --require-docker` cleans up temporary .env on compose failure', async () => {
  const { workspace } = createValidationFixture();
  try {
    const result = await runValidation(workspace);

    assert.notEqual(result.code, 0);
    assert.match(result.output, /docker compose -f .* config -q/);
    assert.equal(fs.existsSync(path.join(workspace, '.env')), false);
  } finally {
    await rmRecursiveWithRetry(workspace);
  }
});

async function gitCheckIgnoreExitCode(filePath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['check-ignore', '--quiet', filePath], {
      cwd: projectRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0 && code !== 1) {
        reject(new Error(`git check-ignore failed for ${filePath}: ${stderr}`));
        return;
      }
      resolve(code);
    });
  });
}

test('docs reflect the live auth contract and umbrella module scope', () => {
  const apiDoc = fs.readFileSync(path.resolve('docs/API.md'), 'utf8');
  const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
  const repoMap = fs.readFileSync(path.resolve('docs/REPO_MAP.md'), 'utf8');

  assert.match(
    apiDoc,
    /State-changing requests \(POST\/PUT\/DELETE\) require a CSRF token in the `X-CSRF-Token` header\./
  );
  assert.match(apiDoc, /\| POST\s+\| `\/auth\/login`\s+\| No\s+\| Yes\s+\| 20\/15min\s+\|/);
  assert.match(
    apiDoc,
    /\*\*Auth routes:\*\*\s*use the same `\{ "message": "\.\.\." \}` success shape/
  );
  assert.doesNotMatch(apiDoc, /\{ "status": N, "message": "\.\.\." \}/);

  assert.match(readme, /This module is the `operate` surface of `cs2-server-ops`/);
  assert.match(readme, /Use the root repo’s `apps\/maintain\/updater` for unattended updates/);
  assert.match(readme, /\| `RCON_SECRET_KEY`\s+\|\s+yes in production\s+\|/);

  assert.match(repoMap, /scripts\/validate\.sh/);
});

test('login and add-server templates submit through form handlers', () => {
  const loginTemplate = fs.readFileSync(path.resolve('views/login.ejs'), 'utf8');
  const addServerTemplate = fs.readFileSync(path.resolve('views/add-server.ejs'), 'utf8');

  assert.match(loginTemplate, /<form id="login-form">/);
  assert.match(loginTemplate, /form\.addEventListener\('submit'/);
  assert.doesNotMatch(loginTemplate, /minlength="12"/);
  assert.doesNotMatch(loginTemplate, /getElementById\('login_btn'\)\.addEventListener\('click'/);

  assert.match(addServerTemplate, /<form id="add-server-form">/);
  assert.match(addServerTemplate, /id="submitButton" type="submit"/);
  assert.match(addServerTemplate, /form\.addEventListener\('submit'/);
  assert.doesNotMatch(
    addServerTemplate,
    /getElementById\('submitButton'\)\.addEventListener\('click'/
  );
});

test('manage template keeps risky controls behind native advanced sections', () => {
  const manageTemplate = fs.readFileSync(path.resolve('views/manage.ejs'), 'utf8');

  assert.doesNotMatch(manageTemplate, /mode-toggle|cs2panel-mode|data-mode/);
  assert.match(manageTemplate, /<details class="panel advanced-panel">/);
  assert.match(manageTemplate, /<summary class="panel-header">\s*<h2>RCON Console<\/h2>/);
  assert.match(manageTemplate, /<summary class="panel-header">\s*<h2>Quick Commands<\/h2>/);
  assert.match(manageTemplate, /<summary class="panel-header">\s*<h2>Practice Controls<\/h2>/);
});

test('admin user template renders user rows without innerHTML', () => {
  const adminUsersTemplate = fs.readFileSync(path.resolve('views/admin-users.ejs'), 'utf8');

  assert.doesNotMatch(adminUsersTemplate, /tr\.innerHTML/);
  assert.match(adminUsersTemplate, /usernameCell\.textContent = user\.username/);
  assert.match(adminUsersTemplate, /deleteBtn\.dataset\.username = user\.username/);
});

test('.gitignore keeps validation and regression tests tracked', () => {
  const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf8');

  assert.doesNotMatch(gitignore, /^scripts\/validate\.sh$/m);
  assert.doesNotMatch(gitignore, /^test\/scripts\.test\.ts$/m);
});

test('server route keeps add-server limiter Redis-capable', () => {
  const serverRoute = fs.readFileSync(path.resolve('routes/server.ts'), 'utf8');
  const redisUtil = fs.readFileSync(path.resolve('utils/redis.ts'), 'utf8');

  // The RateLimitRedisStore wiring lives in the shared redis utility now.
  assert.match(redisUtil, /RateLimitRedisStore/);
  // server.ts must still use the store via the shared factory.
  assert.match(serverRoute, /makeRateLimitStore/);
  assert.match(serverRoute, /store: makeRateLimitStore\(\)/);
});

test('validation and regression files are not ignored by git', async () => {
  assert.equal(await gitCheckIgnoreExitCode('scripts/validate.sh'), 1);
  assert.equal(await gitCheckIgnoreExitCode('test/scripts.test.ts'), 1);
});
