# Fail-Loud Audit

Audit date: 2026-05-26

Scope: current working tree source and tests for the operate panel, updater,
provision bootstrap scripts, root verification scripts, and runtime examples.
Generated output, screenshots, package lock internals, and archived docs were not
treated as source of runtime truth.

Principle used: if the code cannot prove the operation worked, it must expose
that uncertainty instead of reporting a clean success.

## Findings

### FLA-001

- Severity: P1
- Category: false success state
- File: `apps/operate/panel/modules/rcon.ts`; `apps/operate/panel/app.ts`
- Symbol / function / flow: `RconManager.init()` and startup readiness
- Evidence: `RconManager.init()` logs the number of saved servers, starts
  connection attempts with `Promise.allSettled(...)`, ignores each settlement,
  and catches any outer error without rethrowing (`modules/rcon.ts:140-164`).
  The manager exposes `readyPromise = this.init()` (`modules/rcon.ts:90`).
  The app starts listening without checking any RCON initialization result
  (`app.ts:379-383`).
- What success is claimed: the panel can start and later report itself healthy.
- What is actually proven: only that app startup reached `listen()`. RCON
  startup may have failed for every saved server.
- Missing failure/uncertainty signal: no initialized/failed/skipped counts and
  no durable startup status that routes or health checks can expose.
- Runtime or user impact: operators may see a running panel even though all
  saved RCON connections failed during initialization.
- Suggested remediation: make RCON initialization return an explicit summary
  with `total`, `connected`, `failed`, and `errors`; store it on the manager for
  health/status routes.
- Test needed: seed multiple servers, force one or all initial RCON connections
  to fail, and assert that the manager exposes the failure counts.
- Verification needed: `cd apps/operate/panel && npm test -- --test-name-pattern rcon`
  after adding targeted coverage, then `npm run typecheck`.
- Confidence: high

### FLA-002

- Severity: P1
- Category: false readiness
- File: `apps/operate/panel/app.ts`; `apps/operate/panel/Dockerfile`;
  `apps/operate/panel/test/e2e/panel.spec.ts`
- Symbol / function / flow: `/api/health` and container health check
- Evidence: `/api/health` reports `ok` from SQLite and Redis only
  (`app.ts:321-345`). The Docker health check gates container health on that
  endpoint only (`Dockerfile:48-49`). The E2E test calls this "ready" and expects
  `{ ok: true }` (`test/e2e/panel.spec.ts:90-96`).
- What success is claimed: the built panel is ready/healthy.
- What is actually proven: database query works and Redis is either ready or not
  configured.
- Missing failure/uncertainty signal: RCON manager readiness, RCON initialization
  failure counts, and degraded runtime-control status are absent.
- Runtime or user impact: orchestration can mark the panel healthy while the
  main control boundary is degraded.
- Suggested remediation: keep liveness minimal if desired, but add a readiness
  payload or verbose health fields that distinguish `http`, `db`, `redis`, and
  `rcon_init`.
- Test needed: force RCON initialization failures and assert verbose health shows
  degraded readiness without pretending RCON is ready.
- Verification needed: `cd apps/operate/panel && npm test && npm run test:e2e`
  after the health contract is updated.
- Confidence: high

### FLA-003

- Severity: P1
- Category: optimistic UI/runtime status
- File: `apps/operate/panel/routes/server.ts`;
  `apps/operate/panel/public/ts/servers.ts`
- Symbol / function / flow: server list status aggregation
- Evidence: `/api/servers` initializes every row as `hostname: '-'`,
  `connected: false`, and `authenticated: false` (`routes/server.ts:272-280`),
  only probes rows where `rcon.hasConnection(sid)` is true
  (`routes/server.ts:281-293`), and races all probes against a 2 second timeout
  without returning timeout or per-server uncertainty (`routes/server.ts:295-300`).
  The browser turns those booleans into `Connected` or `Disconnected`
  (`public/ts/servers.ts:71-95`).
- What success is claimed: the server is disconnected when the badge says
  `Disconnected`.
- What is actually proven: either no cached RCON connection existed, a hostname
  probe failed, or the probe set did not finish before timeout.
- Missing failure/uncertainty signal: no `observed_at`, `status_source`,
  `timed_out`, `error`, or `unknown` state.
