# Simplicity Remediation Plan

Date: 2026-05-26

Source audit: `docs/simplicity-test-certainty-audit.md`

This is a docs-only remediation plan. It does not change production code or
tests. Each slice below is intended to be small, independently reviewable, and
verifiable. Slices marked `INVESTIGATION` must produce evidence before any
implementation or deletion follows.

## Planning Rules

- Work one slice at a time.
- Prefer failing tests or explicit reproduction before behavior changes.
- Prefer direct fixes, deletion, inlining, or simplification over new
  abstractions.
- Do not delete optional or compatibility code until repository, history, docs,
  or operator evidence proves it is unused.
- Do not combine unrelated fixes in one pull request.
- Keep valuable tests identified by the source audit.
- Stop a slice if the evidence contradicts the plan; update the plan before
  continuing.

## Slice Index

| Order | Slice ID | Priority | Type | Title | Findings |
| --- | --- | --- | --- | --- | --- |
| 1 | SRP-001 | P1 | IMPLEMENTATION | Make RCON init and health readiness explicit | `STC-FL-001` |
| 2 | SRP-002 | P1 | IMPLEMENTATION | Add explicit unknown/timed-out server status API states | `STC-FL-002`, `STC-TI-003` |
| 3 | SRP-003 | P1 | IMPLEMENTATION | Render dashboard/manage status uncertainty | `STC-FL-002`, `STC-FL-009`, `STC-TI-003` |
| 4 | SRP-004 | P1 | TEST-FIRST | Prove add-server persistence, access, encryption, and RCON behavior | `STC-TI-002` |
| 5 | SRP-005 | P1 | TEST-FIRST | Prove delete-server shared access and cleanup outcomes | `STC-TI-004`, `STC-FL-010` |
| 6 | SRP-006 | P1 | TEST-FIRST | Prove game route command sequences and persistence gates | `STC-TI-005` |
| 7 | SRP-007 | P1 | IMPLEMENTATION | Make unverified game-control success wording truthful | `STC-FL-003` |
| 8 | SRP-008 | P1 | IMPLEMENTATION | Separate setup-game requested state from observed state | `STC-FL-004` |
| 9 | SRP-009 | P1 | IMPLEMENTATION | Make backup route uncertainty explicit | `STC-FL-005` |
| 10 | SRP-010 | P1 | IMPLEMENTATION | Separate raw RCON command success from history persistence | `STC-FL-006` |
| 11 | SRP-011 | P2 | IMPLEMENTATION | Make RCON history wording and UI failure states truthful | `STC-FL-007`, `STC-FL-008`, `STC-TI-007` |
| 12 | SRP-012 | P1 | IMPLEMENTATION | Classify RCON secret decrypt failures separately from auth failures | `STC-FL-011`, `STC-TI-016` |
| 13 | SRP-013 | P1 | TEST-FIRST | Add RCON protocol-level integration fixture | `STC-TI-011` |
| 14 | SRP-014 | P1 | TEST-FIRST | Cover RCON shutdown, remove, heartbeat, and queue transitions | `STC-TI-012`, `STC-FL-010` |
| 15 | SRP-015 | P1 | TEST-FIRST | Prove updater stop/update/verify/start ordering | `STC-TI-013` |
| 16 | SRP-016 | P1 | IMPLEMENTATION | Verify updater service is active after start | `STC-FL-013`, `STC-TI-013` |
| 17 | SRP-017 | P2 | INVESTIGATION | Define and enforce updater config unknown/empty-key policy | `STC-MC-011`, `STC-FL-014`, `STC-TI-014` |
| 18 | SRP-018 | P1 | INVESTIGATION | Separate updater test-only knobs from deployable config | `STC-MC-018` |
| 19 | SRP-019 | P1 | TEST-FIRST | Prove workshop favorite scope and persistence error classification | `STC-TI-006`, `STC-FL-012` |
| 20 | SRP-020 | P2 | TEST-FIRST | Add representative CSRF matrix | `STC-TI-009` |
| 21 | SRP-021 | P1 | TEST-FIRST | Prove SQLite constraints, indexes, and cascade behavior | `STC-TI-015` |
| 22 | SRP-022 | P2 | INVESTIGATION | Define SQLite migration support window | `STC-MC-014` |
| 23 | SRP-023 | P2 | IMPLEMENTATION | Remove test-command false certainty | `STC-TI-010`, `STC-FL-015`, `STC-MC-019` |
| 24 | SRP-024 | P2 | TEST-FIRST | Replace source-string tests with behavior or docs-lint checks | `STC-TI-001` |
| 25 | SRP-025 | P1 | TEST-FIRST | Exercise manage-page controls, not just visibility | `STC-TI-008` |
| 26 | SRP-026 | P2 | INVESTIGATION | Decide optional operator feature scope | `STC-MC-001`, `STC-MC-002`, `STC-MC-003` |
| 27 | SRP-027 | P2 | INVESTIGATION | Prove or remove `DEFAULT_PORT` compatibility | `STC-MC-007` |
| 28 | SRP-028 | P2 | INVESTIGATION | Prove or simplify Redis host/port aliases | `STC-MC-008` |
| 29 | SRP-029 | P2 | INVESTIGATION | Prove or constrain full CSP override | `STC-MC-010` |
| 30 | SRP-030 | P2 | INVESTIGATION | Prove or remove `RCON_AUTH_TIMEOUT_MS` runtime knob | `STC-MC-009` |
| 31 | SRP-031 | P3 | INVESTIGATION | Decide whether `scripts/validate.sh` is public compatibility | `STC-MC-012` |
| 32 | SRP-032 | P2 | INVESTIGATION | Decide whether pinned shell-tool downloader is required | `STC-MC-013` |
| 33 | SRP-033 | P2 | INVESTIGATION | Decide CommonJS deprecation and Node mock-helper contract | `STC-MC-015`, `STC-MC-019` |
| 34 | SRP-034 | P2 | INVESTIGATION | Reassess RCON password provider and lazy DB seam after RCON tests | `STC-MC-016` |
| 35 | SRP-035 | P2 | IMPLEMENTATION | Separate pure server ID parsing from route access side effects | `STC-MC-017` |
| 36 | SRP-036 | P2 | IMPLEMENTATION | Inline `makeMultiPresetRoute` | `STC-MC-004` |
| 37 | SRP-037 | P2 | IMPLEMENTATION | Inline browser server ID context | `STC-MC-005` |
| 38 | SRP-038 | P2 | IMPLEMENTATION | Deduplicate browser JSON request helpers | `STC-MC-006` |
| 39 | SRP-039 | P3 | TEST-FIRST | Rename and split utility tests around intent | `STC-TI-017` |

## Remediation Slices

### SRP-001

- Slice ID: SRP-001
- Title: Make RCON init and health readiness explicit
- Findings addressed: `STC-FL-001`
- Problem: App startup and `/api/health` can report readiness while every saved
  RCON initialization attempt failed.
