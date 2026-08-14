/** Authentication guard coverage for new game-operation routes. */
import { test } from 'node:test';
import { app, assert, type AddressInfo, type Server } from '../support/app-fixture';

const QUICK_WIN_ROUTES = [
  '/api/matchzy-abort',
  '/api/matchzy-coach',
  '/api/matchzy-load-match-file',
  '/api/player-kick',
  '/api/player-mute',
  '/api/player-unmute',
  '/api/set-mapgroup',
  '/api/workshop-collection',
  '/api/damage-print-toggle',
  '/api/set-buytime',
  '/api/noclip',
  '/api/rethrow-grenade',
];

export function registerGameRouteAuthGuardScenarios(): void {
  for (const route of QUICK_WIN_ROUTES) {
    test(`POST ${route} returns 401 without session`, async () => {
      const server: Server = app.listen(0);
      try {
        const { port } = server.address() as AddressInfo;
        const res = await fetch(`http://127.0.0.1:${port}${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ server_id: 1 }),
        });
        assert.equal(res.status, 401);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  }
}
