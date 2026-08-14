# Architecture map

Created on 2026-05-26 from the current working tree.

Scope: runtime structure, data/control flow, module boundaries, and contracts in
`cs2-server-ops`. This map is based on code, tests, config, and active docs. It
does not infer behavior from archived migration notes unless the active code or
docs still reference that behavior.

Current verification state: PARTIAL. See `docs/verification-baseline.md`.
Docker-backed root verification is blocked in this environment, and host-side
panel unit/E2E checks are not canonical because the host Node version is outside
the panel engine range.

The working tree already contains unrelated modified and untracked files. This
map describes the code visible during this pass.

## Runtime structure

`cs2-server-ops` is split into three runtime modules plus root verification and
example deployment assets:

```text
apps/provision/bootstrap
  Generates static admin/plugin bootstrap files and env examples.

configs/examples/startup
  Provides the CS2 startup wrapper that writes secret cfg and execs cs2.sh.

apps/maintain/updater
  Host-level shell updater. Talks to SteamCMD and systemd. Does not depend on
  the web panel.

apps/operate/panel
  Node/Express operator panel. Stores users/server inventory in SQLite, sessions
  in Redis or memory, and talks to CS2 servers through RCON.

scripts/verify.sh
  Repository verification orchestrator. It is not a production runtime.
```

Active docs state that provisioning assets feed the updater/panel but do not run
as a service. The updater and panel are independent runtime surfaces. The panel
must not grow host patch orchestration; the updater must remain usable without
the panel.

## Main entry points

| Entry point | Runtime role | Starts how | Primary dependencies |
| --- | --- | --- | --- |
| `apps/operate/panel/app.ts` | Express app and process lifecycle | `npm start`, `npm run dev`, Docker `CMD`, Playwright webServer | Node 22, Express, SQLite, optional Redis, RCON, EJS/static assets |
| `apps/operate/panel/Dockerfile` | Production image build/runtime | Docker build/run or compose | Node 22 image, npm, TypeScript, esbuild, copied runtime artifacts |
| `apps/maintain/updater/update_cs2.sh` | Host updater job | root shell, cron, systemd oneshot/timer | SteamCMD, systemd, filesystem, `steam` user |
| `configs/examples/startup/server-start.sh` | CS2 runtime wrapper | container/host entrypoint | CS2 install dir, env vars, admin files, `RCON_PASSWORD` |
| `apps/provision/bootstrap/scripts/bootstrap-admins.sh` | Admin JSON generator | manual script | output directory |
| `apps/provision/bootstrap/scripts/bootstrap-plugins.sh` | Plugin manifest generator | manual script | output directory |
| `scripts/verify.sh` | Local/CI verification | manual or GitHub Actions | shellcheck, shfmt, jq, ruby, curl, Docker, Node/npm |

## Important domain primitives

- Operator user: `users.id`, `username`, bcrypt `password`, `is_admin`.
- Server inventory row: `servers.id`, `serverIP`, `serverPort`,
  `rconPassword`, `owner_id`, and last selected `last_map`,
  `last_game_type`, `last_game_mode`.
- Server access grant: `server_access(user_id, server_id)`.
- RCON connection: in-memory socket, host/port details, authentication state,
  heartbeat interval, reconnect promise, and per-server command queue.
- RCON command: an ASCII command string sent through `rcon-srcds`; raw operator
  commands are constrained by `routes/game/helpers.ts`.
- Game setup: selected game type/mode/map from `cfg/maps.json`, optional team
  names, and an exec cfg name.
- Workshop favorite: per-user/per-server persisted `workshop_id` and display
  name.
- RCON command history: per-user/per-server successful raw commands, pruned to
  50 rows.
- Updater state: local build ID, remote build ID, update state, lock directory,
  log file, and systemd service state.
- Startup secret cfg: generated `cs2-server-ops-secrets.cfg` containing RCON
  password and optional GSLT.

## Storage and filesystem interactions