- Minimal fix strategy: Add an RCON init summary with counts such as `total`,
  `connected`, `failed`, `skipped`, and recent errors. Expose that summary in a
  readiness field without turning HTTP liveness into a broad runtime smoke.
- Files likely affected: `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/app.ts`, `apps/operate/panel/Dockerfile`,
  `apps/operate/panel/test/e2e/panel.spec.ts`, RCON/health tests.
- Behavior affected: Health/readiness response shape and operator visibility
  into degraded RCON startup.
- Tests to add/update: Seed saved servers, force partial and total RCON init
  failure, assert counts and degraded readiness; update health/e2e expectation
  if readiness payload changes.
- Verification commands: `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run test:e2e`; `cd apps/operate/panel && npm run typecheck`.
- Risk level: high
- Rollback strategy: Revert the slice commit to restore the prior health
  payload and RCON init behavior.
- Definition of Done: A failed RCON init cannot disappear into startup logs, and
  health/readiness tests fail if RCON init failure counts are not exposed.

### SRP-002

- Slice ID: SRP-002
- Title: Add explicit unknown/timed-out server status API states
- Findings addressed: `STC-FL-002`, `STC-TI-003`
- Problem: `/api/servers` collapses unobserved, failed, or timed-out RCON state
  into boolean `connected`/`authenticated` values.
- Minimal fix strategy: Return explicit status fields such as `status`,
  `observed_at`, `status_source`, `timed_out`, and `error` while preserving old
  booleans only if compatibility is required and clearly documented.
- Files likely affected: `apps/operate/panel/routes/server.ts`,
  `apps/operate/panel/test/server-crud.test.ts`.
- Behavior affected: Server-list API status semantics.
- Tests to add/update: Server list includes only accessible servers; connected
  server reports observed status; hung hostname probe reports timed out or
  unknown; failed probe exposes error without claiming disconnected.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern servers`; if the runner does not support that pattern, `cd apps/operate/panel && npm test`.
- Risk level: high
- Rollback strategy: Revert the API contract change and tests together.
- Definition of Done: API tests fail if an unobserved or timed-out server is
  reported as definitively disconnected.

### SRP-003

- Slice ID: SRP-003
- Title: Render dashboard/manage status uncertainty
- Findings addressed: `STC-FL-002`, `STC-FL-009`, `STC-TI-003`
- Problem: Dashboard and manage-page UI can show connected/disconnected badges
  or silently leave player counts unknown when runtime status observation failed.
- Minimal fix strategy: Render explicit `unknown`, `timed out`, or `status
  unavailable` states from the API fields added in SRP-002. Show secondary
  player-count fetch failures as degraded status.
- Files likely affected: `apps/operate/panel/public/ts/servers.ts`,
  `apps/operate/panel/views/manage.ejs`, `apps/operate/panel/public/ts/manage.ts`,
  `apps/operate/panel/test/e2e/panel.spec.ts`.
- Behavior affected: User-visible server status and dashboard cards.
- Tests to add/update: Playwright cases for unknown server status, initial
  manage hostname failure, `/api/status/:id` 500 while server list says
  connected, and normal connected/disconnected states.
- Verification commands: `cd apps/operate/panel && npm run build:client`; `cd apps/operate/panel && npm run test:e2e`; `cd apps/operate/panel && npm test`.
- Risk level: high
- Rollback strategy: Revert UI/status rendering changes and the related e2e
  tests.
- Definition of Done: The UI never presents an unobserved status as a definitive
  connected or disconnected state.

### SRP-004

- Slice ID: SRP-004
- Title: Prove add-server persistence, access, encryption, and RCON behavior
- Findings addressed: `STC-TI-002`
- Problem: Add-server success tests assert status/message but do not prove the
  database row, access grant, encrypted password, RCON probe, connect call, or
  visible server list behavior.
- Minimal fix strategy: Add intent-focused tests before any production change.
  Only fix production code if the new tests expose an actual behavior bug.
- Files likely affected: `apps/operate/panel/test/server-crud.test.ts`;
  production files only if tests reveal a bug.
- Behavior affected: None intended by the test-only part; possible later fixes
  to add-server behavior if tests expose false success.
- Tests to add/update: Valid add persists server and access row; password is
  encrypted when configured; `probeServer` and `connectServer` receive the saved
  server; failed probe/connect refuses clean success; duplicate server grants
  access without duplicate rows.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern add-server`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Revert the added tests or the follow-up behavior fix as one
  focused slice.
- Definition of Done: Add-server tests fail if the route returns success without
  persistence, access, encryption, and RCON boundary behavior.

### SRP-005

- Slice ID: SRP-005
- Title: Prove delete-server shared access and cleanup outcomes
- Findings addressed: `STC-TI-004`, `STC-FL-010`
- Problem: Delete-server success and RCON cleanup uncertainty are not covered;
  cleanup errors can be hidden behind a clean success.
- Minimal fix strategy: Add tests for shared access and final-owner deletion,
  then make cleanup return/log an explicit result only if current behavior hides
  failure.
- Files likely affected: `apps/operate/panel/test/server-crud.test.ts`,
  `apps/operate/panel/modules/rcon.ts`, `apps/operate/panel/routes/server.ts`.
- Behavior affected: Delete-server response/logging may gain cleanup status.
- Tests to add/update: Shared server deletion removes only caller access; final
  access deletes orphan server and calls cleanup; cleanup timeout/error is
  visible; inaccessible and malformed IDs remain rejected.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern delete-server`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Revert cleanup-result plumbing and tests together.
- Definition of Done: Tests fail if deletion deletes shared servers incorrectly
  or hides RCON cleanup uncertainty.

### SRP-006

- Slice ID: SRP-006
- Title: Prove game route command sequences and persistence gates
- Findings addressed: `STC-TI-005`
- Problem: Several game/setup success tests assert status/message without
  proving command order, exact safe RCON commands, or persistence timing.
- Minimal fix strategy: Add tests that define current required behavior before
  changing response wording in later slices.
- Files likely affected: `apps/operate/panel/test/game-routes.test.ts`,
  `apps/operate/panel/test/app.test.ts`.
- Behavior affected: None intended by this test-first slice.
- Tests to add/update: Representative setup modes execute cfg before map
  change; invalid input sends no command; partial sequence failure does not
  persist applied state; workshop and say-admin routes send exact safe commands.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern setup-game`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Revert only the added tests if they encode the wrong
  contract; otherwise fix production in a follow-up slice.
- Definition of Done: Tests fail if a route returns success while omitting or
  reordering required RCON commands.

### SRP-007

- Slice ID: SRP-007
- Title: Make unverified game-control success wording truthful
- Findings addressed: `STC-FL-003`
- Problem: Game-control routes use definitive messages such as restarted,
  paused, kicked, muted, or sent when only RCON command resolution is proven.
