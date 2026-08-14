# Test Intent Audit

Date: 2026-05-26

This audit reviews whether the current test suite verifies intent rather than
implementation trivia. It is docs-only. No production code or tests were
changed.

## Scope And Evidence Standard

Included:

- Panel tests under `apps/operate/panel/test`.
- Panel E2E tests under `apps/operate/panel/test/e2e`.
- Panel test scripts in `apps/operate/panel/package.json` and
  `apps/operate/panel/playwright.config.ts`.
- Updater shell tests under `apps/maintain/updater/tests`.
- Updater test stubs under `apps/maintain/updater/tests/bin`.

Excluded:

- `node_modules`, `dist`, coverage output, test result output, and screenshots.
- External live CS2/RCON/SteamCMD/systemd behavior. Those are called out as
  remaining uncertainty where current tests use fakes or stubs.

The worktree already contained many modified and untracked files before this
audit. Findings reflect the current local files.

## Findings

### TIA-001

- Test file: `apps/operate/panel/test/scripts.test.ts`
- Test name / symbol: `docs reflect the live auth contract and umbrella module scope`; `.gitignore keeps validation and regression tests tracked`; `admin user template avoids raw innerHTML assignment for API data insertion`
- Production behavior supposedly protected: documentation stays aligned with auth behavior, test files remain tracked, and admin user rendering avoids XSS.
- Why the current test is weak or missing: Lines 97-141 read docs, `.gitignore`, templates, and source as strings. These tests can fail after a safe wording/refactor change, and they can pass while runtime behavior is broken. The XSS source-string check at lines 120-124 also only blocks `.innerHTML =`, not other unsafe HTML sinks.
- If the business/runtime behavior changed incorrectly, would this test fail? Mostly no. Runtime auth, tracking, or XSS behavior can regress while the checked strings still match.
- What meaningful behavior should be tested: Auth and CSRF behavior through HTTP requests; admin username rendering through DOM execution tests; repository tracking through a lightweight docs/repo hygiene check outside behavior tests.
- Example better test description: `admin user list renders malicious usernames as text and does not execute embedded markup`.
- Edge cases to include: `insertAdjacentHTML`, template interpolation, malicious username with event handler, missing CSRF for authenticated mutation, and docs lint only for intentional public-contract text.
- Risk level: medium
- Confidence: high

### TIA-002

- Test file: `apps/operate/panel/test/scripts.test.ts`
- Test name / symbol: `server route keeps add-server limiter Redis-capable`
- Production behavior supposedly protected: add-server rate limiting uses Redis-capable storage in production.
- Why the current test is weak or missing: Lines 133-141 grep source for `RateLimitRedisStore`, `makeRateLimitStore`, and `store: makeRateLimitStore()`. This mirrors implementation structure instead of proving the add-server limiter actually uses the configured store or fails safely without Redis.
- If the business/runtime behavior changed incorrectly, would this test fail? No. The source strings could remain while the limiter is not wired correctly at runtime; a safe refactor could also break the test.
- What meaningful behavior should be tested: In production-like config, repeated add-server attempts should be rate-limited using the configured Redis store or fail closed when required Redis configuration is unavailable.
- Example better test description: `production add-server limiter blocks excess attempts through the configured rate-limit store`.
- Edge cases to include: missing Redis config in production, Redis store factory failure, fallback behavior in test/development, and per-IP/per-session limit isolation.
- Risk level: high
- Confidence: high

### TIA-003

- Test file: `apps/operate/panel/test/server-crud.test.ts`
- Test name / symbol: `POST /api/add-server succeeds with valid data`; `POST /api/add-server accepts private LAN IPs for self-hosted servers`
- Production behavior supposedly protected: adding a server persists the server, grants user access, stores the RCON password safely, probes credentials, and connects RCON.
- Why the current test is weak or missing: Lines 70-123 only assert HTTP `201` and a success message. Production code does much more: validates/resolves the host, probes RCON, encrypts the password, inserts the server and `server_access`, connects RCON, and returns failure on connection issues (`routes/server.ts:184-264`).
- If the business/runtime behavior changed incorrectly, would this test fail? No, not if the route still returns `201` and the same message while skipping persistence, access grants, encryption, or connection.
- What meaningful behavior should be tested: The row exists with the expected owner/access, the stored RCON value is encrypted when a key is configured, `probeServer` and `connectServer` receive the saved server, and `/api/servers` shows the newly added server only to authorized users.
- Example better test description: `add-server persists an accessible server and refuses false success when RCON cannot connect`.
- Edge cases to include: duplicate existing server grants access without duplicating row, server limit, DNS rebinding rejection, encrypted stored password, failed probe, failed post-save connect, and private LAN acceptance.
- Risk level: high
- Confidence: high

