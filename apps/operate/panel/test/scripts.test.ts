import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';

const tempPaths: string[] = [];
const projectRoot = path.resolve(__dirname, '..', '..');

function rememberTempPath(tempPath: string): string {
  tempPaths.push(tempPath);
  return tempPath;
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({ code, output });
    });
  });
}

after(() => {
  for (const tempPath of tempPaths) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
});

function resolveSeedUsersCommand(): { command: string; args: string[] } {
  const distScript = path.join(projectRoot, 'dist/scripts/seed-users.js');
  if (fs.existsSync(distScript)) {
    return { command: process.execPath, args: [distScript] };
  }
  return { command: 'npx', args: ['tsx', path.join(projectRoot, 'scripts/seed-users.ts')] };
}

test('`scripts/validate.sh --require-docker` cleans up temporary .env on compose failure', async () => {
  const workspace = rememberTempPath(
    fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-panel-validate-fixture-'))
  );
  const scriptsDir = path.join(workspace, 'scripts');
  const libDir = path.join(scriptsDir, 'lib');
  const fakeBinDir = path.join(workspace, 'fake-bin');
  const cfgDir = path.join(workspace, 'cfg');

  fs.mkdirSync(cfgDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'scripts/validate.sh'), path.join(scriptsDir, 'validate.sh'));
  fs.copyFileSync(path.join(projectRoot, 'scripts/lib/common.sh'), path.join(libDir, 'common.sh'));
  fs.copyFileSync(path.join(projectRoot, '.env.example'), path.join(workspace, '.env.example'));
  fs.copyFileSync(path.join(projectRoot, 'docker-compose.yaml'), path.join(workspace, 'docker-compose.yaml'));
  fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(workspace, 'package.json'));
  fs.copyFileSync(path.join(projectRoot, 'package-lock.json'), path.join(workspace, 'package-lock.json'));
  fs.copyFileSync(path.join(projectRoot, 'cfg/maps.json'), path.join(cfgDir, 'maps.json'));

  // Stub binaries that validate.sh requires before it reaches the Docker section.
  // They must be present so the script proceeds past the shell-lint and JSON/YAML
  // checks to the docker-compose cleanup path under test.
  for (const stub of ['shellcheck', 'shfmt', 'jq', 'ruby']) {
    fs.writeFileSync(path.join(fakeBinDir, stub), '#!/usr/bin/env bash\nexit 0\n', {
      mode: 0o755,
    });
  }

  fs.writeFileSync(
    path.join(fakeBinDir, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "info" ]]; then
  exit 0
fi
if [[ "$1" == "build" ]]; then
  exit 0
fi
if [[ "$1" == "compose" && "$2" == "version" ]]; then
  exit 0
fi
if [[ "$1" == "compose" ]]; then
  exit 42