- Runtime or user impact: an unobserved or slow server can be displayed as
  definitively disconnected, causing unnecessary reconnects or wrong operator
  decisions.
- Suggested remediation: return explicit states such as `connected`,
  `disconnected`, `unknown`, and `partial`, with per-server error/timeout fields.
- Test needed: simulate a hung hostname probe and assert the API/UI report
  unknown or timed out, not disconnected.
- Verification needed: `cd apps/operate/panel && npm test -- --test-name-pattern servers`
  plus the relevant Playwright dashboard case.
- Confidence: high

### FLA-004

- Severity: P2
- Category: swallowed failure
- File: `apps/operate/panel/routes/server.ts`;
  `apps/operate/panel/views/manage.ejs`
- Symbol / function / flow: initial manage page hostname/status render
- Evidence: the manage route catches hostname lookup failure and intentionally
  does nothing (`routes/server.ts:130-136`), then renders the page with fallback
  hostname and cached connection booleans (`routes/server.ts:164-176`). The view
  renders `Connected`/`Disconnected` badges from those booleans
  (`views/manage.ejs:20-24`, `views/manage.ejs:207-211`).
- What success is claimed: the header/badge reflect the server connection state.
- What is actually proven: only cached manager state and no successful hostname
  observation when the catch path runs.
- Missing failure/uncertainty signal: no page-local warning that the initial
  hostname observation failed.
- Runtime or user impact: the first viewport can hide the reason hostname is a
  placeholder until the client-side live status refresh runs.
- Suggested remediation: pass an initial `hostname_error` or `status_observed`
  flag into the template and render an explicit "status not observed yet" state.
- Test needed: force `hostname` RCON failure on `GET /manage/:server_id` and
  assert the rendered page exposes the uncertainty.
- Verification needed: `cd apps/operate/panel && npm test -- --test-name-pattern manage`
  plus a Playwright manage-page assertion.
- Confidence: high

### FLA-005

- Severity: P1
- Category: false operation success
- File: `apps/operate/panel/routes/game/helpers.ts`;
  `apps/operate/panel/routes/game/match.ts`;
  `apps/operate/panel/routes/game/controls.ts`
- Symbol / function / flow: RCON-backed game control success messages
- Evidence: helper routes return messages such as `<convar> set to <value>` or a
  caller-supplied success message after `rcon.executeCommand` resolves
  (`helpers.ts:201-202`, `helpers.ts:219-220`, `helpers.ts:243-244`,
  `helpers.ts:267-268`, `helpers.ts:292-293`). Callers use definitive messages
  such as `Game restarted`, `Warmup started!`, `Player ... kicked`, and `Message
  sent!` (`match.ts:238`, `match.ts:259`, `match.ts:461`, `match.ts:642`;
  `controls.ts:66`, `controls.ts:164`, `controls.ts:266`, `controls.ts:285`).
- What success is claimed: the game state changed as described.
- What is actually proven: the RCON client call resolved. The code does not
  verify the cvar, player action, plugin action, or map state afterward.
- Missing failure/uncertainty signal: no `verification: unverified`, command
  output classification, or follow-up readback for commands that can be checked.
- Runtime or user impact: operators may believe a match was paused, restarted,
  muted, or configured when the server merely accepted or echoed a command.
- Suggested remediation: use "Command sent" wording for unverified actions and
  add readback verification for high-value controls where CS2/RCON exposes a
  reliable state query.
- Test needed: simulate an RCON response that represents an unknown/failed
  command and assert the API does not return a definitive success message.
- Verification needed: targeted game-route tests, then `npm test`.
- Confidence: medium

### FLA-006

- Severity: P1
- Category: state updated without runtime proof
- File: `apps/operate/panel/routes/game/match.ts`;
  `apps/operate/panel/test/game-routes.test.ts`
- Symbol / function / flow: `POST /api/setup-game`
- Evidence: setup executes cfg/team/map commands (`match.ts:169-174`), then
  stores `last_map`, `last_game_type`, and `last_game_mode` (`match.ts:176`) and
  returns `Game Created!` (`match.ts:178`). The test success path asserts only
  HTTP 200 and that message before a separate missing-cfg case
  (`test/game-routes.test.ts:287-329`).
- What success is claimed: a game was created and the saved selection reflects
  current runtime state.