- Minimal fix strategy: Change unverified responses/toasts to "command sent" or
  "requested" wording. Add readback only where a reliable current RCON query is
  already proven.
- Files likely affected: `apps/operate/panel/routes/game/helpers.ts`,
  `apps/operate/panel/routes/game/match.ts`,
  `apps/operate/panel/routes/game/controls.ts`, route tests, possibly browser
  toast assertions.
- Behavior affected: API/user-visible success wording, not the RCON command
  itself.
- Tests to add/update: Resolved error-like RCON output does not produce a
  definitive state-change message; normal command dispatch still returns
  success with unverified status.
- Verification commands: `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run test:e2e` if UI toasts are affected.
- Risk level: medium
- Rollback strategy: Revert wording and test expectation changes together.
- Definition of Done: No unverified RCON-backed action claims the server state
  changed unless the code actually verifies that state.

### SRP-008

- Slice ID: SRP-008
- Title: Separate setup-game requested state from observed state
- Findings addressed: `STC-FL-004`
- Problem: `setup-game` stores `last_*` fields and returns `Game Created!` as if
  runtime state is proven after command promises resolve.
- Minimal fix strategy: Rename or reinterpret stored fields as requested state,
  or add readback verification before labeling them applied. Prefer renaming if
  reliable runtime readback is not already available.
- Files likely affected: `apps/operate/panel/routes/game/match.ts`,
  `apps/operate/panel/views/manage.ejs`,
  `apps/operate/panel/public/ts/manage.ts`, game route/e2e tests, docs if the
  API text documents applied state.
- Behavior affected: Setup-game response wording and saved-selection semantics.
- Tests to add/update: `changelevel` failure or error-like output does not
  produce observed-state success; requested state is visible as requested if no
  readback exists.
- Verification commands: `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run test:e2e`.
- Risk level: high
- Rollback strategy: Revert schema/wording changes and tests; if migration is
  introduced, provide a reverse migration or leave old fields untouched.
- Definition of Done: The UI/API distinguishes desired/requested setup from
  observed runtime setup.

### SRP-009

- Slice ID: SRP-009
- Title: Make backup route uncertainty explicit
- Findings addressed: `STC-FL-005`
- Problem: Backup routes report no backups when RCON output is empty, malformed,
  unsafe, or unparseable.
- Minimal fix strategy: Distinguish `none`, `unknown`, `malformed_response`, and
  explicit no-backup states. Reserve "No backups found" for recognized no-backup
  responses.
- Files likely affected: `apps/operate/panel/routes/game/match.ts`,
  `apps/operate/panel/test/game-routes.test.ts`.
- Behavior affected: Backup restore/list status codes and messages.
- Tests to add/update: Empty response, malformed non-empty response, unsafe
  filename, explicit no-backup output, and valid backup filename.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern backup`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Revert route and test changes together.
- Definition of Done: A parser failure cannot be reported as proof that no
  backup exists.

### SRP-010

- Slice ID: SRP-010
- Title: Separate raw RCON command success from history persistence
- Findings addressed: `STC-FL-006`
- Problem: `/api/rcon` can send a command, fail while recording history, and
  return a generic failure that makes retry unsafe.
- Minimal fix strategy: Wrap history persistence separately from RCON command
  dispatch and return explicit partial success, such as `command_sent: true` and
  `history_recorded: false`.
- Files likely affected: `apps/operate/panel/routes/game/match.ts`,
  `apps/operate/panel/utils/rconHistory.ts`,
  `apps/operate/panel/public/ts/manage.ts`, route/UI tests.
- Behavior affected: `/api/rcon` response shape and UI handling for partial
  success.
- Tests to add/update: Successful RCON with history write failure; RCON failure
  with no history write; UI shows command sent but history unavailable.
- Verification commands: `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run build:client`; `cd apps/operate/panel && npm run test:e2e` if UI flow changes.
- Risk level: medium
- Rollback strategy: Revert response-shape/UI changes and tests.
- Definition of Done: Operators cannot be told a sent command failed only
  because post-command bookkeeping failed.

### SRP-011

- Slice ID: SRP-011
- Title: Make RCON history wording and UI failure states truthful
- Findings addressed: `STC-FL-007`, `STC-FL-008`, `STC-TI-007`
- Problem: History wording claims success when only command resolution is proven,
  and history fetch failure renders as empty history.
- Minimal fix strategy: Rename history to sent commands unless verification is
  added. Render a distinct history unavailable state on fetch failure.
- Files likely affected: `apps/operate/panel/public/ts/manage.ts`,
  `apps/operate/panel/routes/operator.ts`,
  `apps/operate/panel/routes/game/match.ts`,
  `apps/operate/panel/test/game-routes.test.ts`,
  `apps/operate/panel/test/e2e/panel.spec.ts`.
- Behavior affected: UI labels, empty/error states, and possibly API field names
  if history semantics are formalized.
- Tests to add/update: Failed raw RCON command is not recorded; resolved
  error-like output is not labeled verified success; history endpoint 500 shows
  unavailable; clear/use still works.
- Verification commands: `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run test:e2e`.
- Risk level: medium
- Rollback strategy: Revert UI wording/state changes and tests together.
- Definition of Done: History UI distinguishes sent, verified if ever added,
  empty, and unavailable states.

### SRP-012

- Slice ID: SRP-012
- Title: Classify RCON secret decrypt failures separately from auth failures
- Findings addressed: `STC-FL-011`, `STC-TI-016`
- Problem: Malformed encrypted credentials, wrong keys, and local decrypt
  failures can be logged or exposed as generic RCON authentication failure.
- Minimal fix strategy: Add malformed/tampered/wrong-key tests first, then
  classify local credential storage errors separately from remote auth errors.
- Files likely affected: `apps/operate/panel/utils/rconSecret.ts`,
  `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/test/rcon-secret.test.ts`,
  `apps/operate/panel/test/rcon-manager.test.ts`.
- Behavior affected: Connection error classification, logs, and possibly API/UI
  status details.
- Tests to add/update: Malformed `enc:v1:` payload, missing segments, non-hex
  data, wrong key, modified tag/ciphertext, invalid key, and manager status for
  decrypt failure versus auth failure.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern rcon-secret`; `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Revert classification changes and tests.
- Definition of Done: Local credential/key corruption is observable as local
  storage/decrypt failure, not server authentication failure.

### SRP-013

- Slice ID: SRP-013
- Title: Add RCON protocol-level integration fixture
- Findings addressed: `STC-TI-011`
- Problem: Current RCON tests rely on module mocks and a fake class, leaving
  socket/protocol event ordering uncovered.
- Minimal fix strategy: Add a minimal local RCON protocol fixture or socket-level
  fake that validates auth success/failure, delayed auth, command response,
  socket close, timeout, reconnect, and queued commands.
- Files likely affected: `apps/operate/panel/test/rcon-manager.test.ts`, new
  test helper under `apps/operate/panel/test` if needed.
- Behavior affected: None intended; this is test coverage.
- Tests to add/update: Protocol fixture tests for bad password, close during
  auth, close during command, auth timeout, command timeout, reconnect, and
  multi-server isolation.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern RconManager`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Remove the fixture and tests if they prove too flaky or
  encode the protocol incorrectly.