### TIA-004

- Test file: `apps/operate/panel/test/server-crud.test.ts`
- Test name / symbol: `GET /api/servers returns server list for authenticated user`
- Production behavior supposedly protected: authenticated users see only their accessible servers with truthful hostname/connection state.
- Why the current test is weak or missing: Lines 351-366 only assert status `200` and that `body.servers` is an array. It does not assert ownership/access filtering, server identity, hostname fallback, connection flags, or RCON timeout behavior. Production code builds a per-user list and probes hostname state (`routes/server.ts:267-305`).
- If the business/runtime behavior changed incorrectly, would this test fail? No. It would pass if the endpoint returned an empty array, leaked another user's server, or always marked servers disconnected.
- What meaningful behavior should be tested: A user sees their own accessible server, does not see another user's server, and gets truthful connected/authenticated/hostname state from the RCON boundary.
- Example better test description: `server list returns only accessible servers and preserves unknown RCON state as unknown/disconnected`.
- Edge cases to include: no servers, shared server access, inaccessible server, RCON hostname failure, slow hostname probe timeout, and no false connected/authenticated flags.
- Risk level: high
- Confidence: high

### TIA-005

- Test file: `apps/operate/panel/test/server-crud.test.ts`
- Test name / symbol: missing successful delete-server coverage; existing tests cover only `POST /api/delete-server returns 404 for non-existent server` and unauthenticated delete.
- Production behavior supposedly protected: deleting a server removes the requesting user's access, deletes orphan server rows, and calls `rcon.removeServer` only when the server is no longer shared.
- Why the current test is weak or missing: Lines 387-426 cover 404 and unauthenticated requests, but no test covers the success path in `routes/server.ts:344-359`.
- If the business/runtime behavior changed incorrectly, would this test fail? No current test would fail if successful deletion stopped removing access, deleted a shared server for all users, or failed to remove an orphaned RCON connection.
- What meaningful behavior should be tested: Deleting as one user removes only that user's access when another user still has access; deleting the final access removes the server and calls `rcon.removeServer`.
- Example better test description: `delete-server removes only the caller's access and tears down RCON after the last user is removed`.
- Edge cases to include: shared server, orphan server, inaccessible server, malformed `server_id`, and failed `rcon.removeServer`.
- Risk level: high
- Confidence: high

### TIA-006

- Test file: `apps/operate/panel/test/game-routes.test.ts`
- Test name / symbol: `POST /api/setup-game succeeds with valid payload`; `POST /api/workshop-map succeeds with a valid workshop id`; `POST /api/say-admin succeeds with a valid message`
- Production behavior supposedly protected: successful game/operator routes send the correct RCON commands and persist any required state.
- Why the current test is weak or missing: The setup-game success case at lines 287-309 only checks status/message before a separate failure subcase. Workshop map at lines 408-424 only checks status. Say-admin at lines 909-927 only checks status/message. Production behavior sends `exec`, optional team names, `changelevel`, `host_workshop_map`, and `say` commands (`routes/game/match.ts:169-178`, `routes/game/match.ts:514-531`, `routes/game/match.ts:627-642`).
- If the business/runtime behavior changed incorrectly, would this test fail? No, not if the route still returns success while sending the wrong command, omitting a command, or failing to persist setup selection.
- What meaningful behavior should be tested: Exact safe RCON command sequence for each route, no command when validation fails, and persistence of setup-game selection after successful application.
- Example better test description: `setup-game executes cfg before map change and stores the selected mode only after all RCON commands succeed`.
- Edge cases to include: team-name sanitization, cfg failure before map change, RCON failure after partial command sequence, malicious map/workshop IDs, and command output errors.
- Risk level: high
- Confidence: high

### TIA-007

