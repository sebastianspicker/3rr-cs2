/** Repository and validation-script scenario registrations for the discovery shell. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createValidationFixture,
  gitCheckIgnoreExitCode,
  rmRecursiveWithRetry,
  runValidation,
} from '../support/validation-script-fixture';

/** Registers validation cleanup, documentation, template, and tracking contracts. */
export function registerScriptScenarios(): void {
  test('`scripts/validate.sh --require-docker` cleans up temporary .env on compose failure', async () => {
    const { workspace } = createValidationFixture();
    try {
      const result = await runValidation(workspace);

      assert.notEqual(result.code, 0);
      assert.match(result.output, /docker compose -f .* config -q/);
      assert.equal(fs.existsSync(`${workspace}/.env`), false);
    } finally {
      await rmRecursiveWithRetry(workspace);
    }
  });

  test('docs reflect the live auth contract and umbrella module scope', () => {
    const apiDoc = fs.readFileSync('docs/API.md', 'utf8');
    const readme = fs.readFileSync('README.md', 'utf8');
    const repoMap = fs.readFileSync('docs/REPO_MAP.md', 'utf8');

    assert.match(
      apiDoc,
      /State-changing authenticated requests require a CSRF token in\s+the `X-CSRF-Token` header\./
    );
    assert.match(apiDoc, /\| POST\s+\| `\/auth\/login`\s+\| No\s+\| Yes\s+\| 20\/15min\s+\|/);
    assert.match(apiDoc, /Auth routes use the same `\{ "message": "\.\.\." \}` success shape/);
    assert.doesNotMatch(apiDoc, /\{ "status": N, "message": "\.\.\." \}/);

    assert.match(
      readme,
      /The operate panel is an Express and EJS application for authenticated control/
    );
    assert.match(readme, /The panel does not install or update CS2, CFG files, maps, or plugins\./);
    assert.match(
      readme,
      /\| `RCON_SECRET_KEY`\s+\| Production\s+\|.*Encrypts stored RCON passwords/
    );

    assert.match(repoMap, /`scripts\/`: build, validation, screenshot, and utility scripts/);
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
    const manageTemplate = [
      fs.readFileSync('views/manage.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/console.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/header.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/match-controls.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/observed-status.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/players.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/practice.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/scrim.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/setup.ejs', 'utf8'),
      fs.readFileSync('views/partials/manage/truth-rail.ejs', 'utf8'),
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

    assert.match(redisUtil, /RateLimitRedisStore/);
    assert.match(addServerRoute, /makeRateLimitStore/);
    assert.match(addServerRoute, /store: makeRateLimitStore\(\)/);
  });

  test('validation and regression files are not ignored by git', async () => {
    assert.equal(await gitCheckIgnoreExitCode('scripts/validate.sh'), 1);
    assert.equal(await gitCheckIgnoreExitCode('test/scripts.test.ts'), 1);
  });
}
