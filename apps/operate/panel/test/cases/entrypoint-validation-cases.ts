/** Production configuration validation scenarios for the production entrypoint. */
import { test } from 'node:test';
import {
  tmpDir,
  dbPath,
  productionEntrypointEnv,
  expectEntrypointFailure,
  fs,
  path,
} from '../support/entrypoint-fixture';

export function registerEntrypointValidationScenarios(): void {
  test('`tsx app.ts` fails fast in production without Redis config', async () => {
    await expectEntrypointFailure(
      productionEntrypointEnv(dbPath),
      /REDIS_URL is required in production/
    );
  });

  test('`tsx app.ts` fails fast in production with weak default password', async () => {
    const weakDbPath = path.join(tmpDir, `weak-default-${Date.now()}.db`);
    await expectEntrypointFailure(
      productionEntrypointEnv(weakDbPath, {
        ALLOW_DEFAULT_CREDENTIALS: 'true',
        DEFAULT_USERNAME: 'admin',
        DEFAULT_PASSWORD: 'change-me',
        REDIS_URL: 'redis://127.0.0.1:6380',
      }),
      /DEFAULT_PASSWORD uses a weak placeholder value in production/
    );
  });

  test('`tsx app.ts` fails fast in production with weak SESSION_SECRET', async () => {
    await expectEntrypointFailure(
      productionEntrypointEnv(path.join(tmpDir, `weak-session-${Date.now()}.db`), {
        SESSION_SECRET: 'change-me',
        REDIS_URL: 'redis://127.0.0.1:6380',
      }),
      /SESSION_SECRET must be a strong secret in production \(32\+ chars, not a placeholder, and not trivially guessable\)/
    );
  });

  test('`tsx app.ts` fails fast in production with short SESSION_SECRET', async () => {
    await expectEntrypointFailure(
      productionEntrypointEnv(path.join(tmpDir, `short-session-${Date.now()}.db`), {
        SESSION_SECRET: 'abc12345',
        REDIS_URL: 'redis://127.0.0.1:6380',
      }),
      /SESSION_SECRET must be a strong secret in production \(32\+ chars, not a placeholder, and not trivially guessable\)/
    );
  });

  test('`tsx app.ts` fails fast in production when explicit DB_PATH is invalid', async () => {
    const invalidDbParent = path.join(tmpDir, 'not-a-directory');
    fs.writeFileSync(invalidDbParent, 'not a directory');
    await expectEntrypointFailure(
      productionEntrypointEnv(path.join(invalidDbParent, '3rr.db'), {
        REDIS_URL: 'redis://127.0.0.1:6380',
      }),
      /Failed to open DB/
    );
  });
}