- Test file: `apps/operate/panel/test/app.test.ts`
- Test name / symbol: setup-game map matrix tests, for example `POST /api/setup-game: wingman accepts wingman map`, `ctf accepts ctf map`, `bhop accepts bhop map`, `gungame accepts gungame map`, `deathmatch accepts active duty map`, `oitc accepts oitc map`, and `1v1arenas accepts arena map`
- Production behavior supposedly protected: each game mode only accepts appropriate maps and applies the selected map/mode to the server.
- Why the current test is weak or missing: The acceptance tests around lines 578-1023 generally assert only `res.status === 200`. They do not verify the `exec` and `changelevel` commands, persisted `last_*` state, or ordering. Rejection tests are stronger because they assert error text and no status success.
- If the business/runtime behavior changed incorrectly, would this test fail? No, not if the endpoint returns `200` while not changing the map, using the wrong cfg, or not persisting the selection.
- What meaningful behavior should be tested: For each representative mode, success must execute the right config and map command and store the selected mode/map only after RCON success.
- Example better test description: `wingman setup applies wingman cfg and changelevel for an allowed wingman map`.
- Edge cases to include: cfg missing, map command failure, coming-soon mode, invalid characters, and state not updated on partial failure.
- Risk level: high
- Confidence: high

### TIA-008

- Test file: `apps/operate/panel/test/game-routes.test.ts`
- Test name / symbol: `workshop favorites CRUD is scoped to the authenticated user and server`
- Production behavior supposedly protected: workshop favorites are scoped by authenticated user and server and cannot be read, updated, or deleted across boundaries.
- Why the current test is weak or missing: Lines 781-832 create/list/update/delete a favorite for one authenticated user and one server. It does not create a second user or second server to prove scoping, despite the test name claiming scope. Production route queries filter by `userId` and `serverId` (`routes/operator.ts:242-305`).
- If the business/runtime behavior changed incorrectly, would this test fail? No. Cross-user or cross-server leaks could pass this test.
- What meaningful behavior should be tested: A favorite created by one user/server is invisible to another user/server, and update/delete by a different user or inaccessible server returns 404/403 without mutation.
- Example better test description: `workshop favorites cannot be listed, updated, or deleted outside the owning user/server scope`.
- Edge cases to include: duplicate workshop ID conflict, invalid favorite ID, invalid workshop ID/name, inaccessible server, second user, second server, and CSRF on PATCH/DELETE.
- Risk level: high
- Confidence: high

### TIA-009

- Test file: `apps/operate/panel/test/game-routes.test.ts`
- Test name / symbol: `RCON history stores successful commands only and prunes to 50 unique commands`
- Production behavior supposedly protected: only successful raw RCON commands are stored, history is per user/server, and pruning keeps the newest 50 unique commands.
- Why the current test is weak or missing: Lines 840-886 send 55 successful `/api/rcon` commands and one `/api/say-admin`; they prove pruning and that say-admin is not history, but they do not simulate a failed `/api/rcon` command. The "successful commands only" part is therefore under-tested.
- If the business/runtime behavior changed incorrectly, would this test fail? Partially. It would catch pruning/order regressions, but not a bug that records failed raw RCON commands.
- What meaningful behavior should be tested: Failed raw RCON commands, blocked commands, and commands for another user/server are not present in the current user's history.
- Example better test description: `RCON history records only successful raw RCON commands for the current user and server`.
- Edge cases to include: RCON execution throws, blocked command, duplicate command increments count, second user/server isolation, clear history, and malformed server ID.
- Risk level: medium
- Confidence: high

### TIA-010

- Test file: `apps/operate/panel/test/e2e/panel.spec.ts`
- Test name / symbol: `manage page exposes RCON-only status, players, favorites, and history states`
- Production behavior supposedly protected: the manage UI exposes and wires operator controls for status, players, RCON autocomplete/history, workshop favorites, quick commands, and practice controls.
- Why the current test is weak or missing: Lines 124-154 check headings, error text, saved favorite display, empty history text, Suggest button visibility, and collapsed-section visibility. Browser code has real click handlers for autocomplete, history use/clear, workshop favorite launch/edit/delete, workshop collection load, and RCON send (`public/ts/manage.ts:644-783`, `public/ts/manage.ts:840-1003`), but the E2E test does not exercise most of those controls.
- If the business/runtime behavior changed incorrectly, would this test fail? Mostly no. Buttons could be visible but unwired, or could call the wrong endpoint, and this test would still pass.
- What meaningful behavior should be tested: User actions produce the expected network request and visible state change, including loading, empty, error, and success states.
- Example better test description: `RCON history Use and Clear buttons update the command input and persisted history through the UI`.
- Edge cases to include: autocomplete refresh failure, selecting a suggestion, history use/clear, favorite edit/delete/launch, workshop collection validation, collapsed sections, toast errors, and disabled/loading button state.
- Risk level: high
- Confidence: high

