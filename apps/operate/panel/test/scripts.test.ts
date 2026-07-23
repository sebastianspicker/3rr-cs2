/** Verifies panel scripts preserve fail-fast behavior and documented command boundaries. */
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
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), '3rr-validate-fixture-'));
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
  const apiDoc = fs.readFileSync('docs/API.md', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');
  const repoMap = fs.readFileSync('docs/REPO_MAP.md', 'utf8');

  assert.match(
    apiDoc,
    /State-changing authenticated requests require a CSRF token in\s+the `X-CSRF-Token` header\./
  );
  assert.match(apiDoc, /\| POST\s+\| `\/auth\/login`\s+\| No\s+\| Yes\s+\| 20\/15min\s+\|/);
  assert.match(
    apiDoc,
    /\*\*Auth routes:\*\*\s*use the same `\{ "message": "\.\.\." \}` success shape/
  );
  assert.doesNotMatch(apiDoc, /\{ "status": N, "message": "\.\.\." \}/);

  assert.match(readme, /This module is the `operate` surface of `3rr`/);
  assert.match(readme, /Use the root repo’s `apps\/maintain\/updater` for unattended updates/);
  assert.match(readme, /\| `RCON_SECRET_KEY`\s+\|\s+yes in production\s+\|/);

  assert.match(repoMap, /scripts\/validate\.sh/);
});

test('login and add-server templates submit through form handlers', () => {
  const loginTemplate = fs.readFileSync('views/login.ejs', 'utf8');
  const addServerTemplate = fs.readFileSync('views/add-server.ejs', 'utf8');

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
  const manageRoot = path.join('views', 'partials', 'manage');
  const manageTemplate = [
    fs.readFileSync('views/manage.ejs', 'utf8'),
    ...fs
      .readdirSync(manageRoot)
      .map((name) => fs.readFileSync(path.join(manageRoot, name), 'utf8')),
  ].join('\n');

  assert.doesNotMatch(manageTemplate, /mode-toggle|cs2panel-mode|data-mode/);
  assert.match(manageTemplate, /partials\/manage\//);
  assert.match(manageTemplate, /class="truth-rail"/);
  assert.match(manageTemplate, /<details class="panel advanced-panel/);
  assert.match(manageTemplate, /<h2 aria-label="RCON Console">/);
  assert.match(manageTemplate, /<h2 aria-label="Quick Commands">/);
  assert.match(manageTemplate, /<summary class="panel-header">\s*<h2>Practice Controls<\/h2>/);
});

test('admin user template renders user rows without innerHTML', () => {
  const adminUsersTemplate = fs.readFileSync('views/admin-users.ejs', 'utf8');

  assert.doesNotMatch(adminUsersTemplate, /tr\.innerHTML/);
  assert.match(adminUsersTemplate, /usernameCell\.textContent = user\.username/);
  assert.match(adminUsersTemplate, /deleteBtn\.dataset\.username = user\.username/);
});

test('.gitignore keeps validation and regression tests tracked', () => {
  const gitignore = fs.readFileSync('.gitignore', 'utf8');

  assert.doesNotMatch(gitignore, /^scripts\/validate\.sh$/m);
  assert.doesNotMatch(gitignore, /^test\/scripts\.test\.ts$/m);
});

test('add-server route keeps its limiter Redis-capable', () => {
  const addServerRoute = fs.readFileSync('routes/serverAdd.ts', 'utf8');
  const redisUtil = fs.readFileSync('utils/redis.ts', 'utf8');

  // The RateLimitRedisStore wiring lives in the shared redis utility now.
  assert.match(redisUtil, /RateLimitRedisStore/);
  // The extracted add-server route must still use the store via the shared factory.
  assert.match(addServerRoute, /makeRateLimitStore/);
  assert.match(addServerRoute, /store: makeRateLimitStore\(\)/);
});

test('validation and regression files are not ignored by git', async () => {
  assert.equal(await gitCheckIgnoreExitCode('scripts/validate.sh'), 1);
  assert.equal(await gitCheckIgnoreExitCode('test/scripts.test.ts'), 1);
});

test('startup wrapper resolves relative admin sources before linking into the server tree', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-startup-links-'));
  const installDir = path.join(workspace, 'install');
  const gameDir = path.join(installDir, 'game');
  const adminsSource = path.join(workspace, 'admins.json');
  const groupsSource = path.join(workspace, 'admin_groups.json');
  const envProbe = path.join(workspace, 'server-env.txt');
  const secretCfg = path.join(installDir, 'game/csgo/cfg/3rr-secrets.cfg');
  const secretVictim = path.join(workspace, 'secret-victim.txt');
  const startupScript = path.resolve(
    projectRoot,
    '../../../configs/examples/startup/server-start.sh'
  );

  try {
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(
      path.join(gameDir, 'cs2.sh'),
      `#!/usr/bin/env bash
set -euo pipefail
{
  printf 'RCON_PASSWORD=%s\\n' "\${RCON_PASSWORD+x}"
  printf 'CS2_GSLT=%s\\n' "\${CS2_GSLT+x}"
} > "\${CS2_ENV_PROBE_FILE:?}"
`,
      { mode: 0o755 }
    );
    fs.writeFileSync(adminsSource, '{}\n');
    fs.writeFileSync(groupsSource, '{"groups":[]}\n');
    fs.mkdirSync(path.dirname(secretCfg), { recursive: true });
    fs.writeFileSync(secretVictim, 'unchanged victim\n');
    fs.symlinkSync(secretVictim, secretCfg);

    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(startupScript, [], {
        cwd: workspace,
        env: {
          ...process.env,
          CS2_INSTALL_DIR: installDir,
          CSS_ADMINS_FILE: 'admins.json',
          CSS_GROUPS_FILE: 'admin_groups.json',
          RCON_PASSWORD: 'test-rcon-password',
          CS2_GSLT: 'test-gslt-token',
          CS2_ENV_PROBE_FILE: envProbe,
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, stderr }));
    });

    assert.equal(result.code, 0, result.stderr);
    const configDir = path.join(installDir, 'game/csgo/addons/counterstrikesharp/configs');
    assert.equal(
      fs.realpathSync(path.join(configDir, 'admins.json')),
      fs.realpathSync(adminsSource)
    );
    assert.equal(
      fs.realpathSync(path.join(configDir, 'admin_groups.json')),
      fs.realpathSync(groupsSource)
    );
    assert.equal(fs.readFileSync(envProbe, 'utf8'), 'RCON_PASSWORD=\nCS2_GSLT=\n');
    assert.equal(fs.readFileSync(secretVictim, 'utf8'), 'unchanged victim\n');
    const secretStats = fs.lstatSync(secretCfg);
    assert.equal(secretStats.isSymbolicLink(), false);
    assert.equal(secretStats.isFile(), true);
    assert.equal(secretStats.mode & 0o777, 0o600);
    assert.equal(
      fs.readFileSync(secretCfg, 'utf8'),
      'rcon_password "test-rcon-password"\nsv_setsteamaccount "test-gslt-token"\n'
    );
  } finally {
    await rmRecursiveWithRetry(workspace);
  }
});