### SQLite

The panel opens SQLite in `apps/operate/panel/db.ts`.

- Default production/container path: `/home/container/data/cspanel.db`.
- Local fallback when `DB_PATH` is unset and `/home/container` is not writable:
  `./data/cspanel.db`.
- Explicit `DB_PATH` failure exits the process.
- Foreign keys are enabled per connection.
- Migrations run at module import using `PRAGMA user_version`.

Schema tables:

- `servers`
- `users`
- `server_access`
- `workshop_favorites`
- `rcon_command_history`

Storage contracts:

- `server_access` is the authorization boundary for server-scoped panel actions.
- `users.username` is unique.
- `servers(serverIP, serverPort)` is unique.
- `workshop_favorites(user_id, server_id, workshop_id)` is unique.
- `rcon_command_history(user_id, server_id, command)` is unique.
- RCON passwords can be plaintext in development, but production requires
  `RCON_SECRET_KEY`.
- If `RCON_SECRET_KEY` exists, existing plaintext RCON passwords are encrypted
  during startup.

### Sessions and rate limits

- Sessions are stored in Redis when `REDIS_URL` or `REDIS_HOST` is configured.
- Production startup fails without Redis.
- Development/test can use in-memory session and rate-limit stores.
- Session cookie name and flags are configurable through `SESSION_*` env vars.

### Generated and static files

- `npm run build` generates `dist/`, `public/js/console.js`, and copied fonts
  under `public/fonts/`.
- EJS views and `public/css/panel.css` are runtime assets.
- The Docker image copies built server JS, runtime node modules, public JS/CSS
  fonts, views, and `cfg/`.
- The browser bundle is generated from `public/ts/console.ts`; do not edit
  `public/js/console.js` as source.

### CS2 runtime files

- The panel sends `exec <cfg>` over RCON. The actual cfg files must exist on the
  CS2 server in `game/csgo/cfg/`; the panel does not upload them.
- `server-start.sh` writes `game/csgo/cfg/cs2-server-ops-secrets.cfg` with mode
  `0600` before execing `cs2.sh`.
- Bootstrap scripts generate admin/plugin files in an operator-selected output
  directory.

## External APIs and third-party dependencies

Panel runtime:

- Express 5 for HTTP routing and middleware.
- `express-session` and optional `connect-redis` for sessions.
- `express-rate-limit` and optional `rate-limit-redis` for rate limiting.
- `better-sqlite3` for synchronous SQLite storage.
- `bcrypt` for password hashing and verification.
- `rcon-srcds` for RCON sockets and command execution.
- `redis` client for Redis-backed sessions/rate limits.
- `zod` for request/config schema validation.
- `ejs` for server-rendered views.
- `pino` for logging.

Build/test dependencies:

- TypeScript, esbuild, ESLint, Prettier, Playwright, `node:test`.
- Shell tooling: shellcheck, shfmt, jq, ruby.

Host/runtime dependencies:

- SteamCMD and systemd for updater.
- Docker for panel image, compose validation, and root verification fallback.
- CS2 server RCON, CounterStrikeSharp/MatchZy/plugin commands for many panel
  actions.

Public network boundary:

- RCON target hostnames/IPs are operator-provided and untrusted. Private LAN
  ranges are intentionally allowed; loopback, link-local/metadata, unspecified,
  IPv6 link-local, and unique-local resolved addresses are blocked.

## Configuration sources

Root and docs:

- `README.md`, `docs/reference/env.md`, `docs/reference/topology.md`, and
  module README/runbook files define shared module and env contracts.
- `.github/workflows/ci.yml` runs `./scripts/verify.sh` on `main` with Node 22.
- `.github/workflows/secret-scan.yml` runs Gitleaks against full history.

Panel:

- `.env.example` documents panel env vars.
- `.npmrc` enforces engine strictness.
- `.nvmrc` pins Node major 22 for local work.
- `package.json` scripts define build/test/lint/typecheck contracts.
- `cfg/maps.json` defines game types, modes, exec cfg names, map groups, and map
  choices.
