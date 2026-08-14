/** Password-change scenarios for authenticated panel users. */
import { test } from 'node:test';
import {
  app,
  fixtureCredential,
  withServer,
  assert,
  loginAndGetSession,
  loginAsAdmin,
  postUserApi,
} from '../support/user-management-fixture';

test('POST /api/users/change-password returns 401 when not authenticated', async () => {
  await withServer(app, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: fixtureCredential('admin'),
        newPassword: fixtureCredential('new'),
      }),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/change-password succeeds with correct current password', async () => {
  await withServer(app, async (port) => {
    const session = await loginAsAdmin(port);
    const res = await postUserApi(
      port,
      'change-password',
      {
        currentPassword: fixtureCredential('admin'),
        newPassword: fixtureCredential('newadmin'),
      },
      session
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { message?: string };
    assert.equal(body.message, 'Password updated');

    // Restore password for subsequent tests.
    const updatedSession = await loginAndGetSession(
      port,
      'adminuser',
      fixtureCredential('newadmin')
    );
    await postUserApi(
      port,
      'change-password',
      {
        currentPassword: fixtureCredential('newadmin'),
        newPassword: fixtureCredential('admin'),
      },
      updatedSession
    );
  });
});

test('POST /api/users/change-password returns 401 on wrong current password', async () => {
  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'change-password', {
      currentPassword: fixtureCredential('wrong'),
      newPassword: fixtureCredential('new'),
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/users/change-password returns 400 when new password is too short', async () => {
  await withServer(app, async (port) => {
    const res = await postUserApi(port, 'change-password', {
      currentPassword: fixtureCredential('admin'),
      newPassword: 'short',
    });
    assert.equal(res.status, 400);
  });
});