test('startup wrapper rejects an admin link destination that is a directory', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-startup-directory-link-'));
  const installDir = path.join(workspace, 'install');
  const gameDir = path.join(installDir, 'game');
  const adminsSource = path.join(workspace, 'admins.json');
  const adminsTarget = path.join(
    installDir,
    'game/csgo/addons/counterstrikesharp/configs/admins.json'
  );
  const startupScript = path.resolve(
    projectRoot,
    '../../../configs/examples/startup/server-start.sh'
  );

  try {
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'cs2.sh'), '#!/usr/bin/env bash\nexit 0\n', {
      mode: 0o755,
    });
    fs.writeFileSync(adminsSource, '{}\n');
    fs.mkdirSync(adminsTarget, { recursive: true });

    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(startupScript, [], {
        cwd: workspace,
        env: {
          ...process.env,
          CS2_INSTALL_DIR: installDir,
          CSS_ADMINS_FILE: 'admins.json',
          RCON_PASSWORD: 'test-rcon-password',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, stderr }));
    });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Link destination must not be a directory/);
    assert.equal(fs.existsSync(path.join(adminsTarget, 'admins.json')), false);
  } finally {
    await rmRecursiveWithRetry(workspace);
  }
});

test('shared Compose examples keep proxy trust and published game ports aligned with runtime input', () => {
  const composeDir = path.resolve(projectRoot, '../../../configs/examples/compose');
  const panelCompose = fs.readFileSync(path.join(composeDir, 'panel.compose.yaml'), 'utf8');
  const serverCompose = fs.readFileSync(
    path.join(composeDir, 'server-runtime.compose.yaml'),
    'utf8'
  );

  assert.match(panelCompose, /TRUST_PROXY: \$\{TRUST_PROXY:-false\}/);
  assert.doesNotMatch(panelCompose, /TRUST_PROXY: \$\{TRUST_PROXY:-1\}/);
  assert.match(panelCompose, /REDIS_URL: \$\{REDIS_URL:-redis:\/\/redis:6379\}/);
  assert.match(panelCompose, /"\$\{PANEL_BIND_ADDRESS:-127\.0\.0\.1\}:3000:3000"/);
  assert.match(serverCompose, /"\$\{CS2_PORT:-27015\}:\$\{CS2_PORT:-27015\}\/udp"/);
  assert.match(serverCompose, /"\$\{CS2_PORT:-27015\}:\$\{CS2_PORT:-27015\}\/tcp"/);
});

test('Docker build context excludes local credentials and generated state', () => {
  const dockerIgnore = fs.readFileSync('.dockerignore', 'utf8');
  for (const requiredPattern of [
    '.env.*',
    '.npmrc.local',
    '.e2e/',
    'test-results/',
    'tmp-*/',
    '*.db',
    '*.key',
    '*.pem',
  ]) {
    assert.match(
      dockerIgnore,
      new RegExp(`^${requiredPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm')
    );
  }
});
