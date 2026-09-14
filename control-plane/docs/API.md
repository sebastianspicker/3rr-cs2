# API reference

Three endpoints are public: `GET /` serves the login page, `POST /auth/login`
creates a session, and `GET /api/health` reports health. Every other page and
API endpoint requires a session cookie. Authenticated requests that change
state must also send a CSRF token in the `X-CSRF-Token` header.

## Authentication flow

1. Request `GET /` to render the login page and receive a session cookie and
   CSRF token.
2. Send the username, password, and login-page CSRF token to
   `POST /auth/login`.
3. Include the session cookie on later requests and the CSRF token on requests
   that change state.
4. Send `POST /auth/logout` to destroy the session.

On each protected request, the application reloads the session user from
SQLite. A deleted user cannot continue using an old session, and admin routes
use the current stored admin flag rather than the value present when the user
signed in.

## Authentication

| Method | Path           | Auth | CSRF | Rate Limit |
| ------ | -------------- | ---- | ---- | ---------- |
| POST   | `/auth/login`  | No   | Yes  | 20/15 min  |
| POST   | `/auth/logout` | Yes  | Yes  | -          |

## Server management

| Method | Path                    | Auth | CSRF | Description                              |
| ------ | ----------------------- | ---- | ---- | ---------------------------------------- |
| GET    | `/servers`              | Yes  | -    | Servers list page                        |
| GET    | `/manage/:server_id`    | Yes  | -    | Server management page                   |
| GET    | `/add-server`           | Yes  | -    | Add server form                          |
| GET    | `/api/servers`          | Yes  | -    | JSON list of servers with RCON status    |
| POST   | `/api/add-server`       | Yes  | Yes  | Add new server (ip, port, rcon_password) |
| POST   | `/api/delete-server`    | Yes  | Yes  | Delete server by server_id               |
| POST   | `/api/reconnect-server` | Yes  | Yes  | Reconnect RCON for server_id             |

`/api/add-server` tests the supplied RCON credentials before saving the server.
If that test succeeds but the control plane cannot establish an authenticated,
managed RCON connection after saving, the endpoint returns `502` with an error.
`/api/reconnect-server` also returns `502` if the reconnect attempt does not
produce an authenticated connection.

When the application cannot decrypt a stored RCON credential, reconnect and
command endpoints return a local credential-storage error with
`credential_error`. They do not report the problem as a rejection by the
remote server.

Use the `status` field from `/api/servers` to read RCON state:
`connected`, `disconnected`, `unknown`, or `error`. Each row also includes
`observed_at`, `status_source`, `timed_out`, and `error` so callers can separate
unobserved, slow, and failed hostname probes from confirmed disconnection. The
legacy `connected` and `authenticated` booleans remain for compatibility and
cannot distinguish an unknown state from a confirmed disconnection on their
own.

`/api/delete-server` first removes the caller's access. If no other user has
access, it also deletes the server row and returns `server_deleted: true` with
`rcon_cleanup: "completed"`. Shared-server access removal returns
`server_deleted: false` and `rcon_cleanup: "not_needed"`. If the row is deleted
but RCON cleanup fails, the endpoint returns a non-2xx response with
`rcon_cleanup: "failed"`.

## Game setup

| Method | Path                                          | Auth | CSRF | Description                               |
| ------ | --------------------------------------------- | ---- | ---- | ----------------------------------------- |
| POST   | `/api/setup-game`                             | Yes  | Yes  | Deploy match (map, teams, game type/mode) |
| GET    | `/api/game-types/:type/game-modes`            | Yes  | -    | List game modes for type                  |
| GET    | `/api/game-types/:type/game-modes/:mode/maps` | Yes  | -    | List maps for mode                        |

`POST /api/setup-game` stores the most recent setup requested from the manage
page. This records what the operator asked for; it does not confirm the live
map or game mode. A successful response includes
`setup_state: "requested"`, `observed: false`, and `requested_setup`.

## Match control

| Method | Path                  | Auth | CSRF | Description       |
| ------ | --------------------- | ---- | ---- | ----------------- |
| POST   | `/api/restart`        | Yes  | Yes  | Restart game      |
| POST   | `/api/pause`          | Yes  | Yes  | Pause match       |
| POST   | `/api/unpause`        | Yes  | Yes  | Unpause match     |
| POST   | `/api/start-warmup`   | Yes  | Yes  | Start warmup      |
| POST   | `/api/start-knife`    | Yes  | Yes  | Start knife round |
| POST   | `/api/swap-team`      | Yes  | Yes  | Swap teams        |
| POST   | `/api/scramble-teams` | Yes  | Yes  | Scramble teams    |

## Bot control