- Definition of Done: RCON manager tests fail on socket/auth/command lifecycle
  regressions that class-level mocks cannot catch.

### SRP-014

- Slice ID: SRP-014
- Title: Cover RCON shutdown, remove, heartbeat, and queue transitions
- Findings addressed: `STC-TI-012`, `STC-FL-010`
- Problem: RCON shutdown/remove/heartbeat paths lack state-transition tests and
  can hide failed cleanup behind success logs.
- Minimal fix strategy: Add tests for lifecycle transitions, then return/log
  cleanup summaries only where needed to make failures observable.
- Files likely affected: `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/test/rcon-manager.test.ts`.
- Behavior affected: Cleanup logging/result summaries and stale connection
  state.
- Tests to add/update: Remove while command is in flight, shutdown with queued
  command, heartbeat failure/backoff, reconnect failure, repeated shutdown,
  repeated remove, and multi-server isolation.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern RconManager`; `cd apps/operate/panel && npm test`.
- Risk level: high
- Rollback strategy: Revert lifecycle-result changes and tests.
- Definition of Done: Tests fail if shutdown/remove leaves stale state or claims
  clean closure after failed cleanup.

### SRP-015

- Slice ID: SRP-015
- Title: Prove updater stop/update/verify/start ordering
- Findings addressed: `STC-TI-013`
- Problem: Updater tests record `systemctl` and `steamcmd` in separate files, so
  they do not prove global operation order.
- Minimal fix strategy: Add a single ordered event log in test stubs and assert
  the sequence: status check, stop, SteamCMD update, build ID verification, and
  start.
- Files likely affected: `apps/maintain/updater/tests/run.sh`,
  `apps/maintain/updater/tests/bin/systemctl`,
  `apps/maintain/updater/tests/bin/steamcmd`.
- Behavior affected: None intended; this is test coverage.
- Tests to add/update: Update applied, update failed, unchanged build ID, start
  failure, initially inactive service, dry-run, unknown remote build ID.
- Verification commands: `cd apps/maintain/updater && make test`.
- Risk level: medium
- Rollback strategy: Revert the ordered-log test harness changes.
- Definition of Done: Updater tests fail if service start can occur before
  build verification or if update runs before service stop.

### SRP-016

- Slice ID: SRP-016
- Title: Verify updater service is active after start
- Findings addressed: `STC-FL-013`, `STC-TI-013`
- Problem: `systemctl start` returning success is treated as proof that the
  service is running.
- Minimal fix strategy: After start, run bounded `systemctl is-active --quiet`
  checks. Fail or report uncertain if the service is inactive after the bounded
  wait.
- Files likely affected: `apps/maintain/updater/update_cs2.sh`,
  `apps/maintain/updater/tests/run.sh`,
  `apps/maintain/updater/tests/bin/systemctl`.
- Behavior affected: Post-update success/failure behavior and logs.
- Tests to add/update: Start returns success but `is-active` remains inactive;
  start returns success and active; start command fails; inactive service before
  dry-run remains handled.
- Verification commands: `cd apps/maintain/updater && make test`; `cd apps/maintain/updater && make ci`.
- Risk level: high
- Rollback strategy: Revert active-check logic and tests if it breaks supported
  unit types; keep SRP-015 test harness if still valid.
- Definition of Done: The updater cannot log update/start success unless the
  service is proven active or explicitly reported uncertain.

### SRP-017

- Slice ID: SRP-017
- Title: Define and enforce updater config unknown/empty-key policy
- Findings addressed: `STC-MC-011`, `STC-FL-014`, `STC-TI-014`
- Problem: Unknown keys and explicit empty critical values can be hidden by
  defaults, but the intended compatibility policy is `UNCLEAR`.
- Minimal fix strategy: First decide the policy from current docs/history. Then
  add tests that make unknown keys, removed keys, duplicate keys, CLI precedence,
  and explicit empty critical values observable as either failure or documented
  warning.
- Files likely affected: `apps/maintain/updater/update_cs2.sh`,
  `apps/maintain/updater/tests/run.sh`,
  `apps/maintain/updater/cs2-auto-update.conf.example`,
  updater docs if policy is documented.
- Behavior affected: Config loading diagnostics and possibly failure behavior.
- Tests to add/update: Non-default config side effects, unknown key, removed key,
  explicit empty `SERVICE_NAME`, duplicate key, quoted value, whitespace/comment
  parsing, CLI override precedence.
- Verification commands: `rg -n "REMOVED_CONFIG_KEYS|BOGUS_KEY|SERVICE_NAME" apps/maintain/updater`; `cd apps/maintain/updater && make test && make ci`.
- Risk level: high
- Rollback strategy: Revert config parser policy changes and tests; restore the
  previous warning/default behavior if operator compatibility requires it.
- Definition of Done: Config typos and explicit empty critical settings cannot
  be mistaken for clean configured success, and the chosen policy is covered by
  tests.

### SRP-018

- Slice ID: SRP-018
- Title: Separate updater test-only knobs from deployable config
- Findings addressed: `STC-MC-018`
- Problem: `ALLOW_NONROOT` and `NO_SLEEP` appear to be test harness controls but
  are exposed as deployable config.
- Minimal fix strategy: Investigate whether operators use these knobs outside
  tests. If not, move them to test harness setup or document them as test-only.
  If operator usage exists, document the supported use and keep tests covering
  the safety implications.
- Files likely affected: `apps/maintain/updater/update_cs2.sh`,
  `apps/maintain/updater/tests/run.sh`,
  `apps/maintain/updater/cs2-auto-update.conf.example`,
  updater docs.
- Behavior affected: Test harness setup and possibly deployable example config.
- Tests to add/update: Full updater tests proving non-root/no-sleep behavior is
  still deterministic without presenting unsafe defaults as normal deployment
  config.
- Verification commands: `rg -n "ALLOW_NONROOT|NO_SLEEP" apps/maintain/updater`; `cd apps/maintain/updater && make test && make ci`.
- Risk level: medium
- Rollback strategy: Restore the previous config example and variable handling
  if real operator usage is proven.
- Definition of Done: The knobs are either removed from deployable config or
  explicitly documented/tested as supported operator controls.

### SRP-019

- Slice ID: SRP-019
- Title: Prove workshop favorite scope and persistence error classification
- Findings addressed: `STC-TI-006`, `STC-FL-012`
- Problem: Favorite tests do not prove cross-user/server isolation, and update
  maps all DB errors to duplicate conflict.
- Minimal fix strategy: Add two-user/two-server tests and separate unique
  constraint errors from generic persistence failures.
- Files likely affected: `apps/operate/panel/routes/operator.ts`,
  `apps/operate/panel/test/game-routes.test.ts`.
- Behavior affected: Workshop favorite update error status and authorization
  guarantees.
- Tests to add/update: Favorite invisible across user/server boundary; update
  and delete outside owning scope fail without mutation; unique conflict returns
  409; generic DB failure returns/logs 500.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern favorite`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Revert route error classification and tests.