fi
echo "unexpected docker invocation: $*" >&2
exit 99
`,
    { mode: 0o755 }
  );

  const result = await runCommand('bash', ['scripts/validate.sh', '--require-docker'], {
    cwd: workspace,
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
    },
  });

  assert.notEqual(result.code, 0);
  assert.match(result.output, /docker compose -f .* config -q/);
  assert.equal(fs.existsSync(path.join(workspace, '.env')), false);
});

test('`scripts/seed-users.ts` bootstraps the required schema and avoids duplicate shared-server rows', async () => {
  const tempDir = rememberTempPath(fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-panel-seed-users-')));
  const dbPath = path.join(tempDir, 'fresh.db');
  const seedUsers = resolveSeedUsersCommand();
  const env = {
    ...process.env,
    DB_PATH: dbPath,
    RCON_PASSWORD: 'test-rcon-password',
    RCON_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
  };

  const firstRun = await runCommand(seedUsers.command, seedUsers.args, {
    cwd: projectRoot,
    env,
  });
  assert.equal(firstRun.code, 0, firstRun.output);

  const secondRun = await runCommand(seedUsers.command, seedUsers.args, {
    cwd: projectRoot,
    env,
  });
  assert.equal(secondRun.code, 0, secondRun.output);

  const db = new Database(dbPath, { readonly: true });
  try {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((row) => row.name));

    assert.equal(tableNames.has('users'), true);
    assert.equal(tableNames.has('servers'), true);
    assert.equal(tableNames.has('server_access'), true);

    const userCount = db.prepare(`SELECT COUNT(*) AS count FROM users`).get() as { count: number };
    const serverCount = db.prepare(`SELECT COUNT(*) AS count FROM servers`).get() as {
      count: number;
    };
    const accessCount = db.prepare(`SELECT COUNT(*) AS count FROM server_access`).get() as {
      count: number;
    };

    assert.equal(userCount.count, 10);
    assert.equal(serverCount.count, 1);
    assert.equal(accessCount.count, 10);
  } finally {
    db.close();
  }
});

test('`scripts/seed-users.ts` fails with a targeted error when duplicate servers block the unique index', async () => {
  const tempDir = rememberTempPath(
    fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-panel-seed-users-dupes-'))
  );
  const dbPath = path.join(tempDir, 'duplicates.db');
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE servers (
        id INTEGER PRIMARY KEY,
        serverIP TEXT NOT NULL,
        serverPort INTEGER NOT NULL,
        rconPassword TEXT NOT NULL
      );
      INSERT INTO servers (serverIP, serverPort, rconPassword) VALUES
        ('203.0.113.10', 27015, 'one'),
        ('203.0.113.10', 27015, 'two');
    `);
  } finally {
    db.close();
  }

  const seedUsers = resolveSeedUsersCommand();
  const result = await runCommand(seedUsers.command, seedUsers.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DB_PATH: dbPath,
      RCON_PASSWORD: 'test-rcon-password',
      RCON_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
    },
  });

  assert.notEqual(result.code, 0);
  assert.match(
    result.output,
    /Cannot create idx_servers_ip_port because duplicate server rows already exist/
  );
  assert.match(result.output, /203\.0\.113\.10:27015/);
});

test('docs reflect the live auth contract and umbrella module scope', () => {
  const apiDoc = fs.readFileSync(path.resolve('docs/API.md'), 'utf8');
  const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
  const repoMap = fs.readFileSync(path.resolve('docs/REPO_MAP.md'), 'utf8');
  const changelog = fs.readFileSync(path.resolve('CHANGELOG.md'), 'utf8');

  assert.match(
    apiDoc,
    /State-changing requests \(POST\/PUT\/DELETE\) require a CSRF token.*except `POST \/auth\/login`\./
  );
  assert.match(apiDoc, /\| POST\s+\| `\/auth\/login`\s+\| No\s+\| No\s+\| 20\/15min\s+\|/);
  assert.match(
    apiDoc,
    /\*\*Auth routes:\*\*\s*use the same `\{ "message": "\.\.\." \}` success shape/
  );
  assert.doesNotMatch(apiDoc, /\{ "status": N, "message": "\.\.\." \}/);

  assert.match(readme, /This module is the `operate` surface of `cs2-server-ops`/);
  assert.match(readme, /Use the root repo’s `apps\/maintain\/updater` for unattended updates/);
  assert.match(readme, /RCON_SECRET_KEY` \| yes in production \|/);
  assert.doesNotMatch(readme, /Pterodactyl/);
  assert.doesNotMatch(readme, /docs\/source-audit\//);
  assert.doesNotMatch(readme, /round time, overtime, bots, gravity, weapon shortcuts/);

  assert.match(repoMap, /scripts\/validate\.sh/);
  assert.doesNotMatch(repoMap, /ci-local/);
  assert.doesNotMatch(repoMap, /pterodactyl/i);
  assert.doesNotMatch(repoMap, /plugin grid/);
  assert.doesNotMatch(repoMap, /map\/plugin metadata/);

  assert.doesNotMatch(changelog, /gravity presets/);
  assert.doesNotMatch(changelog, /Reload Current Mode CFG/);
  assert.doesNotMatch(changelog, /Plugin panel/);
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

test('.gitignore keeps validation and regression tests tracked', () => {
  const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf8');

  assert.doesNotMatch(gitignore, /^scripts\/validate\.sh$/m);
  assert.doesNotMatch(gitignore, /^test\/scripts\.test\.ts$/m);
});

test('server route keeps add-server limiter Redis-capable', () => {
  const serverRoute = fs.readFileSync(path.resolve('routes/server.ts'), 'utf8');

  assert.match(serverRoute, /RateLimitRedisStore/);
  assert.match(serverRoute, /store: addServerLimiterStore/);
});
