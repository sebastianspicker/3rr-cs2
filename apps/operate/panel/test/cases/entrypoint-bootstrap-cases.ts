/** Default-admin bootstrap scenarios for the production entrypoint. */
import { test } from 'node:test';
import {
  tmpDir,
  withEntrypoint,
  expectEntrypointFailure,
  postLogin,
  path,
  assert,
} from '../support/entrypoint-fixture';

export function registerEntrypointBootstrapScenarios(): void {
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
      await withEntrypoint(
        {
          DB_PATH: path.join(tmpDir, `default-user-${label.replaceAll(' ', '-')}-${Date.now()}.db`),
          DEFAULT_USERNAME: envUsername,
          DEFAULT_PASSWORD: password,
          ALLOW_DEFAULT_CREDENTIALS: 'true',
        },
        async ({ port, output }) => {
          const login = await postLogin(port, loginUsername, password);
          assert.equal(login.status, 200, `${label}\noutput:\n${output()}`);
        }
      );
    }
  });

  test('default admin bootstrap rejects whitespace-only username', async () => {
    await expectEntrypointFailure(
      {
        NODE_ENV: 'test',
        DB_PATH: path.join(tmpDir, `blank-default-user-${Date.now()}.db`),
        DEFAULT_USERNAME: '   ',
        DEFAULT_PASSWORD: ['default', 'admin', '12345'].join('_'),
        ALLOW_DEFAULT_CREDENTIALS: 'true',
      },
      /DEFAULT_USERNAME must not be empty/
    );
  });
}