- What is actually proven: all command promises resolved and the desired
  selection was written to SQLite.
- Missing failure/uncertainty signal: no distinction between desired state and
  observed game state after `changelevel`.
- Runtime or user impact: the manage page may later preselect a map/mode as if
  it was applied, even if the server ignored or failed the command after RCON
  accepted it.
- Suggested remediation: store the fields as last requested, or verify current
  map/rules before labeling them as applied.
- Test needed: simulate command output that indicates `changelevel` did not
  apply and assert the response/status remains uncertain.
- Verification needed: targeted `setup-game` route tests and a manage-page E2E
  saved-selection check.
- Confidence: high

### FLA-007

- Severity: P1
- Category: hidden uncertainty
- File: `apps/operate/panel/routes/game/match.ts`;
  `apps/operate/panel/test/game-routes.test.ts`
- Symbol / function / flow: `POST /api/restore-latest-backup`
- Evidence: the route reads `mp_backup_round_file_last`, sanitizes the parsed
  value, and returns `No latest backup found!` when parsing/sanitization yields
  no filename (`match.ts:319-327`). The tests explicitly expect malformed and
  unsafe output to return 200 with `No latest backup found!`
  (`test/game-routes.test.ts:246-262`).
- What success is claimed: there is no latest backup to restore.
- What is actually proven: the response did not parse into a safe `.txt`
  filename.
- Missing failure/uncertainty signal: no `backup_state: unknown` or malformed
  output error.
- Runtime or user impact: a changed CS2/MatchZy output format can hide an
  available backup and make recovery look unavailable.
- Suggested remediation: return a non-2xx or explicit unknown state for
  unparseable non-empty output; reserve `No latest backup found` for a known
  empty/none response.
- Test needed: update malformed-output cases to expect uncertainty rather than
  success.
- Verification needed: `cd apps/operate/panel && npm test -- --test-name-pattern backup`
  after changing behavior.
- Confidence: high

### FLA-008

- Severity: P2
- Category: ambiguous success
- File: `apps/operate/panel/routes/game/match.ts`
- Symbol / function / flow: `POST /api/list-backups`
- Evidence: the route returns `text || 'No backups found'` after the RCON command
  resolves (`match.ts:282-283`).
- What success is claimed: no backups exist when the response is empty.
- What is actually proven: the RCON command returned an empty string.
- Missing failure/uncertainty signal: no distinction between empty list, command
  unsupported, plugin issue, or parser uncertainty.
- Runtime or user impact: backup availability can be misreported during recovery.
- Suggested remediation: preserve the raw empty response as an unknown or require
  a recognizable "no backups" marker before saying none exist.
- Test needed: simulate empty, malformed, and explicit no-backup responses.
- Verification needed: targeted backup route tests.
- Confidence: medium

### FLA-009

- Severity: P1
- Category: silent partial failure
- File: `apps/operate/panel/routes/game/match.ts`;
  `apps/operate/panel/utils/rconHistory.ts`;
  `apps/operate/panel/routes/game/helpers.ts`
- Symbol / function / flow: `POST /api/rcon` command plus history write
- Evidence: the route sends the RCON command, then records history, then returns
  success (`match.ts:612-621`). `recordRconCommand` writes history inside a
  SQLite transaction (`utils/rconHistory.ts:49-57`). Any exception from history
  write is caught by the route's generic catch (`match.ts:622-624`), which does
  not know the RCON side effect already happened (`helpers.ts:131-135`).
- What success is claimed: on 500, the user sees command failure.
- What is actually proven: the command may already have been sent before the
  history failure.
- Missing failure/uncertainty signal: no partial-success response such as
  `command_sent: true, history_recorded: false`.
- Runtime or user impact: operators may retry a command that already ran.
- Suggested remediation: isolate history recording errors from command execution
  and return explicit partial success when post-command bookkeeping fails.
- Test needed: mock `recordRconCommand`/SQLite to fail after a successful RCON
  command and assert the API says the command was sent but history failed.
- Verification needed: targeted RCON route tests, then `npm test`.
- Confidence: high

### FLA-010

- Severity: P2
- Category: false success history
- File: `apps/operate/panel/routes/game/match.ts`;
  `apps/operate/panel/public/ts/manage.ts`;
  `apps/operate/panel/test/game-routes.test.ts`