| Method | Path                  | Auth | CSRF | Description              |
| ------ | --------------------- | ---- | ---- | ------------------------ |
| POST   | `/api/add-bot`        | Yes  | Yes  | Add bot                  |
| POST   | `/api/kick-all-bots`  | Yes  | Yes  | Kick all bots            |
| POST   | `/api/kill-bots`      | Yes  | Yes  | Kill all bots            |
| POST   | `/api/bot-add-ct`     | Yes  | Yes  | Add CT bot               |
| POST   | `/api/bot-add-t`      | Yes  | Yes  | Add T bot                |
| POST   | `/api/bot-kick-ct`    | Yes  | Yes  | Kick CT bots             |
| POST   | `/api/bot-kick-t`     | Yes  | Yes  | Kick T bots              |
| POST   | `/api/bot-difficulty` | Yes  | Yes  | Set bot difficulty (0-3) |

## Game settings

| Method | Path                             | Auth | CSRF | Description                                |
| ------ | -------------------------------- | ---- | ---- | ------------------------------------------ |
| POST   | `/api/cheats-toggle`             | Yes  | Yes  | Toggle sv_cheats (0/1)                     |
| POST   | `/api/free-armor-toggle`         | Yes  | Yes  | Toggle mp_free_armor                       |
| POST   | `/api/buy-anywhere-toggle`       | Yes  | Yes  | Toggle mp_buy_anywhere                     |
| POST   | `/api/grenade-trajectory-toggle` | Yes  | Yes  | Toggle grenade trajectory                  |
| POST   | `/api/show-impacts-toggle`       | Yes  | Yes  | Toggle sv_showimpacts                      |
| POST   | `/api/respawn-toggle`            | Yes  | Yes  | Toggle respawn on death (CT + T)           |
| POST   | `/api/infinite-ammo-toggle`      | Yes  | Yes  | Set sv_infinite_ammo (0/1/2)               |
| POST   | `/api/limitteams-toggle`         | Yes  | Yes  | Toggle mp_limitteams                       |
| POST   | `/api/autoteam-toggle`           | Yes  | Yes  | Toggle mp_autoteambalance                  |
| POST   | `/api/friendlyfire-toggle`       | Yes  | Yes  | Toggle mp_friendlyfire                     |
| POST   | `/api/autokick-toggle`           | Yes  | Yes  | Toggle mp_autokick                         |
| POST   | `/api/damage-print-toggle`       | Yes  | Yes  | Toggle mp_damage_print_enable              |
| POST   | `/api/set-freezetime`            | Yes  | Yes  | Set mp_freezetime (0/5/10/15/20)           |
| POST   | `/api/set-buytime`               | Yes  | Yes  | Set mp_buytime (10/15/30/45/90)            |
| POST   | `/api/set-startmoney`            | Yes  | Yes  | Set mp_startmoney (0/800/1600/3200/16000)  |
| POST   | `/api/set-roundtime`             | Yes  | Yes  | Set mp_roundtime (1/2/5/60 min)            |
| POST   | `/api/set-maxrounds`             | Yes  | Yes  | Set mp_maxrounds (16/24/30)                |
| POST   | `/api/set-overtime`              | Yes  | Yes  | Configure overtime enable + rounds (3/5/6) |
| POST   | `/api/give-weapon`               | Yes  | Yes  | Give utility weapon to all players         |

Controls that send several RCON commands run them in order. If a later command
fails after earlier commands have been sent, the response is `500` with
`partial: true`, `applied_commands`, `failed_command`, and
`failed_command_index`, indicating that the server may be partially updated.
Numeric preset fields such as `value` and `ot_rounds` accept JSON integers or
string integers only; malformed strings like `5abc` or `5.5` are rejected with
`400`.

## Practice controls

| Method | Path                        | Auth | CSRF | Description                               |
| ------ | --------------------------- | ---- | ---- | ----------------------------------------- |
| POST   | `/api/noclip`               | Yes  | Yes  | Toggle noclip                             |
| POST   | `/api/rethrow-grenade`      | Yes  | Yes  | Rethrow last grenade                      |
| POST   | `/api/random-rounds-toggle` | Yes  | Yes  | Toggle random rounds mode (cfg-based 0/1) |
| POST   | `/api/rtd-toggle`           | Yes  | Yes  | Toggle Roll the Dice plugin (cfg-based)   |
| POST   | `/api/rtd-force-roll`       | Yes  | Yes  | Force a dice roll for all players         |

## Maps and Workshop

| Method | Path                       | Auth | CSRF | Description                                      |
| ------ | -------------------------- | ---- | ---- | ------------------------------------------------ |
| POST   | `/api/workshop-map`        | Yes  | Yes  | Load a Steam Workshop map by ID (5–20 digit id)  |
| POST   | `/api/workshop-collection` | Yes  | Yes  | Load a Workshop collection by ID (5–20 digit id) |
| POST   | `/api/set-mapgroup`        | Yes  | Yes  | Set active map group by id (from maps.json)      |