### TIA-011

- Test file: `apps/operate/panel/test/app.test.ts`, `apps/operate/panel/test/game-routes.test.ts`, `apps/operate/panel/test/user-management.test.ts`, `apps/operate/panel/test/server-crud.test.ts`
- Test name / symbol: missing broad CSRF contract matrix; existing explicit failures are `POST /api/add-server rejects missing CSRF token on authenticated session` and `POST /api/add-server rejects wrong CSRF token on authenticated session`
- Production behavior supposedly protected: every authenticated state-changing route requires CSRF, except documented login behavior.
- Why the current test is weak or missing: `app.ts:230-244` applies global CSRF enforcement, and many tests send `x-csrf-token`, but explicit missing/wrong-token tests cover only add-server (`app.test.ts:1126`, `app.test.ts:1153`). The suite does not enumerate all state-changing routes, including PATCH/DELETE routes under `operator.ts`.
- If the business/runtime behavior changed incorrectly, would this test fail? Partially. A global middleware break would likely fail add-server, but a newly mounted or specially handled state-changing route could be exempt without a test failing.
- What meaningful behavior should be tested: A table of representative state-changing routes rejects missing and wrong CSRF while `/auth/login` remains deliberately exempt before session establishment.
- Example better test description: `authenticated state-changing routes reject missing CSRF tokens across server, game, user, and operator modules`.
- Edge cases to include: POST, PATCH, DELETE, form `_csrf`, JSON `x-csrf-token`, logout, login exemption, unauthenticated requests, and routes mounted after middleware.
- Risk level: medium
- Confidence: medium

### TIA-012

- Test file: `apps/operate/panel/package.json`
- Test name / symbol: `npm test` command uses `--test-force-exit`
- Production behavior supposedly protected: tests should expose leaked timers, sockets, RCON handles, and unclosed DB resources.
- Why the current test is weak or missing: The test command at `package.json:21` runs Node's test runner with `--test-force-exit`. That can hide dangling handles from RCON heartbeat intervals, HTTP servers, Redis clients, SQLite handles, or test setup/teardown mistakes.
- If the business/runtime behavior changed incorrectly, would this test fail? No, not for many leaked-handle regressions. The process may force-exit instead of showing the leak.
- What meaningful behavior should be tested: Suites should shut down cleanly without forced exit, or have explicit leak tests for known long-lived resources.
- Example better test description: `panel test suite exits without forced shutdown after all RCON managers and app servers are closed`.
- Edge cases to include: RCON heartbeat interval cleanup, failed test cleanup paths, DB close, Redis client quit, HTTP server close, and pending authentication timeout.
- Risk level: medium
- Confidence: high

### TIA-013

- Test file: `apps/operate/panel/test/rcon-manager.test.ts`, `apps/operate/panel/test/game-routes.test.ts`, `apps/operate/panel/test/server-crud.test.ts`, `apps/operate/panel/test/status.test.ts`
- Test name / symbol: RCON tests using `mockModule('../modules/rcon.js', ...)` or `mockModule('rcon-srcds', ...)`
- Production behavior supposedly protected: the panel speaks to SRCDS RCON correctly and handles real socket/auth/command lifecycle failures.
- Why the current test is weak or missing: Route/status/server tests mock the RCON module, and `rcon-manager.test.ts` uses a `FakeRcon` class (`rcon-manager.test.ts:35-67`). The fakes are useful, but no current test exercises a real RCON protocol peer or a socket-level fake that validates packet framing/authentication semantics.
- If the business/runtime behavior changed incorrectly, would this test fail? No for protocol-level regressions in `rcon-srcds` interaction, event ordering, socket closure, or packet parsing.
- What meaningful behavior should be tested: A local protocol-level fake or integration fixture should verify authentication failure, delayed auth, command response, socket close, timeout, and reconnect semantics at the RCON boundary.
- Example better test description: `RconManager reports false success as failure when the RCON peer closes during authentication`.
- Edge cases to include: auth timeout, bad password, command timeout, socket close before auth, socket close during command, reconnect after heartbeat failure, queued command during shutdown, and multiple servers.
- Risk level: high
- Confidence: medium