- Symbol / function / flow: RCON command history semantics
- Evidence: history is recorded for any `/api/rcon` command whose
  `executeCommand` promise resolves (`match.ts:612-621`). The UI empty state says
  `No successful commands yet` (`public/ts/manage.ts:667-674`) and the test name
  calls the history "successful commands only" (`test/game-routes.test.ts:840`).
- What success is claimed: history entries are successful commands.
- What is actually proven: the RCON client returned a resolved response for the
  command.
- Missing failure/uncertainty signal: no status for "sent", "server rejected",
  "unknown command", or "verified".
- Runtime or user impact: operators can reuse commands from a history that
  overstates server-side success.
- Suggested remediation: rename the concept to "sent commands" unless response
  parsing can prove success.
- Test needed: simulate a resolved RCON response containing an error-like server
  message and assert history/status wording stays non-definitive.
- Verification needed: RCON route/history tests and one manage-page UI assertion.
- Confidence: medium

### FLA-011

- Severity: P2
- Category: swallowed UI failure
- File: `apps/operate/panel/public/ts/manage.ts`
- Symbol / function / flow: `loadHistory()`
- Evidence: `loadHistory()` catches any failure from `/api/rcon/history` and
  renders an empty history (`public/ts/manage.ts:703-709`). The empty renderer
  says `No successful commands yet` (`public/ts/manage.ts:667-674`).
- What success is claimed: no history exists.
- What is actually proven: the history request failed or returned an empty list.
- Missing failure/uncertainty signal: no visible "history unavailable" error.
- Runtime or user impact: a broken history endpoint or database failure looks
  like a clean empty history.
- Suggested remediation: render a distinct history error state on fetch failure.
- Test needed: route `/api/rcon/history` to a 500 in Playwright and assert the UI
  shows history unavailable instead of an empty state.
- Verification needed: targeted Playwright manage-page test.
- Confidence: high

### FLA-012

- Severity: P2
- Category: swallowed UI failure
- File: `apps/operate/panel/public/ts/servers.ts`
- Symbol / function / flow: background player-count fetch on server cards
- Evidence: online server cards initialize player count as `-/ -` equivalent
  unknown (`public/ts/servers.ts:109-113`), fetch `/api/status/:id` in the
  background (`public/ts/servers.ts:148-168`), and silently ignore failures
  (`public/ts/servers.ts:169`).
- What success is claimed: the card stays otherwise healthy/connected with only
  an unknown player count.
- What is actually proven: the player-count observation failed.
- Missing failure/uncertainty signal: no stale/error indicator on the card.
- Runtime or user impact: a degraded status endpoint can be invisible on the
  primary dashboard.
- Suggested remediation: show a compact "status unavailable" marker when the
  secondary status fetch fails.
- Test needed: Playwright route `/api/status/:id` to 500 while `/api/servers`
  returns connected and assert the card exposes the failure.
- Verification needed: targeted Playwright dashboard test.
- Confidence: high

### FLA-013

- Severity: P2
- Category: cleanup failure hidden
- File: `apps/operate/panel/modules/rcon.ts`;
  `apps/operate/panel/routes/server.ts`
- Symbol / function / flow: server deletion and RCON cleanup
- Evidence: `disconnectRcon()` resolves on socket close, socket error, or timeout
  and deletes connection state in all cases (`modules/rcon.ts:430-448`).
  `removeServer()` awaits that method and deletes the server cache
  (`modules/rcon.ts:462-465`). The delete route returns `Server deleted
  successfully` after `removeServer` resolves (`routes/server.ts:355-359`).
- What success is claimed: the server was deleted and cleanup completed.
- What is actually proven: DB access/orphan rows were deleted; socket cleanup may
  have errored or timed out.
- Missing failure/uncertainty signal: no cleanup status such as
  `rcon_cleanup: timed_out`.
- Runtime or user impact: lingering sockets/timers can be hidden after deletion.
- Suggested remediation: have disconnect return a cleanup result and include/log
  it when deletion succeeds with cleanup uncertainty.
- Test needed: fake a socket that emits `error` or never closes and assert
  deletion exposes cleanup uncertainty.
- Verification needed: RCON manager tests plus server CRUD route test.
- Confidence: medium

### FLA-014