- `playwright.config.ts` defines E2E state DB and test-only seed route env.

Updater:

- CLI flags: `--help`, `--version`, `--dry-run`, `--status`,
  `--config=FILE`, `-c FILE`.
- Env/config vars: `LOCKDIR`, `LOGFILE`, `CS2_DIR`, `SERVICE_NAME`,
  `STEAMCMD`, `CS2_APP_ID`, `REQUIRED_SPACE`, `MAX_ATTEMPTS`, `SLEEP_SECS`,
  `ALLOW_NONROOT`, `NO_SLEEP`, `LOG_LEVEL`, `DRY_RUN`.

Startup/provision:

- `apps/provision/bootstrap/env/server.env.example`.
- Compose env for CS2 runtime and panel examples.
- `server-start.sh` requires `RCON_PASSWORD` and accepts `CS2_*`,
  `CSS_ADMINS_FILE`, `CSS_GROUPS_FILE`, and optional `CS2_GSLT`.

## State transitions

Panel process:

```text
import app/db -> open DB -> migrate -> optional admin bootstrap
  -> construct middleware/routes/RCON singleton
  -> if main module: connect Redis -> listen
  -> SIGTERM/SIGINT -> close HTTP -> shutdown RCON -> quit Redis -> close DB
```

Session/auth:

```text
anonymous GET page -> session may get CSRF token
  -> POST /auth/login -> bcrypt success -> session regenerate -> user + CSRF
  -> authenticated API/page use
  -> POST /auth/logout -> destroy session -> clear cookie
```

Server inventory:

```text
add-server request -> validate host/port/password -> DNS guard
  -> probe RCON credentials
  -> insert/update server row + grant access
  -> connect RCON
  -> list/manage/reconnect/delete use server_access
```

RCON manager:

```text
startup loads server host/port -> connect/authenticate each
  -> heartbeat status loop
  -> route command enqueues per server
  -> invalid socket triggers reconnect
  -> timeout destroys socket and clears cached connection
```

Game setup:

```text
POST /api/setup-game -> auth + access -> validate mapsConfig choice
  -> validate cfg name -> exec cfg -> optional team names
  -> changelevel -> update last selected game state
```

Updater:

```text
load config -> validate -> acquire lock -> check disk
  -> read local buildid -> read remote buildid
  -> up-to-date: ensure service running
  -> unknown: exit non-zero without stopping service
  -> update-required: stop -> SteamCMD update -> start -> verify convergence
```

Startup wrapper:

```text
validate env -> verify CS2 binary -> link optional admin files
  -> write secret cfg -> exec cs2.sh with map/port/max players/cfg args
```

## Error-handling strategy

- Panel request validation failures usually return JSON `400` with `{ "error" }`.
- Missing auth returns `401` JSON or redirects HTML page requests to `/`.
- Server access denial returns `403`.
- Missing server rows or invalid route params commonly return `404`.
- Route-level unexpected failures are logged and return generic `500` JSON.
- Game RCON failures are mapped to `500` with "Server unreachable - RCON
  connection failed" when the message looks connection/RCON/timeout related.
- Status/players endpoints return partial observation fields and an `error`
  string instead of failing the whole request when individual RCON commands fail.
- Health returns minimal `{ ok }` unless `HEALTHCHECK_VERBOSE=true` or the
  caller is authenticated.
- Production startup fails fast for missing/weak session secret, missing Redis,
  missing RCON encryption key, weak default credentials, or explicit DB open
  failure.
- Updater failures log to stdout and best-effort log file, clean temp/lock state,
  and exit non-zero. Unknown remote update status refuses to stop the service.
- Startup wrapper prints validation errors to stderr and exits non-zero.

## Compatibility and deprecation layers

- `scripts/validate.sh` is a compatibility wrapper around `scripts/verify.sh`.
- `db.ts` migration 1 preserves pre-migration columns/backfills for older panel
  databases.