## Player management

| Method | Path                 | Auth | CSRF | Body field | Description                                |
| ------ | -------------------- | ---- | ---- | ---------- | ------------------------------------------ |
| POST   | `/api/player-kick`   | Yes  | Yes  | `userid`   | Kick player by numeric userid (1–5 digits) |
| POST   | `/api/player-mute`   | Yes  | Yes  | `steamid`  | Mute player by SteamID64 (17 digits)       |
| POST   | `/api/player-unmute` | Yes  | Yes  | `steamid`  | Unmute player by SteamID64                 |

## MatchZy

| Method | Path                           | Auth | CSRF | Body field         | Description                                     |
| ------ | ------------------------------ | ---- | ---- | ------------------ | ----------------------------------------------- |
| POST   | `/api/matchzy-match`           | Yes  | Yes  | -                  | Load live.cfg and start MatchZy match           |
| POST   | `/api/matchzy-practice`        | Yes  | Yes  | -                  | Enable MatchZy practice mode                    |
| POST   | `/api/matchzy-exitprac`        | Yes  | Yes  | -                  | Exit practice mode, load warmup.cfg             |
| POST   | `/api/matchzy-playout`         | Yes  | Yes  | -                  | Enable playout (finish remaining rounds)        |
| POST   | `/api/matchzy-abort`           | Yes  | Yes  | -                  | Abort current match, load warmup.cfg            |
| POST   | `/api/matchzy-readyrequired`   | Yes  | Yes  | `value` (0–10)     | Set number of ready players required (0 = none) |
| POST   | `/api/matchzy-coach`           | Yes  | Yes  | `side` (`ct`\|`t`) | Assign coach slot for the given side            |
| POST   | `/api/matchzy-load-match-file` | Yes  | Yes  | `filename`         | Load match config from `.json` file on server   |

## Backups

| Method | Path                         | Auth | CSRF | Description                   |
| ------ | ---------------------------- | ---- | ---- | ----------------------------- |
| POST   | `/api/list-backups`          | Yes  | Yes  | List available round backups  |
| POST   | `/api/restore-round`         | Yes  | Yes  | Restore specific round (1-99) |
| POST   | `/api/restore-latest-backup` | Yes  | Yes  | Restore latest backup         |

Backup endpoints include `backup_state` when they can classify the server's
response. An empty, malformed, or unsafe response to the latest-backup request
returns a non-2xx status and sets `backup_state` to `"unknown"`,
`"malformed_response"`, or `"unsafe_filename"`. It is not reported as an empty
backup list.

## RCON and chat

| Method | Path                           | Auth | CSRF | Description                        |
| ------ | ------------------------------ | ---- | ---- | ---------------------------------- |
| POST   | `/api/rcon`                    | Yes  | Yes  | Execute one validated RCON command |
| POST   | `/api/say-admin`               | Yes  | Yes  | Broadcast message to server        |
| GET    | `/api/rcon/history/:server_id` | Yes  | -    | List sent RCON commands            |
| DELETE | `/api/rcon/history/:server_id` | Yes  | Yes  | Clear sent RCON command history    |

`/api/rcon` reports command delivery separately from the history write. A
successfully dispatched command returns `command_sent: true`. If the command
was sent but its history entry could not be saved, the response also contains
`history_recorded: false` and `partial: true`.

The free-form console accepts one printable ASCII command up to the protocol
length limit. It rejects command separators and blocks command verbs that can
change process, credential, logging, plugin, or RCON configuration. This policy
blocks dangerous commands rather than allowing only a fixed command list.

RCON history records commands that were sent; it does not prove that they
changed server state. If history cannot be read, the endpoint returns
`history_state: "unavailable"` rather than an empty list.

## Operator data

| Method | Path                                              | Auth | CSRF | Description                                  |
| ------ | ------------------------------------------------- | ---- | ---- | -------------------------------------------- |
| GET    | `/api/players/:server_id`                         | Yes  | -    | RCON player list and observed player counts  |
| GET    | `/api/rcon/autocomplete/:server_id`               | Yes  | -    | Cached, allowlisted RCON command suggestions |
| GET    | `/api/workshop-favorites/:server_id`              | Yes  | -    | List the caller's saved Workshop favorites   |
| POST   | `/api/workshop-favorites/:server_id`              | Yes  | Yes  | Create or update a favorite by Workshop ID   |
| PATCH  | `/api/workshop-favorites/:server_id/:favorite_id` | Yes  | Yes  | Update a saved favorite                      |
| DELETE | `/api/workshop-favorites/:server_id/:favorite_id` | Yes  | Yes  | Delete a saved favorite                      |