- Severity: P2
- Category: cleanup failure hidden
- File: `apps/operate/panel/app.ts`
- Symbol / function / flow: graceful shutdown
- Evidence: on shutdown, Redis `quit()` errors and SQLite `close()` errors are
  caught and ignored (`app.ts:390-401`), then the process exits with code 0
  (`app.ts:402`).
- What success is claimed: clean process shutdown.
- What is actually proven: HTTP server close and RCON shutdown were awaited;
  Redis/SQLite cleanup may have failed.
- Missing failure/uncertainty signal: no warning log or nonzero exit code for
  cleanup failures.
- Runtime or user impact: operators lose evidence of resource cleanup problems.
- Suggested remediation: log cleanup failures with component names and consider
  setting a nonzero exit code if critical cleanup fails.
- Test needed: integration test with mocked Redis/DB close failures, or an
  entrypoint test that observes shutdown logs.
- Verification needed: entrypoint tests and `npm test`.
- Confidence: high

### FLA-015

- Severity: P2
- Category: false cleanup claim
- File: `apps/operate/panel/modules/rcon.ts`
- Symbol / function / flow: `RconManager.shutdownAll()`
- Evidence: `shutdownAll()` destroys pending sockets with ignored exceptions
  (`modules/rcon.ts:473-480`), awaits `Promise.allSettled(...)` for stored RCON
  disconnects without inspecting rejected results (`modules/rcon.ts:482`), then
  logs `All connections closed.` (`modules/rcon.ts:483`).
- What success is claimed: all connections closed.
- What is actually proven: disconnect attempts were made and settled.
- Missing failure/uncertainty signal: no count of closed/failed/pending
  connections.
- Runtime or user impact: shutdown diagnostics can say clean closure even when
  cleanup failed.
- Suggested remediation: summarize `allSettled` results and log failures before
  claiming all connections are closed.
- Test needed: make one disconnect reject and assert shutdown reports a failed
  close.
- Verification needed: RCON manager test focused on shutdown summaries.
- Confidence: medium

### FLA-016

- Severity: P1
- Category: hidden data corruption
- File: `apps/operate/panel/utils/rconSecret.ts`;
  `apps/operate/panel/modules/rcon.ts`;
  `apps/operate/panel/test/rcon-secret.test.ts`
- Symbol / function / flow: encrypted RCON password decrypt failure
- Evidence: `isEncryptedRconSecret()` only checks the `enc:v1:` prefix
  (`utils/rconSecret.ts:38-40`). Decrypt throws for missing key or invalid
  encrypted payload (`utils/rconSecret.ts:54-75`). `createAuthenticatedConnection`
  catches that alongside authentication errors and logs `Authentication failed`,
  then returns `null` (`modules/rcon.ts:198-223`). Current tests cover roundtrip
  and missing-key decrypt, but not malformed/tampered encrypted payloads
  (`test/rcon-secret.test.ts:23-52`).
- What success is claimed: RCON authentication failed.
- What is actually proven: the stored credential could not be decrypted, or auth
  failed.
- Missing failure/uncertainty signal: no separate data-corruption or key-mismatch
  status.
- Runtime or user impact: operators may rotate RCON passwords or troubleshoot the
  server when the panel has a local secret/key/data problem.
- Suggested remediation: classify decrypt failures separately from server auth
  failures and expose a clear credential-storage error.
- Test needed: malformed `enc:v1:` payload and wrong-key payload should produce
  a storage/decrypt error, not a generic auth failure.
- Verification needed: `npm test -- --test-name-pattern rcon-secret` and RCON
  manager connect tests.
- Confidence: high

### FLA-017

- Severity: P2
- Category: error misclassification
- File: `apps/operate/panel/routes/operator.ts`
- Symbol / function / flow: workshop favorite update
- Evidence: the `PATCH /api/workshop-favorites/:server_id/:favorite_id` route
  catches any error from `updateFavoriteStmt.run(...)`, logs a warning, and
  returns HTTP 409 `A favorite with that workshop_id already exists`
  (`routes/operator.ts:284-290`).
- What success is claimed: the update failed because of a duplicate favorite.
- What is actually proven: SQLite threw some error.
- Missing failure/uncertainty signal: no distinction between uniqueness conflict,
  database unavailable, schema mismatch, or other persistence error.