- `db.ts` upgrades plaintext RCON passwords to encrypted values when a key is
  configured.
- `utils/parseServerId.ts` uses lazy CommonJS `require` to avoid DB import timing
  issues in tests.
- `tsconfig.json` keeps CommonJS and `ignoreDeprecations` with a TODO for a
  future module-system migration.
- `app.ts` has a test-only `/api/test/servers` route gated by
  `NODE_ENV=test` and `ENABLE_E2E_TEST_ROUTES=true`.
- `update_cs2.sh` preserves warnings for removed webhook/RCON config keys:
  `NOTIFY_WEBHOOK_URL`, `NOTIFY_PLAYERS_MESSAGE`, `RCON_CLI`, `RCON_HOST`,
  `RCON_PORT`, `RCON_PASSWORD`.
- Migration docs are archived and explicitly not active runtime contracts.

## Public contracts that must not break

- Module boundary: provision assets, maintain updater, operate panel remain
  separate and independently usable.
- Node engine: panel supports Node `>=22 <23`; Docker and CI use Node 22.
- Root verifier command: `./scripts/verify.sh`.
- Panel command contracts in `package.json`, especially `npm run build`,
  `npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`, and
  `npm run validate`.
- HTTP API paths and response shapes documented in `apps/operate/panel/docs/API.md`.
- Auth contract: all endpoints except `/api/health` and `/auth/login` require
  session auth; state-changing authenticated requests require CSRF.
- Cookie/session env contract: `SESSION_SECRET`, `SESSION_COOKIE_*`,
  `TRUST_PROXY`, `SESSION_MAX_AGE_MS`.
- Storage schema and migration `user_version`.
- `server_access` authorization checks for every server-scoped action.
- RCON raw-command boundary: ASCII-only, no separators, max length, and blocked
  command verbs.
- RCON secret format: `enc:v1:<iv>:<tag>:<ciphertext>` and 32-byte
  hex/base64 `RCON_SECRET_KEY`.
- Host validation boundary: block loopback/link-local/metadata/unspecified and
  disallowed resolved addresses while allowing private LAN ranges.
- Updater config keys and CLI options listed above.
- Updater safety: do not stop the service when remote build status is unknown.
- Startup wrapper secret handling: secrets go into cfg file, not process argv.
- GitHub CI and secret-scan workflows target `main`.

## Hidden coupling and fragile boundaries

- `manage.ejs` element IDs and data attributes are tightly coupled to
  `public/ts/manage.ts` handlers and route paths.
- `public/ts/console.ts` bootstraps by checking URL paths `/servers` and
  `/manage/`.
- `public/js/console.js` must be regenerated after browser TS changes.
- `cfg/maps.json` exec names must correspond to cfg files installed on the CS2
  server, not merely files in this repo.
- `cfg/maps.json` references `oitc.cfg` and `1v1arenas.cfg`, but those files are
  absent from `apps/operate/panel/cfg/` in this tree. This can pass panel
  validation but fail at RCON/runtime unless the server has those cfgs.
- `routes/game/match.ts` sends `exec live.cfg`, while the repo has
  `cfg/server-provided/live.cfg`. The deployment/copy path to runtime
  `live.cfg` is UNCLEAR.
- `live_wingman.cfg` is documented as server-side expected cfg but has no direct
  code or `maps.json` reference found.
- `/api/add-server` updates the global `servers.rconPassword` for an existing
  `serverIP:serverPort` when another authenticated user proves the password and
  gains access.
- Status/list pages treat RCON observation as best effort; failures can produce
  offline/error UI without failing the page.
- RCON manager caches host/port but fetches passwords from DB on connect; DB
  import timing is part of the test/mocking contract.
- Updater tests use stubbed `systemctl`, `steamcmd`, and `runuser`; real host
  service behavior still needs host-level confidence.