### TIA-014

- Test file: `apps/operate/panel/test/rcon-manager.test.ts`
- Test name / symbol: missing shutdown/remove/heartbeat state-transition coverage
- Production behavior supposedly protected: RCON queues, heartbeat intervals, `removeServer`, and `shutdownAll` cleanly transition state without stale sockets or false connected state.
- Why the current test is weak or missing: Current RCON manager tests cover host revalidation, auth failure, auth timeout settlement, and per-server command serialization (`rcon-manager.test.ts:108-212`). Production has queueing, heartbeat backoff, interval cleanup, `removeServer`, and `shutdownAll` behavior (`modules/rcon.ts:110`, `modules/rcon.ts:293-347`, `modules/rcon.ts:462-471`) that is not directly asserted.
- If the business/runtime behavior changed incorrectly, would this test fail? No for many shutdown, remove, heartbeat, or stale-state regressions.
- What meaningful behavior should be tested: Removing or shutting down a server clears intervals, destroys sockets, rejects or drains queued commands predictably, and makes `hasConnection`/`getConnectionInfo` truthful.
- Example better test description: `shutdownAll clears heartbeat timers and prevents queued commands from reporting success after shutdown`.
- Edge cases to include: shutdown with queued command, remove while command in flight, heartbeat failure backoff, reconnect failure, multi-server isolation, and repeated shutdown/remove calls.
- Risk level: high
- Confidence: high

### TIA-015

- Test file: `apps/maintain/updater/tests/run.sh`, `apps/maintain/updater/tests/bin/systemctl`, `apps/maintain/updater/tests/bin/steamcmd`
- Test name / symbol: `run_case "update-applied"`, `run_case "update-failed"`, `unchanged buildid after update`, `start failure after update`
- Production behavior supposedly protected: updater stops the service before SteamCMD update, applies the update, verifies build ID, and restarts the service in the right order.
- Why the current test is weak or missing: The updater tests assert that `systemctl.calls` contains `stop` and `start` and that SteamCMD calls happened in separate files (`tests/run.sh:176-207`, `tests/run.sh:510-550`). The `systemctl` and `steamcmd` stubs record to different files (`tests/bin/systemctl:13-27`, `tests/bin/steamcmd:16-18`), so the tests do not prove global ordering across service stop, app update, build ID verification, and service start.
- If the business/runtime behavior changed incorrectly, would this test fail? No, not if stop/start/update all happen but in the wrong order.
- What meaningful behavior should be tested: A single ordered event log should show service status check, stop, SteamCMD update, build ID verification, and start in the required order.
- Example better test description: `updater stops the service before app_update and restarts only after build ID verification succeeds`.
- Edge cases to include: update failure, unchanged build ID, start failure, initially inactive service, dry-run, and unknown remote build ID.
- Risk level: high
- Confidence: high

### TIA-016

- Test file: `apps/maintain/updater/tests/run.sh`
- Test name / symbol: `-c FILE config loading`; `config file multi-key and comments`; `empty SERVICE_NAME normalized`
- Production behavior supposedly protected: config file parsing applies documented keys, ignores comments safely, and normalizes defaults intentionally.
- Why the current test is weak or missing: The `-c FILE config loading` case writes only `DRY_RUN=0`, which matches the normal default in the surrounding test setup, then asserts only exit code (`run.sh:500-508`). The multi-key config includes `BOGUS_KEY=evil` but only asserts success (`run.sh:616-640`). `empty SERVICE_NAME normalized` only checks for generic `Update process` output (`run.sh:360-362`).
- If the business/runtime behavior changed incorrectly, would this test fail? Often no. Config loading could be ignored and still pass when values match defaults; unknown-key behavior is not asserted either way.
- What meaningful behavior should be tested: A config file value that changes behavior should be observed in side effects, and unknown keys should have an explicit expected behavior: reject, warn, or ignore.
- Example better test description: `--config applies DRY_RUN=1 from file and prevents stop/update/start unless CLI overrides it`.
- Edge cases to include: quoted values, whitespace, comments, duplicate keys, unknown keys, removed keys, config path validation, CLI override precedence, and empty default normalization.
- Risk level: medium
- Confidence: high