`/api/players/:server_id` may return partial observations. Unknown counts stay
`null`, and the response includes an `error` field if either `users` or
`status` is unavailable. The autocomplete endpoint accepts optional `q`,
`limit`, and `refresh` query parameters. Its response includes `cached`,
`observed_at`, and an `error` field when an RCON source is unavailable. Updating
a favorite to a Workshop ID that already exists returns `409`.

## Status and health

| Method | Path                     | Auth | CSRF | Rate Limit | Description                                                                                                                                                                                  |
| ------ | ------------------------ | ---- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/status/:server_id` | Yes  | -    | 60/min     | Live server status                                                                                                                                                                           |
| GET    | `/api/health`            | No   | -    | -          | Health check for load balancers; minimal payload includes liveness `ok` and readiness `ready`; includes DB/Redis/RCON details when `HEALTHCHECK_VERBOSE=true` or the caller is authenticated |

`/api/status/:server_id` reports RCON connection and authentication separately
from the completeness of the status data. When some RCON observations succeed
and others fail, the response has `partial: true`, `complete: false`, `null` for
unknown counts, and an `error` string that names the unavailable observations.
Clients must preserve unknown player counts as `null` rather than converting
them to zero.

## User management

| Method | Path                         | Auth | Admin | CSRF | Description                                         |
| ------ | ---------------------------- | ---- | ----- | ---- | --------------------------------------------------- |
| GET    | `/settings`                  | Yes  | No    | -    | Change-password page                                |
| GET    | `/admin/users`               | Yes  | Yes   | -    | User management page                                |
| GET    | `/api/users/list`            | Yes  | Yes   | -    | JSON list of all users (id, username, is_admin)     |
| POST   | `/api/users/change-password` | Yes  | No    | Yes  | Change own password (currentPassword, newPassword)  |
| POST   | `/api/users/add`             | Yes  | Yes   | Yes  | Create user (username, password, optional serverId) |
| POST   | `/api/users/delete`          | Yes  | Yes   | Yes  | Delete user by id; cannot delete own account        |

`/api/users/delete` also deletes servers that only the deleted user could
access. Servers shared with other users remain available. A successful response
includes `user_deleted: true`, `deleted_server_ids`, and
`rcon_cleanup: "completed" | "not_needed"`. If database deletion commits but
RCON cleanup fails, the response is non-2xx and includes
`rcon_cleanup: "failed"` and `failed_server_ids`.

## Common response formats

Response bodies vary by endpoint. Successful state changes generally include a
`message` and may include the fields described in the relevant section above.
Creation endpoints use HTTP `201` where applicable; other successful endpoints
use `200`.

Error responses include `error` and may include details about the failed
operation. These endpoints use HTTP `400`, `401`, `403`, `404`, `409`, `429`, `500`,
`502`, `503`, or `504` depending on the failure.

Login attempts are limited to 20 per 15 minutes. API requests are limited to
60 per minute, and RCON console requests have an additional 15-per-minute
limit. Limited requests return `429`. `/api/health` returns `503` when SQLite
or configured Redis is unhealthy.

Authentication endpoints use the same `{ "message": "..." }` success shape as
other endpoints.

## Request body format

API POST requests accept JSON (`Content-Type: application/json`). The
application also parses URL-encoded form bodies for browser form routes.

Common fields:

- `server_id` (string or number): required for game and server operations
- `value` (integer or decimal integer string): used by toggle and preset routes
  with route-specific allowed values

## Observation caching and command outcomes

`GET /api/servers`, `GET /api/status/:server_id`, and
`GET /api/players/:server_id` reuse successful RCON observations for five
seconds. `refresh=1` skips completed cache entries but joins matching work that
is already in progress. `GET /api/servers?observe=0` returns the stored server
list and connection state without sending RCON commands; the navigation rail
uses this form. The application checks access before reading an observation.

`observed_at` is the time of the original observation, even when the value came
from the cache. A response assembled from several observations reports the
oldest successful observation time. Partial responses keep their usual fields
and HTTP success status, with unavailable values left unknown.

Ordinary RCON work enters a FIFO queue with fixed capacity. A full queue returns HTTP `503`,
and exhausting the total execution deadline returns HTTP `504`. Error responses
add `code` and `outcome`: `not_sent` means the failed command was never
dispatched, while `unknown` means it was dispatched but the result could not be
confirmed.

Investigate an unknown mutation outcome before sending another command.
Cancelling a request cannot undo a command that has already been dispatched,
and the application does not retransmit commands automatically. A failed
multi-command sequence retains `partial`, `applied_commands`,
`failed_command`, `failed_command_index`, and `failure_reason`; the outcome field
describes the failed command, while earlier commands remain applied. One
deadline covers the entire HTTP action, including every command in a sequence.