- README says publication target is `main`; `docs/architecture.md` says `dev`.
  CI and security workflows target `main`, so branch intent is conflicting in
  docs.

## Major flows

### 1. Panel startup, health, and shutdown

- Starts: `node dist/app.js`, `tsx watch app.ts`, Docker `CMD`, or Playwright
  webServer.
- Trusted inputs: none by default. Env vars are operator-controlled and must be
  validated or treated as configuration.
- Untrusted inputs: env values, filesystem permissions, DB file contents,
  Redis availability, existing encrypted/plaintext RCON secrets.
- Validation: session secret strength in production, Redis required in
  production, RCON secret key required in production, DB open rules, SQLite
  migrations, port parsing fallback, cookie sameSite/secure normalization.
- State read: env, SQLite file, migration `user_version`, Redis config,
  static/view paths.
- State written: SQLite migrations/default admin, RCON secret upgrade,
  sessions, logs, HTTP listener, RCON sockets.
- Can fail: native SQLite load, DB open/migration, weak/missing secrets,
  missing Redis, Redis connect, port bind, runtime import errors.
- Failure surfaced: thrown startup errors, logged fatal errors, `process.exit(1)`,
  `/api/health` `503` when DB/Redis health is bad.
- Tests: `entrypoint.test.ts`, `app.test.ts` health tests, Playwright health
  test, root `panel_surface_probe`.
- Wrong-result risk: generated development `SESSION_SECRET` loses sessions on
  restart; minimal health hides DB/Redis detail; host Node mismatch can fail
  before intended production guards; root surface probe is currently blocked by
  Docker in this environment.

### 2. Authentication, session, and CSRF

- Starts: `GET /`, `POST /auth/login`, authenticated page/API access,
  `POST /auth/logout`.
- Trusted inputs: none from the client.
- Untrusted inputs: username, password, cookies, CSRF header/body token,
  `Accept` header.
- Validation: zod login schema, bcrypt comparison using dummy hash for missing
  users, session regeneration on login, timing-safe CSRF comparison,
  authenticated middleware checks.
- State read: `users` table, session store, CSRF token in session.
- State written: regenerated session, `session.user`, `session.csrfToken`,
  cleared cookie on logout, auth logs.
- Can fail: invalid credentials, bcrypt error, session regenerate/save/destroy
  error, invalid CSRF.
- Failure surfaced: `400`, `401`, `403`, `500`, redirect for HTML unauthorized
  requests, generic "Invalid credentials" on auth failure.
- Tests: `app.test.ts`, `user-management.test.ts`, Playwright login/logout and
  failed-login tests.
- Wrong-result risk: in-memory session store is unsafe for production or
  multi-instance use; login is intentionally CSRF-exempt; inline login/settings
  scripts duplicate fetch behavior outside the main TS bundle.

### 3. Server inventory and access grants

- Starts: `/add-server`, `/servers`, `/manage/:server_id`, `/api/add-server`,
  `/api/servers`, `/api/reconnect-server`, `/api/delete-server`.
- Trusted inputs: authenticated session user ID after middleware.
- Untrusted inputs: server hostname/IP, port, RCON password, `server_id` body or
  route param, DNS answers, RCON auth result.
- Validation: zod body schema, port range, host syntax, DNS resolution guard,
  RCON probe before insert/grant, positive server ID parsing, `server_access`.
- State read: `servers`, `server_access`, `mapsConfig`, RCON connection details.
- State written: `servers`, `server_access`, encrypted RCON password, RCON
  connection cache, deleted orphan server rows.
- Can fail: invalid host/port/password, DNS resolution failure, blocked resolved
  address, RCON auth failure, DB uniqueness/permission issues, reconnect
  failure.
- Failure surfaced: mostly `400`, `401`, `403`, `404`, `500` JSON; manage page
  returns `404` or `500`; hostname fetch failure on manage page is swallowed and
  displays fallback.