- Runtime or user impact: real storage failures are downgraded to a user-fixable
  conflict.
- Suggested remediation: inspect the SQLite error code/message and only return
  409 for the unique constraint; return/log 500 for unknown persistence errors.
- Test needed: simulate unique conflict and separate generic DB error.
- Verification needed: operator route tests for workshop favorites.
- Confidence: high

### FLA-018

- Severity: P1
- Category: service readiness false success
- File: `apps/maintain/updater/update_cs2.sh`;
  `apps/maintain/updater/tests/run.sh`
- Symbol / function / flow: `start_service()` and post-update success
- Evidence: `start_service()` logs `$SERVICE_NAME started.` after
  `systemctl start` returns success (`update_cs2.sh:864-867`). The final
  `update-applied` path logs `Update applied successfully` after buildid
  convergence and `start_service` (`update_cs2.sh:960-968`). Tests check that
  `start` was called and that start failures are nonzero, but do not simulate
  `systemctl start` returning 0 while `is-active` is false afterward
  (`tests/run.sh:176-207`, `tests/run.sh:530-550`).
- What success is claimed: the service started and the update was applied
  successfully.
- What is actually proven: `systemctl start` returned 0 and buildid changed.
- Missing failure/uncertainty signal: no post-start active check, service status,
  or grace-period verification.
- Runtime or user impact: a server that starts and immediately crashes can still
  produce an update-success log.
- Suggested remediation: after start, run `systemctl is-active --quiet` with a
  short bounded retry and fail or mark uncertain if inactive.
- Test needed: stub `systemctl start` as success but `is-active` as inactive and
  assert the updater exits nonzero or reports uncertain.
- Verification needed: `cd apps/maintain/updater && make test`.
- Confidence: medium

### FLA-019

- Severity: P2
- Category: hidden misconfiguration
- File: `apps/maintain/updater/update_cs2.sh`;
  `apps/maintain/updater/tests/run.sh`
- Symbol / function / flow: config file unknown keys and empty defaults
- Evidence: unknown config keys are ignored unless they match the removed-key
  warning list (`update_cs2.sh:227-255`, especially `246-253`). Empty
  `SERVICE_NAME` is defaulted to `cs2.service` (`update_cs2.sh:131-146`). Tests
  intentionally assert empty `SERVICE_NAME` succeeds and a `BOGUS_KEY` is ignored
  (`tests/run.sh:360-362`, `tests/run.sh:616-640`).
- What success is claimed: configuration loaded and update process can complete.
- What is actually proven: recognized keys were loaded/defaulted; unknown or
  empty explicit values may have been operator mistakes.
- Missing failure/uncertainty signal: no warning/failure for unknown keys or
  explicit empty values.
- Runtime or user impact: typos in production config can silently fall back to
  defaults and operate on the wrong service/path/behavior.
- Suggested remediation: warn or fail on unknown config keys, and distinguish
  missing values from explicitly empty values for critical settings.
- Test needed: unknown key and explicit empty critical key should produce a
  warning or nonzero exit, depending on the intended compatibility policy.
- Verification needed: `cd apps/maintain/updater && make test`.
- Confidence: high

### FLA-020

- Severity: P2
- Category: hidden verification failure
- File: `apps/operate/panel/package.json`;
  `apps/operate/panel/test/game-helpers.test.ts`
- Symbol / function / flow: test command forced exit and runtime skip
- Evidence: `npm test` uses `node --experimental-test-module-mocks --test
  --test-force-exit --test-timeout 120000 dist/test/*.test.js`
  (`package.json:21`). One test file exits 0 on Node major versions below 22
  (`test/game-helpers.test.ts:6-10`).
- What success is claimed: the test command passed.
- What is actually proven: the selected test files completed enough for Node to
  exit, with open handles forcibly hidden; on older Node, one helper test file
  can exit 0 without running its assertions.
- Missing failure/uncertainty signal: no open-handle failure and no explicit
  skipped-test count surfaced by the package script.
- Runtime or user impact: resource leaks or skipped coverage can be hidden behind
  a passing test command.
- Suggested remediation: remove `--test-force-exit` after fixing open handles, or
  split leak-prone tests into an explicit mode that reports why force-exit is
  required. Replace process-level skip with Node test skip metadata if the file
  still needs a version gate.
