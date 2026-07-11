import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAutocompleteOutput,
  parseStatusResponse,
  parseUsersResponse,
  parseVisibleMaxPlayers,
  steamAccountIdToSteamId64,
} from '../utils/rconParsers';

describe('RCON parsers', () => {
  it('parses map, human count, bot count, and max players from status output', () => {
    const parsed = parseStatusResponse(`
hostname: scrim server
map     : de_ancient
players : 4 humans, 1 bots (12 max) (not hibernating)
`);
    assert.deepEqual(parsed, {
      map: 'de_ancient',
      humans: 4,
      bots: 1,
      maxPlayers: 12,
    });
  });

  it('returns null status fields for empty or malformed status output', () => {
    assert.deepEqual(parseStatusResponse(''), {
      map: null,
      humans: null,
      bots: null,
      maxPlayers: null,
    });
    assert.deepEqual(parseStatusResponse('server is awake'), {
      map: null,
      humans: null,
      bots: null,
      maxPlayers: null,
    });
  });

  it('parses sv_visiblemaxplayers cvar output and ignores hidden unlimited values', () => {
    assert.equal(parseVisibleMaxPlayers('sv_visiblemaxplayers = 10 ( def. -1 )'), 10);
    assert.equal(parseVisibleMaxPlayers('"sv_visiblemaxplayers" = "12"'), 12);
    assert.equal(parseVisibleMaxPlayers('sv_visiblemaxplayers = -1'), null);
    assert.equal(parseVisibleMaxPlayers(''), null);
  });

  it('parses userid/name from users output and only derives SteamID64 from Steam account ids', () => {
    const players = parseUsersResponse(`
userid name uniqueid connected ping loss state rate adr
2 "Alice Example" [U:1:12345] 00:12 20 0 active
3 "No Steam Id" STEAM_1:0:111 00:10 20 0 active
4 Bob [U:1:2] 00:08 20 0 active
`);
    assert.deepEqual(players, [
      {
        userid: '2',
        name: 'Alice Example',
        steam_account_id: '12345',
        steam_id64: '76561197960278073',
      },
      {
        userid: '3',
        name: 'No Steam Id',
        steam_account_id: null,
        steam_id64: null,
      },
      {
        userid: '4',
        name: 'Bob',
        steam_account_id: '2',
        steam_id64: '76561197960265730',
      },
    ]);
  });

  it('cleans player display names without HTML escaping already-safe text', () => {
    const players = parseUsersResponse(`
2 "<b>&amp;\u202ePlayer</b>" [U:1:12345] 00:12 20 0 active
`);
    assert.equal(players[0]?.name, '<b>&amp;Player</b>');
  });

  it('handles users empty output and duplicate userid lines deterministically', () => {
    assert.deepEqual(parseUsersResponse(''), []);
    assert.deepEqual(
      parseUsersResponse(`
1 "First" [U:1:10]
1 "Second" [U:1:11]
`),
      [
        {
          userid: '1',
          name: 'Second',
          steam_account_id: '11',
          steam_id64: '76561197960265739',
        },
      ]
    );
  });

  it('keeps five-digit userids and rejects six-digit userids', () => {
    const players = parseUsersResponse(`
userid name uniqueid connected ping loss state rate adr
10000 "Five Digit" [U:1:20] 00:12 20 0 active
100000 "Six Digit" [U:1:21] 00:12 20 0 active
`);
    assert.deepEqual(players, [
      {
        userid: '10000',
        name: 'Five Digit',
        steam_account_id: '20',
        steam_id64: '76561197960265748',
      },
    ]);
  });

  it('extracts autocomplete names from cmdlist and cvarlist output', () => {
    assert.deepEqual(
      parseAutocompleteOutput(
        `
cmdlist
status
"exec" game
host_workshop_map
3 commands total.
`,
        `
"sv_visiblemaxplayers" = "12"
mp_restartgame : 1 : replicated
`
      ),
      ['exec', 'host_workshop_map', 'mp_restartgame', 'status', 'sv_visiblemaxplayers']
    );
  });

  it('converts Steam account ids to SteamID64', () => {
    assert.equal(steamAccountIdToSteamId64('0'), '76561197960265728');
    assert.equal(steamAccountIdToSteamId64('12345'), '76561197960278073');
    assert.equal(steamAccountIdToSteamId64('not-digits'), null);
  });
});