- Tests: `server-crud.test.ts`, `network-validation.test.ts`,
  `parse-server-id.test.ts`, `app.test.ts` CSRF/server ID tests.
- Wrong-result risk: `/api/servers` has a 2-second batch timeout and can show
  stale/offline status; manage page can render with fallback hostname after RCON
  failure; existing global server password is overwritten after a successful
  probe by another authorized add flow.

### 4. RCON connection manager and command execution

- Starts: `RconManager` singleton construction, app startup init, add/reconnect
  server, any route calling `executeCommand`, heartbeat intervals, shutdown.
- Trusted inputs: server rows after DB access checks. Command strings are only
  trusted if the caller already validated them.
- Untrusted inputs: stored server hostnames/passwords, DNS answers, RCON socket
  behavior, RCON command output.
- Validation: resolved host guard before connecting, decrypt password format,
  connection/authentication checks, per-command timeout.
- State read: `servers` table password by server ID, in-memory host/port cache,
  RCON socket state.
- State written: in-memory `rcons`, `details`, `servers`, `reconnecting`,
  `commandChains`, `pendingSockets`, heartbeat timers.
- Can fail: auth timeout, bad password/key, blocked DNS resolution, socket
  timeout, non-writable connection, reconnect failure, dependency behavior.
- Failure surfaced: logs plus thrown errors to routes; routes map many failures
  to generic unreachable/internal errors; shutdown ignores some cleanup errors.
- Tests: `rcon-manager.test.ts`, route tests with mocked RCON, status/player
  parser tests.
- Wrong-result risk: `rcon-srcds` uses insecure random packet IDs per source
  comment; heartbeat/details state can lag real server state; no test exercises
  real RCON packet behavior; route code, not RCON manager, owns raw command
  security.

### 5. Game setup, MatchZy, plugin, and control commands

- Starts: manage page buttons/forms and API calls under `/api/setup-game`,
  match controls, practice controls, plugin toggles, backups, players,
  workshop, raw RCON, and admin chat.
- Trusted inputs: authenticated session and authorized server ID.
- Untrusted inputs: API body fields, selected map/type/mode, team names, cfg
  names from config, workshop IDs, player IDs, raw RCON command, RCON output.
- Validation: `requireAuthorizedServerId`, zod schemas, numeric allowlists,
  ASCII-only raw RCON policy, blocked command verbs, separator rejection,
  `sanitizeString`, `sanitizeCfgName`, `sanitizeBackupFileName`, map membership
  from `maps.json`.
- State read: `server_access`, `mapsConfig`, RCON connection, session user.
- State written: remote CS2 server state through RCON, `servers.last_*` after
  setup success, `rcon_command_history` after successful raw RCON command.
- Can fail: missing auth/access, invalid body, cfg/plugin absent on server,
  RCON timeout, partial multi-command sequence, parser mismatch for backup file,
  DB update failure.
- Failure surfaced: `400` for validation, `401/403/404` for auth/access, `500`
  JSON for RCON/internal errors, toast/error UI in browser.
- Tests: `game-helpers.test.ts`, `game-routes.test.ts`, broad `app.test.ts`
  route coverage, Playwright manage smoke.
- Wrong-result risk: multi-command `Promise.all` routes can partially apply
  settings; RCON success response does not prove game/plugin accepted the
  command; missing cfg/plugin files produce runtime failures outside panel
  validation; accepted `maps.json` entries can reference cfg files absent from
  this repo.

### 6. Status, players, autocomplete, favorites, and RCON history

- Starts: `/api/status/:server_id`, `/api/players/:server_id`,
  `/api/rcon/autocomplete/:server_id`, `/api/workshop-favorites/:server_id`,
  `/api/rcon/history/:server_id`, and manage/server page polling.
- Trusted inputs: authenticated session plus `server_access`.
- Untrusted inputs: route params, query `q/limit/refresh`, RCON text output,
  favorite names/IDs.