- Test needed: a verification script check that fails if `--test-force-exit`
  remains without a documented exception.
- Verification needed: `cd apps/operate/panel && npm test` after removing or
  documenting the forced exit behavior.
- Confidence: high

### FLA-021

- Severity: P2
- Category: missing failure test
- File: `apps/operate/panel/test/server-crud.test.ts`;
  `apps/operate/panel/routes/server.ts`
- Symbol / function / flow: server deletion cleanup failure behavior
- Evidence: delete route success depends on `rcon.removeServer(server_id)` after
  orphan deletion (`routes/server.ts:355-359`). The server CRUD tests cover add,
  connection failures, reconnect failure, listing shape, delete 404, and
  unauthenticated delete, but no successful delete path with `removeServer`
  failure or cleanup uncertainty (`test/server-crud.test.ts:70-426`).
- What success is claimed: deletion succeeded.
- What is actually proven: current tests do not prove how cleanup failure is
  surfaced.
- Missing failure/uncertainty signal: no regression test preventing deletion from
  hiding RCON cleanup problems.
- Runtime or user impact: future changes can keep returning a clean success when
  cleanup fails.
- Suggested remediation: add a focused test before changing behavior.
- Test needed: make the mocked `removeServer` reject or report timeout and assert
  the route reports cleanup uncertainty.
- Verification needed: `cd apps/operate/panel && npm test -- --test-name-pattern delete-server`
- Confidence: high

## Highest-Risk False-Success Paths

1. RCON initialization and health/readiness can look healthy without exposing
   failed RCON startup (`FLA-001`, `FLA-002`).
2. Server list and manage badges collapse unknown RCON observation into
   disconnected/connected UI states (`FLA-003`, `FLA-004`).
3. Game-control endpoints use definitive success wording for unverified RCON
   side effects (`FLA-005`, `FLA-006`).
4. RCON command execution can partially succeed while history persistence fails,
   causing users to retry an already-sent command (`FLA-009`).
5. The updater can report service/update success without a post-start active
   proof (`FLA-018`).

## Places Needing Explicit Result Types/Counts/Status

- `RconManager.init()`: `total`, `connected`, `failed`, `skipped`, and recent
  errors.
- `/api/health`: separate liveness from readiness and expose RCON degraded state.
- `/api/servers`: per-server `status`, `observed_at`, `timed_out`, and `error`.
- RCON command routes: `command_sent`, `server_state_verified`, and optional
  `verification_error`.
- `/api/rcon`: `command_sent` and `history_recorded` should be separate.
- Backup routes: `backup_state` should distinguish `none`, `unknown`, and
  `malformed_response`.
- Updater config parsing: `recognized`, `unknown`, `removed`, and `defaulted`
  keys should be visible or fail-fast.

## Places Needing Better Error Propagation

- RCON startup failures should not disappear inside `Promise.allSettled`.
- Decrypt/credential-storage failures should not be reported as generic RCON
  authentication failures.
- Workshop favorite update should only map unique-constraint failures to HTTP
  409.
- RCON cleanup and shutdown should return/log close failure counts before
  claiming success.
- History-write failure after command send needs an explicit partial-success
  response.

## Places Needing UI Status Correction

- Servers dashboard needs an `unknown`/`timed out` state instead of only
  `Connected`/`Disconnected`.
- Manage page initial header should show whether hostname/status was observed.
- RCON history should show `history unavailable` when fetch fails.
- Server-card player count fetch failures should be visible as degraded status.
- Success toasts for unverified RCON operations should say the command was sent,
  or include verification state if readback was performed.

## Remaining Uncertainty

- Some RCON commands may have reliable success text or state readback in CS2,
  MatchZy, or plugins, but this audit did not verify live server semantics.
- `systemctl start` behavior can vary by unit type; the updater finding is based
  on the absence of a post-start active check in this script, not proof that a
  current deployment has failed this way.
- Existing tests already cover several fail-loud behaviors well: status partial
  responses, multi-command partial failures, unknown remote updater state,
  unchanged buildid after SteamCMD success, stale lock recovery, and session
  invalidation. These should be preserved while the gaps above are fixed.
- Generated `public/js/console.js`, screenshots, archives, and lockfile internals
  were not audited as source of behavior.