- Definition of Done: Tests fail if favorites leak across scope or unknown DB
  errors are downgraded to duplicate conflicts.

### SRP-020

- Slice ID: SRP-020
- Title: Add representative CSRF matrix
- Findings addressed: `STC-TI-009`
- Problem: Explicit missing/wrong CSRF tests cover add-server but not a
  representative matrix of state-changing routes.
- Minimal fix strategy: Add table-driven tests for representative POST, PATCH,
  and DELETE routes across server, game, user, and operator modules.
- Files likely affected: `apps/operate/panel/test/app.test.ts`,
  `apps/operate/panel/test/game-routes.test.ts`,
  `apps/operate/panel/test/user-management.test.ts`,
  `apps/operate/panel/test/server-crud.test.ts`.
- Behavior affected: None intended unless the matrix exposes an exemption bug.
- Tests to add/update: Missing token, wrong token, form `_csrf`, JSON
  `x-csrf-token`, logout, login exemption, unauthenticated request, routes
  mounted after middleware.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern CSRF`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: low
- Rollback strategy: Revert the added matrix if it duplicates existing coverage
  without improving intent.
- Definition of Done: A representative state-changing route cannot bypass CSRF
  without at least one test failing.

### SRP-021

- Slice ID: SRP-021
- Title: Prove SQLite constraints, indexes, and cascade behavior
- Findings addressed: `STC-TI-015`
- Problem: Migration tests check versions and columns but not important
  constraints, indexes, or cascade behavior.
- Minimal fix strategy: Add migration/schema tests for current fresh schema and
  supported upgrade paths without changing schema in the same slice unless tests
  expose a bug.
- Files likely affected: `apps/operate/panel/test/migrations.test.ts`,
  `apps/operate/panel/db.ts` only if tests reveal a real schema bug.
- Behavior affected: None intended by test-only part.
- Tests to add/update: Duplicate server IP/port, duplicate favorite/history
  constraints, invalid foreign keys, delete user/server cascades, and index
  existence for query paths.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern migration`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Revert tests or the narrow schema fix if they prove wrong.
- Definition of Done: Tests fail if migrations create a schema without required
  access, favorite, history, uniqueness, foreign-key, or cascade behavior.

### SRP-022

- Slice ID: SRP-022
- Title: Define SQLite migration support window
- Findings addressed: `STC-MC-014`
- Problem: Old SQLite compatibility paths are complex, but the oldest supported
  schema version is `UNCLEAR`.
- Minimal fix strategy: Investigate release history, docs, and existing
  migration tests. Record the oldest supported schema and unsupported-version
  behavior before deleting any compatibility path.
- Files likely affected: `apps/operate/panel/db.ts`,
  `apps/operate/panel/test/migrations.test.ts`, migration docs or this plan.
- Behavior affected: None during investigation; future behavior may reject
  unsupported legacy DBs explicitly.
- Tests to add/update: Unsupported-version failure test and fixture tests for
  every supported historical schema.
- Verification commands: `rg -n "user_version|migration|schema" apps/operate/panel docs`; `cd apps/operate/panel && npm test -- --test-name-pattern migration`.
- Risk level: high
- Rollback strategy: Keep all current compatibility paths if support evidence is
  inconclusive.
- Definition of Done: The repo has an evidence-backed migration support window;
  no old-schema path is removed without a matching test and operator impact note.

### SRP-023

- Slice ID: SRP-023
- Title: Remove test-command false certainty
- Findings addressed: `STC-TI-010`, `STC-FL-015`, `STC-MC-019`
- Problem: `npm test` can force-exit with open handles, and helper tests can
  silently skip coverage on unsupported runtimes.
- Minimal fix strategy: Identify leaked handles first. Remove
  `--test-force-exit` when teardown is clean, or document a narrow exception.
  Replace process-level version exits with explicit test-runner skip/fail
  behavior and align Node mock helper branches with the declared engine range.
- Files likely affected: `apps/operate/panel/package.json`,
  `apps/operate/panel/test/game-helpers.test.ts`,
  `apps/operate/panel/test/mock-module.ts`, teardown helpers if leaks are found.
- Behavior affected: Test runner behavior only.
- Tests to add/update: Clean exit without forced shutdown, explicit Node version
  support/failure, and teardown coverage for RCON timers, HTTP server, DB, and
  Redis clients if needed.