### TIA-017

- Test file: `apps/operate/panel/test/migrations.test.ts`
- Test name / symbol: migration tests for fresh/current schemas
- Production behavior supposedly protected: SQLite migrations create and preserve the current schema safely.
- Why the current test is weak or missing: The fresh database test at lines 101-116 checks `user_version` and the presence of a few columns. The current schema fixture at lines 183-240 checks only that `user_version` remains 3. Production schema includes foreign keys, unique constraints, indexes, and cascade behavior (`db.ts:53`, `db.ts:140-145`, `db.ts:194-218`).
- If the business/runtime behavior changed incorrectly, would this test fail? No for missing indexes, missing foreign key enforcement, missing cascade behavior, or weakened uniqueness constraints.
- What meaningful behavior should be tested: Migrations enforce required constraints and indexes, and cascade deletes keep server access, favorites, and history consistent.
- Example better test description: `current migrations enforce server uniqueness and cascade dependent rows when users or servers are deleted`.
- Edge cases to include: duplicate server IP/port, duplicate favorite command constraints, deleting users/servers, foreign key enforcement on invalid references, and index existence for query paths.
- Risk level: high
- Confidence: high

### TIA-018

- Test file: `apps/operate/panel/test/rcon-secret.test.ts`
- Test name / symbol: RCON secret encryption/decryption tests
- Production behavior supposedly protected: stored RCON passwords are encrypted/decrypted safely and fail closed on invalid encrypted data.
- Why the current test is weak or missing: The tests cover roundtrip, plaintext fallback with no key, and encrypted payload without key (`rcon-secret.test.ts:23-52`). Production decryption also parses payload format and relies on AES-GCM authentication (`utils/rconSecret.ts:63-75`), but tests do not cover malformed encrypted payloads, wrong keys, tampered tag/ciphertext, invalid key formats, or caching behavior after env changes.
- If the business/runtime behavior changed incorrectly, would this test fail? Partially. It would catch basic roundtrip failure, but not fail-open behavior for tampered encrypted data or invalid keys.
- What meaningful behavior should be tested: Tampered encrypted secrets and wrong keys throw, invalid key formats fail fast, and cached key reset behavior is explicit in tests.
- Example better test description: `decryptRconSecret rejects tampered encrypted passwords instead of returning corrupted plaintext`.
- Edge cases to include: missing segments, non-hex IV/tag/data, wrong key, modified tag, modified ciphertext, invalid base64/hex key, and env key rotation.
- Risk level: high
- Confidence: high

### TIA-019

- Test file: `apps/operate/panel/test/game-helpers.test.ts`, `apps/operate/panel/test/parse-server-id.test.ts`, `apps/operate/panel/test/rcon-response.test.ts`
- Test name / symbol: utility one-liner output tests such as `returns 0 for number 0`, `returns string for valid string "1"`, and `returns fallback for empty string`
- Production behavior supposedly protected: request helpers reject unsafe input and display helpers avoid misleading or unsafe UI text.
- Why the current test is weak or missing: Many test names describe only input/output examples, not the behavioral reason. Several assertions encode exact fallback values or direct helper outputs without naming the operator/security risk. The examples themselves are useful edge coverage, but a reader cannot always tell why the behavior matters.
- If the business/runtime behavior changed incorrectly, would this test fail? Often yes for the listed examples, but no for adjacent policy regressions not represented by those examples. Some safe UX changes, such as a different non-empty fallback label, could fail without a behavior break.
- What meaningful behavior should be tested: Group examples by policy: IDs must be canonical positive integers; RCON commands must remain single safe ASCII commands; display helpers must remove invisible controls without executing markup.
- Example better test description: `server ID parsing rejects ambiguous IDs so route authorization cannot be bypassed`.
- Edge cases to include: canonical ID boundaries, empty/zero/negative/float/leading-zero IDs, invisible Unicode controls, command separators, exact max lengths, and display fallback semantics without over-coupling to a single glyph.
- Risk level: low
- Confidence: high

### TIA-020

