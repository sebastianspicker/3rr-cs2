# API Reference

All endpoints except `/api/health` require authentication via session cookie.
State-changing requests (POST/PUT/DELETE) require a CSRF token in the `X-CSRF-Token` header.

## Authentication Flow

1. `GET /` — renders login page, sets session cookie and CSRF token
2. `POST /auth/login` — authenticate with username/password and the login page CSRF token
3. Use session cookie + CSRF token for all subsequent requests
4. `POST /auth/logout` — destroy session

Protected requests revalidate the session user against SQLite. Deleted users are
rejected, and admin-only routes use the current stored admin flag rather than a
stale session copy.

## Auth

| Method | Path           | Auth | CSRF | Rate Limit |
| ------ | -------------- | ---- | ---- | ---------- |
| POST   | `/auth/login`  | No   | Yes  | 20/15min   |
| POST   | `/auth/logout` | Yes  | Yes  | —          |

## Server Management

| Method | Path                    | Auth | CSRF | Description                              |
| ------ | ----------------------- | ---- | ---- | ---------------------------------------- |
| GET    | `/servers`              | Yes  | —    | Servers list page                        |
| GET    | `/manage/:server_id`    | Yes  | —    | Server management page                   |
| GET    | `/add-server`           | Yes  | —    | Add server form                          |
| GET    | `/api/servers`          | Yes  | —    | JSON list of servers with RCON status    |
| POST   | `/api/add-server`       | Yes  | Yes  | Add new server (ip, port, rcon_password) |
| POST   | `/api/delete-server`    | Yes  | Yes  | Delete server by server_id               |
| POST   | `/api/reconnect-server` | Yes  | Yes  | Reconnect RCON for server_id             |

`/api/add-server` first probes the supplied RCON credentials. If credentials
probe successfully but the panel cannot establish an authenticated managed RCON
connection after saving the server, it returns `502` with an error instead of a
success response. `/api/reconnect-server` also returns `502` when no
authenticated RCON connection exists after the reconnect attempt.
If a stored encrypted RCON credential cannot be decrypted, reconnect and command
paths report a local credential storage error with `credential_error` instead of
claiming the remote server rejected authentication.

`/api/servers` treats `status` as the canonical RCON status field:
`connected`, `disconnected`, `unknown`, or `error`. Each row also includes
`observed_at`, `status_source`, `timed_out`, and `error` so callers can separate
unobserved, slow, and failed hostname probes from confirmed disconnection. The
legacy `connected` and `authenticated` booleans remain for compatibility and
must not be used alone to distinguish unknown from disconnected.

`/api/delete-server` removes the caller's access first. If no users retain
access, it deletes the server row and returns `server_deleted: true` with
`rcon_cleanup: "completed"`. Shared-server access removal returns
`server_deleted: false` and `rcon_cleanup: "not_needed"`. If the row is deleted
but RCON cleanup fails, the response is non-2xx and includes
`rcon_cleanup: "failed"`.

## Game Setup

| Method | Path                                          | Auth | CSRF | Description                               |
| ------ | --------------------------------------------- | ---- | ---- | ----------------------------------------- |
| POST   | `/api/setup-game`                             | Yes  | Yes  | Deploy match (map, teams, game type/mode) |
| GET    | `/api/game-types/:type/game-modes`            | Yes  | —    | List game modes for type                  |
| GET    | `/api/game-types/:type/game-modes/:mode/maps` | Yes  | —    | List maps for mode                        |

`POST /api/setup-game` records the last requested setup selection for the manage
page. It does not claim the live server map or mode was observed. Success
includes `setup_state: "requested"`, `observed: false`, and `requested_setup`.

## Match Control

| Method | Path                  | Auth | CSRF | Description       |
| ------ | --------------------- | ---- | ---- | ----------------- |
| POST   | `/api/restart`        | Yes  | Yes  | Restart game      |
| POST   | `/api/pause`          | Yes  | Yes  | Pause match       |
| POST   | `/api/unpause`        | Yes  | Yes  | Unpause match     |
| POST   | `/api/start-warmup`   | Yes  | Yes  | Start warmup      |
| POST   | `/api/start-knife`    | Yes  | Yes  | Start knife round |
| POST   | `/api/swap-team`      | Yes  | Yes  | Swap teams        |
| POST   | `/api/scramble-teams` | Yes  | Yes  | Scramble teams    |

## Bot Control

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

## Game Settings

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

Multi-command controls execute their RCON commands in order. If a later command
fails after earlier commands were sent, the response is `500` with
`partial: true`, `applied_commands`, `failed_command`, and
`failed_command_index` so callers know the server may be partially updated.
Numeric preset fields such as `value` and `ot_rounds` accept JSON integers or
string integers only; malformed strings like `5abc` or `5.5` are rejected with
`400`.

## Practice Controls

| Method | Path                        | Auth | CSRF | Description                               |
| ------ | --------------------------- | ---- | ---- | ----------------------------------------- |
| POST   | `/api/noclip`               | Yes  | Yes  | Toggle noclip                             |
| POST   | `/api/rethrow-grenade`      | Yes  | Yes  | Rethrow last grenade                      |
| POST   | `/api/random-rounds-toggle` | Yes  | Yes  | Toggle random rounds mode (cfg-based 0/1) |
| POST   | `/api/rtd-toggle`           | Yes  | Yes  | Toggle Roll the Dice plugin (cfg-based)   |
| POST   | `/api/rtd-force-roll`       | Yes  | Yes  | Force a dice roll for all players         |

## Map & Workshop