- Verification commands: `cd apps/operate/panel && node -v`; `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Restore `--test-force-exit` with a documented exception if
  a dependency leak cannot be fixed in the slice.
- Definition of Done: A passing test command no longer hides open handles or
  silently skipped helper coverage.

### SRP-024

- Slice ID: SRP-024
- Title: Replace source-string tests with behavior or docs-lint checks
- Findings addressed: `STC-TI-001`
- Problem: Tests grep implementation strings and docs text instead of proving
  runtime behavior.
- Minimal fix strategy: Replace each source-string assertion with the smallest
  behavior test that proves the real contract, or move public text consistency
  to a docs-lint check if wording is actually contractual.
- Files likely affected: `apps/operate/panel/test/scripts.test.ts`, possible
  docs-lint script if one already exists.
- Behavior affected: Test intent and failure modes only.
- Tests to add/update: Auth/CSRF HTTP behavior, malicious username DOM rendering
  without unsafe sinks, production-like add-server limiter behavior or fail-closed
  startup when Redis is required.
- Verification commands: `cd apps/operate/panel && npm test`; `./scripts/verify.sh` if root docs/script checks change.
- Risk level: low
- Rollback strategy: Restore a source-string assertion only if no behavior or
  docs-lint equivalent can protect the contract.
- Definition of Done: No test in the slice passes solely because an
  implementation string remains in source.

### SRP-025

- Slice ID: SRP-025
- Title: Exercise manage-page controls, not just visibility
- Findings addressed: `STC-TI-008`
- Problem: E2E coverage verifies visible controls but not that important manage
  actions call the right endpoint and update UI state.
- Minimal fix strategy: Add Playwright tests with route mocks and visible state
  assertions for a small group of high-value controls. Keep each test tied to
  one user action.
- Files likely affected: `apps/operate/panel/test/e2e/panel.spec.ts`,
  possibly e2e fixtures.
- Behavior affected: None intended unless tests expose unwired controls.
- Tests to add/update: RCON autocomplete select, history use, history clear,
  favorite edit/delete/launch, workshop collection validation, loading/error
  state, and disabled button state.
- Verification commands: `cd apps/operate/panel && npm run test:e2e`.
- Risk level: medium
- Rollback strategy: Revert brittle e2e tests and replace with narrower route
  tests if Playwright state setup becomes unstable.
- Definition of Done: At least one meaningful action per major manage-page
  control group is proven by network request and visible UI outcome.

### SRP-026

- Slice ID: SRP-026
- Title: Decide optional operator feature scope
- Findings addressed: `STC-MC-001`, `STC-MC-002`, `STC-MC-003`
- Problem: RCON autocomplete, persisted history, and workshop favorites are
  cross-layer convenience features with `UNCLEAR` active operator need.
- Minimal fix strategy: Investigate actual usage through docs, git history,
  issue/PR notes, and operator workflows. Do not delete or harden heavily until
  a keep/remove decision exists for each feature.
- Files likely affected: `apps/operate/panel/routes/operator.ts`,
  `apps/operate/panel/db.ts`, `apps/operate/panel/public/ts/manage.ts`,
  `apps/operate/panel/views/manage.ejs`, tests, migration docs if a follow-up
  removal is approved.
- Behavior affected: None during investigation; later slices may remove or
  harden individual optional features.
- Tests to add/update: If retained, autocomplete failure states, history
  semantics, favorite scoping, and e2e controls. If removed, raw RCON command
  entry and one-shot workshop launch regressions.
- Verification commands: `rg -n "autocomplete|rcon_command_history|workshop_favorites|rcon/history|workshop-favorites" .`.
- Risk level: medium
- Rollback strategy: If evidence is inconclusive, keep the feature and only
  address correctness/fail-loud gaps.
- Definition of Done: Each optional feature has a recorded keep/remove decision
  backed by current repository or operator evidence.

### SRP-027

- Slice ID: SRP-027
- Title: Prove or remove `DEFAULT_PORT` compatibility
- Findings addressed: `STC-MC-007`
- Problem: `DEFAULT_PORT` is a second port config name without visible current
  docs evidence.
- Minimal fix strategy: Search live docs, examples, CI, compose/systemd files,
  and git history. If unused, remove the fallback and add tests for `PORT` and
  default `3000`; otherwise document it as compatibility.
- Files likely affected: `apps/operate/panel/app.ts`, env/docs examples, startup
  tests.
- Behavior affected: Panel bind-port configuration.
- Tests to add/update: `PORT` respected, default `3000` used when unset,
  `DEFAULT_PORT` behavior removed or documented.
- Verification commands: `rg -n "DEFAULT_PORT" .`; `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run typecheck`.
- Risk level: medium
- Rollback strategy: Restore `DEFAULT_PORT` fallback if hidden deployment usage
  is found after removal.
- Definition of Done: There is only one documented port contract, or the alias
  is explicitly documented and tested as compatibility.

### SRP-028

- Slice ID: SRP-028
- Title: Prove or simplify Redis host/port aliases
- Findings addressed: `STC-MC-008`
- Problem: Redis can be configured by `REDIS_URL` or host/port aliases, widening
  production config state.
- Minimal fix strategy: Search examples and deployment docs. If aliases are not
  required, standardize on `REDIS_URL`; if required, document and test both
  forms.
- Files likely affected: `apps/operate/panel/app.ts`,
  `apps/operate/panel/utils/redis.ts`, `.env.example`, docs, startup tests.
- Behavior affected: Production Redis endpoint configuration.
- Tests to add/update: Production startup with `REDIS_URL`, missing Redis config
  fail-closed behavior, and alias behavior only if retained.
- Verification commands: `rg -n "REDIS_HOST|REDIS_PORT|REDIS_URL" .`; `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Restore host/port alias handling if deployment usage is
  found.
- Definition of Done: Redis config has one preferred contract and all retained
  compatibility shapes are documented and tested.

### SRP-029

- Slice ID: SRP-029
- Title: Prove or constrain full CSP override
- Findings addressed: `STC-MC-010`
- Problem: Full `CONTENT_SECURITY_POLICY` replacement is a broad security
  extension point with `UNCLEAR` deployment need.
- Minimal fix strategy: Search deployment docs/history for custom CSP usage. If
  absent, remove the full override. If present, constrain customization to
  documented additions that preserve nonce-based scripts.
- Files likely affected: `apps/operate/panel/app.ts`,
  `apps/operate/panel/.env.example`, security-header tests, docs.
- Behavior affected: Security headers and asset-loading policy.
- Tests to add/update: Default nonce-based CSP header, asset loading e2e, and
  retained CSP customization behavior if any.
- Verification commands: `rg -n "CONTENT_SECURITY_POLICY" .`; `cd apps/operate/panel && npm test && npm run test:e2e`.
- Risk level: high
- Rollback strategy: Restore the full override only if a real deployment
  contract requires it and tests prove the safe shape.
- Definition of Done: CSP customization cannot silently replace the secure
  default unless that behavior is explicitly documented and tested.

### SRP-030

- Slice ID: SRP-030
- Title: Prove or remove `RCON_AUTH_TIMEOUT_MS` runtime knob
- Findings addressed: `STC-MC-009`
- Problem: `RCON_AUTH_TIMEOUT_MS` appears production-facing but the audit found
  evidence mainly from tests.
- Minimal fix strategy: Search docs/history for operator usage. If absent, use a
  fixed production auth timeout and make tests deterministic without a deployable
  env knob. If present, document and test the knob as runtime config.
- Files likely affected: `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/test/rcon-manager.test.ts`, docs/env examples if retained.
- Behavior affected: RCON auth timeout configurability.
- Tests to add/update: Auth timeout, successful auth, command timeout, and
  optional runtime env parsing only if retained.
- Verification commands: `rg -n "RCON_AUTH_TIMEOUT_MS" .`; `cd apps/operate/panel && npm test -- --test-name-pattern RconManager`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: medium
- Rollback strategy: Restore env parsing if real slow-auth deployments require
  the knob.
- Definition of Done: Auth timeout behavior is deterministic and not exposed as
  accidental production configuration.

### SRP-031

- Slice ID: SRP-031
- Title: Decide whether `scripts/validate.sh` is public compatibility
- Findings addressed: `STC-MC-012`
- Problem: `scripts/validate.sh` only delegates to `scripts/verify.sh`, but it
  may be an external compatibility command.
- Minimal fix strategy: Search live docs, CI, tests, archive references, and git
  history. If not public, remove or stop testing the alias. If public, document
  it as a compatibility alias and avoid treating it as a separate verifier.
- Files likely affected: `scripts/validate.sh`, `scripts/verify.sh`,
  `.github/workflows/ci.yml`, `apps/operate/panel/test/scripts.test.ts`, docs.
- Behavior affected: Root verification command surface.
- Tests to add/update: Root verifier smoke; alias test only if retained as a
  public contract.