- Test file: `apps/operate/panel/test/game-routes.test.ts`
- Test name / symbol: `GET /api/players/:server_id returns players and exercises command-boundary routes`; setup-game success/failure subcase combined in one test
- Production behavior supposedly protected: player parsing, player action command boundaries, and backup restore behavior.
- Why the current test is weak or missing: Lines 563-617 combine player listing, kick command behavior, invalid kick behavior, and latest-backup parsing. Lines 287-329 combine setup-game success and missing-cfg failure. The assertions are mostly meaningful, but unrelated behaviors in one test make failure diagnosis and intent harder.
- If the business/runtime behavior changed incorrectly, would this test fail? Yes for many covered behaviors, but the bundled names make it unclear which behavior matters and can hide missing edge cases.
- What meaningful behavior should be tested: Split unrelated runtime contracts so each test name states the behavior that would break for operators.
- Example better test description: `player kick accepts five-digit userids and does not send RCON for six-digit userids`.
- Edge cases to include: player list partial RCON failure, malformed userid, missing backup output, unsafe backup filename, and per-route access checks.
- Risk level: low
- Confidence: medium

### TIA-021

- Test file: `apps/operate/panel/test/game-helpers.test.ts`
- Test name / symbol: top-level Node version skip guard
- Production behavior supposedly protected: helper tests should run reliably on the supported Node engine.
- Why the current test is weak or missing: Lines 6-10 say `mock.module()` requires Node `>= 22.3`, but the guard only exits for major versions below 22. `package.json` allows Node `>=22 <23`, so Node 22.0-22.2 could try to run the tests despite the comment. The guard also exits the whole file with code 0, which can silently drop coverage on unsupported local runtimes.
- If the business/runtime behavior changed incorrectly, would this test fail? No. It is a test harness guard, not behavior coverage; on some runtimes it may skip coverage or fail for the wrong reason.
- What meaningful behavior should be tested: The suite should either enforce the exact supported Node minor version before running or avoid helper-file skips that silently reduce coverage.
- Example better test description: `test harness fails clearly when Node lacks mock.module support required by helper tests`.
- Edge cases to include: Node 22.0, Node 22.2, Node 22.3+, local newer Node, CI engine enforcement, and skipped-file reporting.
- Risk level: low
- Confidence: medium

## High-Risk Missing Tests

1. Successful add-server persistence/access/encryption/RCON connect behavior (`TIA-003`).
2. Successful delete-server shared-access/orphan cleanup behavior (`TIA-005`).
3. Successful game/workshop/say routes proving actual RCON commands and state persistence (`TIA-006`, `TIA-007`).
4. Workshop favorite cross-user and cross-server isolation (`TIA-008`).
5. Manage-page UI actions that prove visible controls are wired to behavior (`TIA-010`).
6. RCON protocol-level integration and shutdown/remove/heartbeat state transitions (`TIA-013`, `TIA-014`).
7. SQLite constraints, indexes, foreign keys, and cascade behavior after migrations (`TIA-017`).
8. RCON secret tamper/wrong-key/malformed-payload failures (`TIA-018`).
9. Updater stop/update/start ordering across systemd and SteamCMD stubs (`TIA-015`).

## Weak Tests To Rewrite

- `scripts.test.ts` source/docs string assertions should become runtime, DOM, or docs-lint checks depending on the contract (`TIA-001`, `TIA-002`).
- Server CRUD success tests should assert persisted rows, access scope, RCON interaction, and truthful list/delete behavior (`TIA-003`, `TIA-004`, `TIA-005`).
- Game route success tests should assert command sequence and persistence, not only HTTP success (`TIA-006`, `TIA-007`).
- Workshop favorites and RCON history tests should match their names by testing isolation and failed-command behavior (`TIA-008`, `TIA-009`).
- Updater config tests should choose non-default values and assert side effects rather than generic success output (`TIA-016`).
- Utility tests should keep their edge cases but rename/group them around the operator/security reason (`TIA-019`).
- Bundled route tests should be split when one name covers multiple unrelated contracts (`TIA-020`).

## Tests That Are Valuable And Should Be Preserved