| Method | Path                       | Auth | CSRF | Description                                      |
| ------ | -------------------------- | ---- | ---- | ------------------------------------------------ |
| POST   | `/api/workshop-map`        | Yes  | Yes  | Load a Steam Workshop map by ID (5–20 digit id)  |
| POST   | `/api/workshop-collection` | Yes  | Yes  | Load a Workshop collection by ID (5–20 digit id) |
| POST   | `/api/set-mapgroup`        | Yes  | Yes  | Set active map group by id (from maps.json)      |

## Player Management

| Method | Path                 | Auth | CSRF | Body field | Description                                |
| ------ | -------------------- | ---- | ---- | ---------- | ------------------------------------------ |
| POST   | `/api/player-kick`   | Yes  | Yes  | `userid`   | Kick player by numeric userid (1–5 digits) |
| POST   | `/api/player-mute`   | Yes  | Yes  | `steamid`  | Mute player by SteamID64 (17 digits)       |
| POST   | `/api/player-unmute` | Yes  | Yes  | `steamid`  | Unmute player by SteamID64                 |

## MatchZy

| Method | Path                           | Auth | CSRF | Body field         | Description                                     |
| ------ | ------------------------------ | ---- | ---- | ------------------ | ----------------------------------------------- |
| POST   | `/api/matchzy-match`           | Yes  | Yes  | —                  | Load live.cfg and start MatchZy match           |
| POST   | `/api/matchzy-practice`        | Yes  | Yes  | —                  | Enable MatchZy practice mode                    |
| POST   | `/api/matchzy-exitprac`        | Yes  | Yes  | —                  | Exit practice mode, load warmup.cfg             |
| POST   | `/api/matchzy-playout`         | Yes  | Yes  | —                  | Enable playout (finish remaining rounds)        |
| POST   | `/api/matchzy-abort`           | Yes  | Yes  | —                  | Abort current match, load warmup.cfg            |
| POST   | `/api/matchzy-readyrequired`   | Yes  | Yes  | `value` (0–10)     | Set number of ready players required (0 = none) |
| POST   | `/api/matchzy-coach`           | Yes  | Yes  | `side` (`ct`\|`t`) | Assign coach slot for the given side            |
| POST   | `/api/matchzy-load-match-file` | Yes  | Yes  | `filename`         | Load match config from `.json` file on server   |

## Backups

| Method | Path                         | Auth | CSRF | Description                   |
| ------ | ---------------------------- | ---- | ---- | ----------------------------- |
| POST   | `/api/list-backups`          | Yes  | Yes  | List available round backups  |
| POST   | `/api/restore-round`         | Yes  | Yes  | Restore specific round (1-99) |
| POST   | `/api/restore-latest-backup` | Yes  | Yes  | Restore latest backup         |

Backup endpoints include `backup_state` when the server response can be
classified. Empty, malformed, or unsafe latest-backup responses return non-2xx
with `backup_state: "unknown"`, `"malformed_response"`, or
`"unsafe_filename"` instead of claiming no backup exists.

## RCON & Chat

| Method | Path                           | Auth | CSRF | Description                        |
| ------ | ------------------------------ | ---- | ---- | ---------------------------------- |
| POST   | `/api/rcon`                    | Yes  | Yes  | Execute RCON command (allowlisted) |
| POST   | `/api/say-admin`               | Yes  | Yes  | Broadcast message to server        |
| GET    | `/api/rcon/history/:server_id` | Yes  | —    | List sent RCON commands            |
| DELETE | `/api/rcon/history/:server_id` | Yes  | Yes  | Clear sent RCON command history    |

`/api/rcon` separates command dispatch from command-history persistence. A
successful dispatch returns `command_sent: true`; `history_recorded: false` and
`partial: true` mean the RCON command was sent but the post-command history write
failed.

RCON history is sent-command history, not proof that commands changed server
state. History list failures return `history_state: "unavailable"` instead of
being treated as an empty history.

## Status & Health

| Method | Path                     | Auth | CSRF | Rate Limit | Description                                                                                                                                                                                  |
| ------ | ------------------------ | ---- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/status/:server_id` | Yes  | —    | 60/min     | Live server status                                                                                                                                                                           |
| GET    | `/api/health`            | No   | —    | —          | Health check for load balancers; minimal payload includes liveness `ok` and readiness `ready`; includes DB/Redis/RCON details when `HEALTHCHECK_VERBOSE=true` or the caller is authenticated |

`/api/status/:server_id` reports RCON connection/authentication separately from
status data completeness. A response with some successful RCON observations and
some failed observations has `partial: true`, `complete: false`, null unknown
counts, and an `error` string naming unavailable observations. Unknown player
counts remain `null`; clients must not coerce them to zero.

## User Management

| Method | Path                         | Auth | Admin | CSRF | Description                                         |
| ------ | ---------------------------- | ---- | ----- | ---- | --------------------------------------------------- |
| GET    | `/settings`                  | Yes  | No    | —    | Change-password page                                |
| GET    | `/admin/users`               | Yes  | Yes   | —    | User management page                                |
| GET    | `/api/users/list`            | Yes  | Yes   | —    | JSON list of all users (id, username, is_admin)     |
| POST   | `/api/users/change-password` | Yes  | No    | Yes  | Change own password (currentPassword, newPassword)  |
| POST   | `/api/users/add`             | Yes  | Yes   | Yes  | Create user (username, password, optional serverId) |
| POST   | `/api/users/delete`          | Yes  | Yes   | Yes  | Delete user by id — cannot delete own account       |

## Common Response Formats

**Success:** `{ "message": "..." }` with HTTP 200/201

**Error:** `{ "error": "..." }` with HTTP 400/401/403/404/500/502

**Auth routes:** use the same `{ "message": "..." }` success shape as other success responses.

## Request Body Format

All POST requests accept JSON (`Content-Type: application/json`).

Common fields:

- `server_id` (string/number) — required for all game/server operations
- `value` (number) — for toggle and preset routes (0/1 or allowlisted values)