- Verification commands: `rg -n "scripts/validate.sh|validate.sh --require-docker|./scripts/validate.sh" .`; `./scripts/verify.sh`.
- Risk level: low code risk, medium compatibility risk
- Rollback strategy: Restore the wrapper if external users still call it.
- Definition of Done: The repository has one canonical verifier and any retained
  alias is intentionally documented.

### SRP-032

- Slice ID: SRP-032
- Title: Decide whether pinned shell-tool downloader is required
- Findings addressed: `STC-MC-013`
- Problem: The updater ships a pinned shellcheck/shfmt downloader while CI uses
  package-manager installation.
- Minimal fix strategy: Decide whether manual reproducibility or supply-chain
  control requires the downloader. If not, remove it and document package-manager
  setup. If yes, wire CI to it or document why it is manual-only.
- Files likely affected: `apps/maintain/updater/scripts/ci-install-tools.sh`,
  `apps/maintain/updater/scripts/ci-tools-versions.env`,
  `apps/maintain/updater/CONTRIBUTING.md`, `.github/workflows/ci.yml`.
- Behavior affected: Contributor tool bootstrap, not updater runtime.
- Tests to add/update: None if removed after docs/tooling update; otherwise a
  downloader smoke may be needed if CI adopts it.
- Verification commands: `rg -n "ci-install-tools|ci-tools-versions" .`; `cd apps/maintain/updater && make lint && make security`.
- Risk level: medium
- Rollback strategy: Restore downloader files and docs if contributor setup
  depends on them.
- Definition of Done: There is one intentional shell-tool installation path, or
  the manual-only path is explicitly justified.

### SRP-033

- Slice ID: SRP-033
- Title: Decide CommonJS deprecation and Node mock-helper contract
- Findings addressed: `STC-MC-015`, `STC-MC-019`
- Problem: The panel suppresses TypeScript deprecations for CommonJS config, and
  tests carry Node 26 compatibility while package engines declare Node 22.
- Minimal fix strategy: Make a build/runtime contract decision before changing
  module format or mock helpers. Either keep CommonJS with explicit rationale and
  Node 22-only tests, or plan a separate NodeNext/ESM migration.
- Files likely affected: `apps/operate/panel/tsconfig.json`,
  `apps/operate/panel/package.json`,
  `apps/operate/panel/test/mock-module.ts`, CI config if matrix changes.
- Behavior affected: Build/test/runtime module format.
- Tests to add/update: Full build/test/e2e/startup checks under the declared
  Node version; optional newer Node smoke only if support is intended.
- Verification commands: `cd apps/operate/panel && node -v && npm run build && npm run build:client && npm test && npm run test:e2e`.
- Risk level: high
- Rollback strategy: Keep current CommonJS config and mock helper until a full
  migration plan exists.
- Definition of Done: The module format and Node test-helper behavior match the
  declared engine contract without unexplained future-compatibility branches.

### SRP-034

- Slice ID: SRP-034
- Title: Reassess RCON password provider and lazy DB seam after RCON tests
- Findings addressed: `STC-MC-016`
- Problem: `RconManager` has an optional password-provider seam and lazy DB
  import that may exist mostly for tests/import order.
- Minimal fix strategy: Complete SRP-013 and SRP-014 first. Then prove whether
  multiple production password sources exist. If not, make the dependency
  explicit without changing the RCON state machine.
- Files likely affected: `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/test/rcon-manager.test.ts`, route tests.
- Behavior affected: RCON password lookup dependency shape; no command semantics
  should change.
- Tests to add/update: Password lookup, reconnect/password rotation, auth
  failure, timeout, shutdown, compiled startup smoke.
- Verification commands: `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run build`.
- Risk level: high
- Rollback strategy: Keep the seam if tests or startup import order depend on it
  in a way that cannot be simplified safely.
- Definition of Done: The RCON password dependency is explicit and justified,
  or the seam is retained with documented production/test reason.

### SRP-035

- Slice ID: SRP-035
- Title: Separate pure server ID parsing from route access side effects
- Findings addressed: `STC-MC-017`
- Problem: `parseServerId` mixes pure ID parsing with Express responses,
  session checks, lazy DB statements, and authorization side effects.
- Minimal fix strategy: First ensure authorization tests cover missing, invalid,
  unauthorized, and authorized cases. Then keep parsing pure and move access
  checks to route/auth-owned helpers without creating a broader framework.
- Files likely affected: `apps/operate/panel/utils/parseServerId.ts`,
  `apps/operate/panel/routes/server.ts`,
  `apps/operate/panel/routes/status.ts`,
  `apps/operate/panel/routes/operator.ts`, route tests.
- Behavior affected: Internal helper ownership; route response behavior must not
  change.
- Tests to add/update: Parser unit tests, route authorization tests for params
  and body IDs, missing/invalid IDs, inaccessible server, authorized server.
- Verification commands: `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run typecheck`.
- Risk level: medium
- Rollback strategy: Revert helper movement if any route response or access
  behavior drifts.
- Definition of Done: `parseServerId` is pure or the remaining side effects are
  explicitly owned by route/auth code and covered by tests.

### SRP-036

- Slice ID: SRP-036
- Title: Inline `makeMultiPresetRoute`
- Findings addressed: `STC-MC-004`
- Problem: A generic route factory hides two simple preset endpoints.
- Minimal fix strategy: Inline `/api/set-startmoney` and `/api/set-roundtime`
  handlers directly, reusing existing command-sequence behavior without adding a
  new abstraction.
- Files likely affected: `apps/operate/panel/routes/game/helpers.ts`,
  `apps/operate/panel/routes/game/controls.ts`, game route tests.
- Behavior affected: None intended.
- Tests to add/update: Existing preset value success/failure tests and partial
  command failure behavior.
- Verification commands: `cd apps/operate/panel && npm test -- --test-name-pattern set-startmoney`; `cd apps/operate/panel && npm test -- --test-name-pattern set-roundtime`; if unsupported, `cd apps/operate/panel && npm test`.
- Risk level: low
- Rollback strategy: Restore the helper and call sites if direct handlers drift
  in response behavior.
- Definition of Done: The two endpoints are direct and tests prove identical
  validation, status, logging, and partial-failure behavior.

### SRP-037

- Slice ID: SRP-037
- Title: Inline browser server ID context
- Findings addressed: `STC-MC-005`
- Problem: A single manage-page server ID is hidden behind mutable module state.
- Minimal fix strategy: Pass the server ID into manage-page initialization or
  read it once from the DOM locally. Do not add a new context layer.
- Files likely affected: `apps/operate/panel/public/ts/context.ts`,
  `apps/operate/panel/public/ts/console.ts`,
  `apps/operate/panel/public/ts/manage.ts`, client/e2e tests.
- Behavior affected: Browser initialization path only.
- Tests to add/update: Manage page initializes with server ID and at least one
  server-scoped action sends the correct ID.