- Validation: positive ID parsing, access check, query limit clamp, zod favorite
  schemas, RCON autocomplete suggestions filtered through raw RCON policy.
- State read: `server_access`, RCON output, autocomplete cache,
  `workshop_favorites`, `rcon_command_history`.
- State written: in-memory autocomplete cache, `workshop_favorites`, command
  history delete/upsert/prune.
- Can fail: RCON command failures, parser mismatch, DB constraint conflict,
  invalid favorite ID/body.
- Failure surfaced: status/players return partial payloads with `error` fields;
  autocomplete returns `500` on unexpected failure; favorites/history return
  `400/404/409` or JSON success.
- Tests: `status.test.ts`, `game-routes.test.ts`, `rcon-parsers.test.ts`,
  `rcon-response.test.ts`, Playwright manage-state test.
- Wrong-result risk: `connected`/`authenticated` are set true when any status
  observation succeeds; parsers are regex-based and fixture-sensitive;
  autocomplete cache is per-process and can be stale for 10 minutes.

### 7. User management

- Starts: `/settings`, `/admin/users`, `/api/users/change-password`,
  `/api/users/add`, `/api/users/delete`, `/api/users/list`.
- Trusted inputs: session user ID and `is_admin` after middleware.
- Untrusted inputs: passwords, usernames, `serverId`, `userId`.
- Validation: zod schemas, bcrypt current-password comparison, min password
  length, duplicate username check, admin-only middleware, initial server access
  must be accessible to the admin, self-delete is rejected.
- State read: `users`, `server_access`, accessible servers for admin page.
- State written: user password hash, new user rows, optional server access
  grant, deleted users and cascading grants/favorites/history.
- Can fail: invalid body, wrong password, bcrypt hash/compare error, duplicate
  username, non-admin access, DB failure.
- Failure surfaced: `400`, `401`, `403`, `404`, `409`, `500`; inline page
  scripts display status text.
- Tests: `user-management.test.ts`, Playwright login/dashboard visibility.
- Wrong-result risk: only first/bootstrap user is admin by default; API creates
  non-admin users only, with no role-promotion route in current code.

### 8. Browser UI flow

- Starts: browser loads EJS page, static CSS, inline scripts, and/or generated
  `public/js/console.js`.
- Trusted inputs: none from DOM/client; server remains authoritative.
- Untrusted inputs: DOM dataset values, form inputs, fetch responses, RCON text
  rendered into UI, stale generated JS.
- Validation: client does light checks and route selection; server performs
  authoritative validation.
- State read: `#main[data-server-id]`, meta CSRF token, many element IDs/data
  attributes, route JSON responses.
- State written: DOM status text/cards/lists/buttons, local module server ID,
  toast container, modal elements.
- Can fail: missing DOM IDs, stale generated bundle, route mismatch, session
  expiry, fetch error, malformed JSON.
- Failure surfaced: toasts, status text, redirect to login on `401`, some silent
  best-effort catches for status/player counts.
- Tests: Playwright E2E, `scripts.test.ts` template checks, route integration
  tests.
- Wrong-result risk: EJS/TS ID coupling is broad; generated bundle can be stale;
  some UI state is optimistic or best effort until refreshed from RCON status.

### 9. Updater CLI/systemd job

- Starts: manual root command, cron, or systemd unit/timer invoking
  `update_cs2.sh`.
- Trusted inputs: none from config/env until validated.
- Untrusted inputs: config file contents, env vars, CLI args, filesystem paths,
  lock directory contents, SteamCMD output, appmanifest contents, systemd state.
- Validation: CLI parsing, config whitelist, removed-key warning, path checks,
  numeric limits, service unit-name pattern, root/steam user requirements,
  command existence, disk-space check, lock ownership/metadata.
- State read: config/env, CS2 appmanifest, remote Steam app info, disk free
  space, process table, systemd service state.
- State written: log file, lock dir/pid/meta, temp SteamCMD output files,
  updated CS2 install, systemd stop/start attempts.