- `apps/operate/panel/test/status.test.ts`: partial and failed RCON status tests should fail if the UI/API starts reporting unknown data as healthy or complete.
- `apps/operate/panel/test/rcon-manager.test.ts`: auth failure, auth timeout settlement, resolved-host revalidation, and per-server serialization protect runtime-critical behavior.
- `apps/operate/panel/test/network-validation.test.ts`: hostname/IP blocking and DNS resolution tests protect SSRF/control-plane boundaries.
- `apps/operate/panel/test/e2e/panel.spec.ts`: malicious admin username rendering should fail if markup executes or an image element is inserted.
- `apps/operate/panel/test/cfg-integrity.test.ts`: cfg/map config integrity tests should fail when a route points at a missing or unsafe cfg target.
- `apps/operate/panel/test/game-routes.test.ts`: multi-command partial failure tests should fail if partial success is reported as full success or command order changes.
- `apps/operate/panel/test/user-management.test.ts`: stale deleted-user and stale-admin-session tests should fail when authorization is cached incorrectly.
- `apps/maintain/updater/tests/run.sh`: unknown remote, unchanged build ID, start failure, dry-run, stale lock, disk-space, and secret-redaction tests protect real updater failure modes.
- `apps/operate/panel/test/migrations.test.ts`: unsupported historical schema failure is valuable because it should fail when migration boundaries become silent or unclear.

## Suggested Regression-Test Backlog

1. Add add-server integration tests that verify DB row, `server_access`, encrypted password, RCON probe/connect, and visible `/api/servers` output.
2. Add delete-server tests for shared access, orphan cleanup, and `rcon.removeServer`.
3. Add setup-game success tests that verify `exec` before `changelevel`, optional team-name sanitization, and no persisted state on partial RCON failure.
4. Add workshop-map, workshop-collection, and say-admin route tests that assert exact safe RCON commands and no command on invalid input.
5. Add workshop favorite isolation tests with two users and two servers.
6. Add RCON history tests for failed `/api/rcon`, blocked command, duplicate command count, user/server isolation, and clear behavior.
7. Add E2E tests for RCON autocomplete select, history use/clear, favorite edit/delete/launch, and workshop collection validation.
8. Add a table-driven CSRF matrix for representative POST/PATCH/DELETE routes across auth, server, game, user, and operator modules.
9. Add RCON manager state-transition tests for heartbeat failure, queued command during shutdown, remove during in-flight command, and multi-server isolation.
10. Add a protocol-level RCON fake or integration fixture that validates socket/auth/command lifecycle beyond class-level mocks.
11. Add migration constraint tests for unique indexes, foreign key enforcement, cascade deletes, and table indexes.
12. Add RCON secret tests for wrong key, tampered tag/ciphertext, malformed encrypted payload, and invalid key formats.
13. Add updater ordered event logging in stubs so service/update/start ordering is asserted.
14. Strengthen updater config tests with non-default config values and explicit unknown-key behavior.
15. Remove or justify `--test-force-exit`; add leak/teardown tests for RCON, Redis, DB, HTTP servers, and timers.

## Verification Commands

- Root broad verifier: `./scripts/verify.sh`
- Panel format: `cd apps/operate/panel && npm run format:check`
- Panel lint: `cd apps/operate/panel && npm run lint`
- Panel typecheck: `cd apps/operate/panel && npm run typecheck`
- Panel unit/integration tests: `cd apps/operate/panel && npm test`
- Panel E2E tests: `cd apps/operate/panel && npm run test:e2e`
- Panel validation: `cd apps/operate/panel && npm run validate -- --require-docker`
- Updater lint: `cd apps/maintain/updater && make lint`
- Updater tests: `cd apps/maintain/updater && make test`
- Updater security: `cd apps/maintain/updater && make security`
- Updater CI: `cd apps/maintain/updater && make ci`

No test command was run for this audit because the requested change was
documentation-only and the task was to inspect intent, not verify a code change.

## Remaining Uncertainty

- Active external RCON/CS2 integration coverage is UNCLEAR; current evidence shows mocks and stubs, not a real protocol peer.
- Whether `--test-force-exit` is masking known handles or only guarding CI timeouts is UNCLEAR.
- The intended behavior for unknown updater config keys is UNCLEAR; tests currently tolerate `BOGUS_KEY=evil` in a config fixture without asserting warning/failure.
- The oldest supported SQLite schema version and exact migration support window are UNCLEAR.
- Whether all current E2E tests are expected to be serial because of shared DB state is UNCLEAR.
- Whether Node 22.0-22.2 are genuinely supported despite the `mock.module` comment is UNCLEAR.