- Verification commands: `cd apps/operate/panel && npm run build:client`; `cd apps/operate/panel && npm run test:e2e`.
- Risk level: medium
- Rollback strategy: Restore the context module if initialization order cannot
  be made explicit in one slice.
- Definition of Done: Server ID flow is direct and tests fail if actions send an
  empty or stale server ID.

### SRP-038

- Slice ID: SRP-038
- Title: Deduplicate browser JSON request helpers
- Findings addressed: `STC-MC-006`
- Problem: Browser code has multiple JSON request helpers with overlapping CSRF,
  401 redirect, and error parsing behavior.
- Minimal fix strategy: Extend one existing helper just enough for current
  method/body needs and replace duplicate local helpers. Do not create a generic
  request framework.
- Files likely affected: `apps/operate/panel/public/ts/common.ts`,
  `apps/operate/panel/public/ts/manage.ts`,
  `apps/operate/panel/public/ts/servers.ts`, client/e2e tests.
- Behavior affected: Browser request error handling and redirects; intended
  behavior should stay the same.
- Tests to add/update: POST command, GET players/history/favorites, PATCH
  favorite, DELETE favorite/history, 401 redirect, non-JSON error fallback.
- Verification commands: `cd apps/operate/panel && npm run build:client`; `cd apps/operate/panel && npm test`; `cd apps/operate/panel && npm run test:e2e`.
- Risk level: medium
- Rollback strategy: Revert helper consolidation if any request behavior drifts.
- Definition of Done: One request helper covers current call sites and tests
  prove CSRF, 401, JSON, and error fallback behavior.

### SRP-039

- Slice ID: SRP-039
- Title: Rename and split utility tests around intent
- Findings addressed: `STC-TI-017`
- Problem: Some utility tests assert useful examples but names describe trivia,
  and some route tests bundle unrelated contracts.
- Minimal fix strategy: Rename/group tests by policy and split unrelated route
  behaviors without changing production code.
- Files likely affected: `apps/operate/panel/test/game-helpers.test.ts`,
  `apps/operate/panel/test/parse-server-id.test.ts`,
  `apps/operate/panel/test/rcon-response.test.ts`,
  `apps/operate/panel/test/game-routes.test.ts`.
- Behavior affected: None.
- Tests to add/update: Preserve existing examples while grouping by canonical ID
  parsing, safe ASCII RCON commands, display sanitization, backup parsing, and
  player action boundaries.
- Verification commands: `cd apps/operate/panel && npm test`.
- Risk level: low
- Rollback strategy: Revert test renames/splits if they obscure rather than
  clarify intent.
- Definition of Done: Tests still cover the same edge cases, but each test name
  states the behavior or risk it protects.

## Recommended Execution Order

1. `SRP-001` through `SRP-003`: fix false health/status certainty first.
2. `SRP-004` through `SRP-006`: add missing tests for important server/game
   success behavior before changing those flows.
3. `SRP-007` through `SRP-012`: fix high-risk false-success paths in game,
   backup, raw RCON, history, and credential handling.
4. `SRP-013` and `SRP-014`: strengthen RCON protocol and lifecycle tests before
   simplifying RCON internals.
5. `SRP-015` through `SRP-018`: fix updater ordering, active-service proof, and
   config uncertainty.
6. `SRP-019` through `SRP-025`: close important test-intent gaps across
   favorites, CSRF, migrations, verification command behavior, source-string
   tests, and manage-page controls.
7. `SRP-026` through `SRP-034`: run investigation slices for optional features,
   compatibility paths, config aliases, module format, and RCON seams.
8. `SRP-035` through `SRP-039`: do low-risk simplification after behavior is
   protected.

## P0/P1 Slices

No P0 slice exists in the source audit.

P1 slices:

- `SRP-001`: RCON init and health readiness.
- `SRP-002`: server-list unknown/timed-out API states.
- `SRP-003`: dashboard/manage status uncertainty.
- `SRP-004`: add-server persistence/access/encryption/RCON tests.
- `SRP-005`: delete-server shared access and cleanup outcomes.
- `SRP-006`: game route command-sequence tests.
- `SRP-007`: truthful unverified game-control wording.
- `SRP-008`: setup-game requested versus observed state.
- `SRP-009`: backup route uncertainty.
- `SRP-010`: raw RCON partial success.
- `SRP-012`: RCON credential decrypt classification.
- `SRP-013`: RCON protocol fixture.
- `SRP-014`: RCON lifecycle transitions.
- `SRP-015`: updater ordered operations test log.
- `SRP-016`: updater post-start active proof.
- `SRP-018`: updater test-only knob separation.
- `SRP-019`: workshop favorite scoping and DB error classification.
- `SRP-021`: SQLite constraint/index/cascade tests.
- `SRP-025`: manage-page controls behavior.

## Low-Risk Quick Wins

These should still wait until nearby behavior is covered:

- `SRP-020`: representative CSRF matrix.
- `SRP-024`: replace source-string tests with behavior/docs-lint checks.
- `SRP-031`: decide `scripts/validate.sh` compatibility.
- `SRP-036`: inline `makeMultiPresetRoute`.
- `SRP-039`: rename and split utility tests around intent.

## Blocked Or Uncertain Items

Do not implement deletion/simplification for these until the investigation slice
has evidence:

- Optional operator features: `SRP-026`.
- `DEFAULT_PORT`: `SRP-027`.
- Redis host/port aliases: `SRP-028`.
- Full CSP override: `SRP-029`.
- `RCON_AUTH_TIMEOUT_MS`: `SRP-030`.
- `scripts/validate.sh`: `SRP-031`.
- Pinned shell-tool downloader: `SRP-032`.
- CommonJS/Node mock-helper contract: `SRP-033`.
- RCON password provider/lazy DB seam: `SRP-034`, blocked on `SRP-013` and
  `SRP-014`.
- SQLite migration compatibility removal: `SRP-022`, blocked until the support
  window is defined and migration tests exist.

## Final Verification Plan

Per-slice verification should run the narrowest relevant checks listed in the
slice. After a cluster of related slices, run the broader gate for that area.

Panel cluster verification:

- `cd apps/operate/panel && npm run format:check`
- `cd apps/operate/panel && npm run lint`
- `cd apps/operate/panel && npm run typecheck`
- `cd apps/operate/panel && npm run build`
- `cd apps/operate/panel && npm run build:client`
- `cd apps/operate/panel && npm test`
- `cd apps/operate/panel && npm run test:e2e`
- `cd apps/operate/panel && npm run validate -- --require-docker`

Updater cluster verification:

- `cd apps/maintain/updater && make lint`
- `cd apps/maintain/updater && make test`
- `cd apps/maintain/updater && make security`
- `cd apps/maintain/updater && make ci`

Repository verification after implementation slices:

- `./scripts/verify.sh`

Do not claim full remediation unless every completed slice has its targeted
tests passing, skipped checks are named, and any remaining uncertain findings
are still marked as blocked or investigation-only.