- Can fail: invalid config, lock conflict, insufficient disk, missing SteamCMD,
  unknown remote build status, stop/start failure, update failure, post-update
  build mismatch.
- Failure surfaced: log lines, stdout/stderr, non-zero exit. Unknown remote
  status exits non-zero without stopping service.
- Tests: `apps/maintain/updater/tests/run.sh` via `make ci`; current baseline
  saw `OK (49 tests passed)`.
- Wrong-result risk: parser assumptions around SteamCMD/appmanifest output;
  tests use stubs, so real host/systemd/SteamCMD behavior still needs runtime
  validation after updater changes.

### 10. Provision bootstrap and CS2 startup wrapper

- Starts: manual bootstrap scripts and compose/entrypoint execution of
  `server-start.sh`.
- Trusted inputs: none from env or file paths until checked.
- Untrusted inputs: output dir, `RCON_PASSWORD`, optional `CS2_GSLT`, map/port,
  max players, cfg filename, admin/group file paths.
- Validation: `RCON_PASSWORD` required, port/max players integer ranges,
  CS2 binary executable, optional admin/group files exist.
- State read: env vars, optional admin/group files, CS2 install dir.
- State written: admin/group JSON, plugin env/text files, symlinks into
  CounterStrikeSharp config paths, secret cfg file with mode `0600`.
- Can fail: missing RCON password, invalid port/max players, missing CS2 binary,
  missing admin/group file, write permission errors.
- Failure surfaced: stderr message and non-zero exit before `exec`; root
  verifier has a `startup_secret_probe`.
- Tests: root `./scripts/verify.sh` provision smoke and startup secret probe,
  but root verification is currently blocked by Docker before it reaches this
  stage in this environment.
- Wrong-result risk: bootstrap files contain placeholders; scripts do not
  install plugins; startup wrapper hardcodes `+game_type 0` and `+game_mode 1`
  regardless of later panel mode selections.

### 11. Repository verification and CI

- Starts: `./scripts/verify.sh` locally or GitHub Actions CI on `main`.
- Trusted inputs: none from environment until commands are discovered/required.
- Untrusted inputs: host Node version, Docker availability, package state,
  generated assets, tool versions.
- Validation: required commands, shared shell/config checks, JSON/YAML parsing,
  panel lint/type/test/E2E/build, Docker validation, panel health probe,
  updater CI, provision smoke.
- State read: repo files, node_modules, Docker images/containers, temp dirs.
- State written: temp dirs, panel generated build outputs, Docker image
  `cs2-server-ops-operate-panel:local`, temporary containers.
- Can fail: missing tools, host Node mismatch, Docker daemon unavailable,
  package install/test failures, health probe failure.
- Failure surfaced: shell exit code and printed command output.
- Tests: the verifier is itself the contract; `docs/verification-baseline.md`
  records current run results.
- Wrong-result risk: if host Node is not 22, verifier depends on Docker fallback;
  if Docker is unavailable, repository-wide verification stops before later
  modules.

## Areas not fully understood

- Real CS2/RCON behavior was not exercised. RCON conclusions are source- and
  test-based only.
- Actual plugin availability and MatchZy/CounterStrikeSharp command semantics
  are outside this repo.
- CFG deployment/copy workflow is not fully proven, especially
  `server-provided/live.cfg`, `live_wingman.cfg`, `oitc.cfg`, and
  `1v1arenas.cfg`.
- Docker image/runtime behavior is not fully verified in this environment
  because Docker daemon access is unavailable.
- Browser E2E currently fails before assertions because the panel webServer
  exits on host Node/native SQLite mismatch.
- Branch publication intent conflicts between README/CI/security workflows
  (`main`) and `docs/architecture.md` (`dev`).
- Current untracked files that look active (`routes/operator.ts`,
  `utils/rconHistory.ts`, `utils/rconParsers.ts`, and related tests) should be
  rechecked after the working tree is cleaned or committed.
