import { app, assert, loginOrReuseSession, type AddressInfo, type Server } from './app-fixture';

export type SetupGameRequest = {
  gameType: string;
  gameMode: string;
  selectedMap: string;
  team1?: string;
  team2?: string;
};

export type SetupGameMapCase = SetupGameRequest & {
  name: string;
  expectedStatus: 200 | 400;
};

export async function submitSetupGame({
  gameType,
  gameMode,
  selectedMap,
  team1,
  team2,
}: SetupGameRequest): Promise<Response> {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginOrReuseSession(port);
    const res = await fetch(`http://127.0.0.1:${port}/api/setup-game`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        server_id: 1,
        game_type: gameType,
        game_mode: gameMode,
        selectedMap,
        ...(team1 ? { team1 } : {}),
        ...(team2 ? { team2 } : {}),
      }),
    });
    return res;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function assertSetupGameMapCase({
  expectedStatus,
  ...request
}: SetupGameMapCase): Promise<void> {
  const res = await submitSetupGame(request);
  assert.equal(res.status, expectedStatus);
  if (expectedStatus === 400) {
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /selectedMap must be one of/);
  }
}
