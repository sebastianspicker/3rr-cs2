# Logic and Correctness Audit

Date: 2026-05-26

Scope: current working tree under `/Users/sebastian/Git/cs2-server-ops`.
This audit is documentation-only and did not modify production code or tests.

Priority: silent wrong behavior, false success states, runtime edge cases, and
tests that can pass while important behavior is broken. Intended behavior is
inferred only from code, tests, config, and active docs. Where behavior is
unclear, the issue is marked as suspected and lists verification needed.

## Commands Run

```text
git status --short
sed/nl/rg inspections across panel routes, RCON manager, utilities, browser TS,
  EJS views, panel tests, updater script, startup wrapper, and repo audit docs
npm run lint       # apps/operate/panel: passed
npm run typecheck  # apps/operate/panel: passed
make lint          # apps/maintain/updater: passed
```

Full tests and root verification were not run for this audit. The existing
`docs/verification-baseline.md` says the canonical root verifier is blocked by
Docker daemon access and host-side panel tests are blocked by a Node/native
SQLite mismatch.

## Confirmed Issues

### LCA-001 - Reconnect and add-server can report success after RCON connection failure

- Location: `apps/operate/panel/modules/rcon.ts:160-166`,
  `apps/operate/panel/modules/rcon.ts:346-366`,
  `apps/operate/panel/routes/server.ts:217-223`,
  `apps/operate/panel/routes/server.ts:229-236`,
  `apps/operate/panel/routes/server.ts:311-312`
- Evidence: `RconManager.connectServer()`awaits`reconnect()` but returns
  `void`. `connect()` logs and returns when no password is found or
  `createAuthenticatedConnection()`returns`null`. `/api/reconnect-server`
  then always returns `200 Reconnected successfully`after`await
  rcon.connectServer(server)`. `/api/add-server`also returns`201 Server added
  successfully`after`connectServer()`.
- Why it matters: Operators can see a successful reconnect/add-server response
  while the RCON socket is still absent. This is a false success state in a
  high-risk runtime path.
- Minimal reproduction or reasoning: Make `createAuthenticatedConnection()`
  return `null` after DNS revalidation, auth failure, timeout, or missing stored
  password. `connect()` returns without throwing, so the route sends success.
- Existing test coverage, if any: `rcon-manager.test.ts` covers blocked host
  revalidation by asserting no socket was created, but it does not require
  `connectServer()`to reject. Server CRUD tests mock`connectServer` as a
  no-op.
- Missing test that should exist: Route test where `connectServer()` resolves
  without creating a connection or rejects on failed auth, and `/api/reconnect-
  server` returns a non-success response with a clear error.
- Suggested minimal fix: Make `connectServer()` return a boolean/result or throw
  when no authenticated connection exists after reconnect. Have add/reconnect
  routes only report success on a verified connection.
- Risk level: high
- Verification command or strategy: Add focused `rcon-manager` and
  `server-crud`tests, then run`npm test` under Node 22 and a manual reconnect
  smoke against an unreachable RCON endpoint.
- Confidence: high

### LCA-002 - Deleted users can keep using stale authenticated/admin sessions

- Location: `apps/operate/panel/modules/middleware.ts:3-13`,
  `apps/operate/panel/routes/users.ts:38-44`,
  `apps/operate/panel/routes/users.ts:173-196`
- Evidence: `isAuthenticated`trusts`req.session.user`only.`isAdmin` trusts
  `req.session.user.is_admin` only. Deleting a user removes the DB row, but no
  middleware revalidates that the session user still exists or still has admin
  rights.
- Why it matters: A deleted user can remain authenticated until session expiry.
  A deleted admin session can continue to pass `isAdmin`, which can silently
  preserve privileges after account removal.
- Minimal reproduction or reasoning: Log in as user A, delete user A from a
  second admin session or directly from DB, then reuse A's cookie. Middleware
  sees `req.session.user` and continues.
- Existing test coverage, if any: User-management tests cover create/delete and
  admin/non-admin access, but no test reuses a deleted user's session.
- Missing test that should exist: Integration test deleting a logged-in user and
  verifying subsequent protected API/admin requests return 401/403 and the
  session is destroyed or refreshed from DB.
- Suggested minimal fix: Revalidate session user existence and admin status
  against SQLite in auth middleware or add a session version/revocation check.
- Risk level: high
- Verification command or strategy: Add a focused user-management integration
  test under Node 22, then run `npm test`.
- Confidence: high

### LCA-003 - Partial RCON status can be labeled as authenticated and unknown players as zero

- Location: `apps/operate/panel/routes/status.ts:39-88`,
  `apps/operate/panel/public/ts/manage.ts:1017-1026`,
  `apps/operate/panel/public/ts/servers.ts:148-160`
- Evidence: The status route sets `observed = true`if any of`status`,
  `hostname`, or `sv_visiblemaxplayers` succeeds, then returns
  `connected: observed`and`authenticated: observed`. The manage UI checks
  `connected && authenticated`before`data.error`, so partial results display
  `RCON authenticated`. The server list coerces `status.humans ?? 0`, so a
  status response with `humans: null`and`max_players: 12`displays`0/12`.
- Why it matters: If the hostname or cvar command succeeds but `status` fails,
  the UI can show an authenticated state and zero players even though player
  count is unknown.
- Minimal reproduction or reasoning: Mock `hostname`to fulfill and`status` to
  reject. The API returns `connected: true`, `authenticated: true`,
  `humans: null`, `error: "status unavailable"`. The manage headline says
  `RCON authenticated`; the server card player count can show `0/12`.
- Existing test coverage, if any: `status.test.ts` covers all-success and
  all-failure cases. E2E covers the all-failure state. No partial-failure case
  is asserted.
- Missing test that should exist: Partial RCON failure tests for API response
  semantics and browser rendering, especially `status` failed while
  `hostname`/`sv_visiblemaxplayers` succeeded.
- Suggested minimal fix: Return per-command observation flags or derive
  connected/authenticated from connection state separately from data
  completeness. In UI, prefer error/partial state over the authenticated label
  when `error`is non-null, and render unknown humans as`-`, not `0`.
- Risk level: medium
- Verification command or strategy: Add `status.test.ts` partial-failure tests
  and browser/server-card rendering checks; run `npm test` and Playwright E2E
  under Node 22.
- Confidence: high

### LCA-004 - Numeric preset parsing accepts trailing junk as valid values

- Location: `apps/operate/panel/routes/game/helpers.ts:100-101`,
  `apps/operate/panel/routes/game/helpers.ts:191-232`,
  `apps/operate/panel/routes/game/controls.ts:78-120`,
  `apps/operate/panel/routes/game/controls.ts:186-219`
- Evidence: `parseIntBody()`uses`parseInt(String(val), 10)`. JavaScript
  `parseInt("5abc", 10)`returns`5`. Allowlisted routes then accept the parsed
  value if `5` is in the allowlist.
- Why it matters: API callers can send malformed values that pass validation and
  execute a server command. The server silently normalizes invalid input rather
  than rejecting it.
- Minimal reproduction or reasoning: POST `/api/set-freezetime` with
  `{ "value": "5abc" }`; `parseIntBody`returns`5`, allowlist passes, and
  `mp_freezetime 5` is sent.
- Existing test coverage, if any: `game-helpers.test.ts`checks`"abc"` returns
  `NaN`and preset routes reject`999`, but it does not check trailing junk.
- Missing test that should exist: Unit test for `parseIntBody("5abc")` and route
  tests for string values with suffixes/prefixes on preset endpoints.
- Suggested minimal fix: Replace `parseIntBody` with strict integer parsing:
  accept finite numbers that are integers or strings matching `/^-?\d+$/`.
- Risk level: medium
- Verification command or strategy: Add helper and route tests, then run
  `npm test` under Node 22.
- Confidence: high

### LCA-005 - Player parser accepts 5-digit userids but player actions reject them

- Location: `apps/operate/panel/utils/rconParsers.ts:73-76`,
  `apps/operate/panel/utils/rconParsers.ts:106-114`,
  `apps/operate/panel/routes/game/match.ts:69-73`,
  `apps/operate/panel/routes/game/match.ts:431-447`
- Evidence: `parseUsersResponse()`accepts`userid` values matching
  `/^\d{1,5}$/`, but `PlayerUserIdBodySchema`for`/api/player-kick` accepts
  only `/^\d{1,4}$/`.
- Why it matters: The UI can render a player observed from RCON with a 5-digit
  userid, then the kick action rejects the exact userid the UI supplied.
- Minimal reproduction or reasoning: RCON `users` output contains userid
  `10000`; parser returns that player; kick button posts `{ userid: "10000" }`;
  the route returns 400.
- Existing test coverage, if any: Parser tests cover one- and low-digit
  userids. Player route tests cover a non-numeric invalid userid, not the 5-digit
  boundary.
- Missing test that should exist: Parser plus route integration test for userid
  `10000`, proving the UI-observed id is accepted or intentionally rejected with
  clear copy.
- Suggested minimal fix: Align the route schema with the parser if 5-digit
  userids are valid; otherwise constrain the parser and UI to the same max.
- Risk level: medium
- Verification command or strategy: Add `rcon-parsers` and player route tests,
  then run `npm test` under Node 22.
- Confidence: high

### LCA-006 - Manage page computes last game selection but the UI discards it

- Location: `apps/operate/panel/routes/server.ts:145-160`,
  `apps/operate/panel/views/manage.ejs:55-72`,
  `apps/operate/panel/public/ts/manage.ts:210-234`,
  `apps/operate/panel/public/ts/manage.ts:285-293`
- Evidence: The server route computes and passes `lastGameType`,
  `lastGameMode`, and `lastMap`. The EJS hidden inputs are rendered with empty
  values, and browser initialization always selects the first game type and the
  first mode returned by `/api/game-types/...`.
- Why it matters: The app stores last selected match setup state, but the
  operator sees defaults on reload. A deploy from that page can use a different
  type/mode/map than the persisted state implies.
- Minimal reproduction or reasoning: Create a game with a non-first game mode,
  reload `/manage/:server_id`, and observe the setup controls initialize to the
  first type/mode rather than the saved values.
- Existing test coverage, if any: Route tests verify `setup-game` updates DB
  state, but no EJS/browser test asserts that saved state is rendered and
  selected on reload.
- Missing test that should exist: Manage-page integration/E2E test where
  `servers.last_game_type`, `last_game_mode`, and `last_map` are prepopulated
  and the rendered controls select them.
- Suggested minimal fix: Render saved values into data attributes or hidden
  inputs and have `initGameSetup()` initialize from those values, falling back
  to first options only when saved values are absent/invalid.
- Risk level: medium
- Verification command or strategy: Add an E2E or DOM-level test and run
  Playwright under Node 22.
- Confidence: high

### LCA-007 - Autocomplete reports fresh data as cached

- Location: `apps/operate/panel/routes/operator.ts:126-164`,
  `apps/operate/panel/routes/operator.ts:211-228`
- Evidence: `loadAutocomplete()` returns either a cached entry or a newly
  fetched entry, but the route calculates `cached`as`!refresh && entry.expiresAt
  > Date.now()`. A newly fetched non-refresh response has a future`expiresAt`,
  so it reports`cached: true`.
- Why it matters: API consumers and UI diagnostics cannot tell whether
  autocomplete data was just observed from RCON or served from cache.
- Minimal reproduction or reasoning: First request to
  `/api/rcon/autocomplete/:server_id?q=sv`with no cache and no`refresh=1`
  fetches RCON output, stores it, and returns `cached: true`.
- Existing test coverage, if any: `game-routes.test.ts` checks suggestions and
  filtering with `refresh=1`, but does not assert `cached`.
- Missing test that should exist: First non-refresh request returns
  `cached:false`; second non-refresh request within TTL returns `cached:true`;
  refresh request returns `cached:false`.
- Suggested minimal fix: Have `loadAutocomplete()`return`{ entry, cached }`
  or calculate cache hit before fetching.
- Risk level: low
- Verification command or strategy: Add focused autocomplete route tests and run
  `npm test` under Node 22.
- Confidence: high

### LCA-008 - Restore-latest backup parser can miss valid quoted cvar output

- Location: `apps/operate/panel/routes/game/match.ts:297-315`
- Evidence: The route parses `mp_backup_round_file_last` with
  `text.split('=')[1]?.trim()` and passes that entire string to
  `sanitizeBackupFileName()`. Other parser code handles quoted cvar output such
  as `"sv_visiblemaxplayers" = "12"`; this route does not strip quotes or
  trailing metadata.
- Why it matters: A valid latest backup can be reported as `No latest backup
  found!`if RCON returns a quoted cvar line like`"mp_backup_round_file_last" =
  "backup001.txt"`.
- Minimal reproduction or reasoning: If RCON returns
  `"mp_backup_round_file_last" = "backup001.txt" ( def. "" )`, `rawFile` becomes
  `"backup001.txt" ( def. "" )`, which fails the safe `.txt` filename regex.
- Existing test coverage, if any: No tests reference `restore-latest-backup` or
  `mp_backup_round_file_last`.
- Missing test that should exist: Route/unit tests for plain `key=value`,
  quoted `"key" = "file.txt"`, empty, and malformed cvar output.
- Suggested minimal fix: Add a small parser for the cvar response that extracts
  the first quoted or unquoted value after `=`, then applies
  `sanitizeBackupFileName()`.
- Risk level: medium
- Verification command or strategy: Add parser/route tests, then run `npm test`
  under Node 22.
- Confidence: medium

### LCA-009 - Multi-command controls can partially apply state with only a generic failure

- Location: `apps/operate/panel/routes/game/controls.ts:49-65`,
  `apps/operate/panel/routes/game/controls.ts:84-96`,
  `apps/operate/panel/routes/game/controls.ts:109-120`,
  `apps/operate/panel/routes/game/controls.ts:186-219`,
  `apps/operate/panel/routes/game/helpers.ts:167-187`
- Evidence: Respawn, startmoney, roundtime, and overtime issue multiple RCON
  commands through `Promise.all`. Sequence routes issue commands one after
  another and return a generic 500 on any later failure. RCON manager serializes
  same-server commands, but there is no rollback or response detail that says
  which commands already applied.
- Why it matters: Operators can receive an error while the server is already in
  a partial state, for example CT respawn enabled and T respawn failed. This is
  not fully silent, but the response hides the partial state.
- Minimal reproduction or reasoning: Make the first respawn command succeed and
  the second fail. The route returns generic failure, but one convar changed.
- Existing test coverage, if any: `app.test.ts`covers`setup-game` avoiding
  `changelevel`when`exec` fails, but multi-command controls do not have
  partial-failure tests.
- Missing test that should exist: Per-route tests that fail the second command
  and assert either no partial mutation is possible or the response explicitly
  reports partial application.
- Suggested minimal fix: For routes where no atomic rollback is possible,
  execute sequentially and return explicit partial-failure details, or query the
  resulting state before reporting success.
- Risk level: high
- Verification command or strategy: Add targeted route tests with mocked RCON
  failure on the second command; run `npm test` under Node 22 and perform a
  manual RCON smoke for one multi-command control.
- Confidence: high

### LCA-010 - Setup-game tests can pass for modes whose cfg files are absent

- Location: `apps/operate/panel/cfg/maps.json:49-55`,
  `apps/operate/panel/routes/game/match.ts:133-160`,
  `apps/operate/panel/test/app.test.ts:936-947`,
  `apps/operate/panel/test/app.test.ts:983-1003`
- Evidence: `maps.json`references`oitc.cfg`and`1v1arenas.cfg`, but a
  `find apps/operate/panel/cfg -maxdepth 1` check found no matching cfg files.
  Acceptance tests for OITC and 1v1 assert HTTP 200 with mocked RCON returning
  `ok`; they do not verify that the referenced cfg exists on the server or in
  the repo.
- Why it matters: Tests can assert that a mode is accepted while a real server
  would fail at `exec <cfg>`. This is a misleading test and a runtime false
  success risk until deployment proof exists.
- Minimal reproduction or reasoning: Use the real route with a CS2 server that
  lacks `oitc.cfg`; validation passes, then RCON `exec oitc.cfg` fails or no-ops
  depending on server behavior.
- Existing test coverage, if any: Tests cover map pool allow/reject behavior and
  one `setup-game`failure before`changelevel`, but not cfg file availability.
- Missing test that should exist: A config integrity test that every `gm.exec`
  in `maps.json`is either present in`apps/operate/panel/cfg` or explicitly
  documented as server-provided, plus a runtime smoke for server-provided cfgs.
- Suggested minimal fix: Add cfg integrity validation/test. Then either add the
  missing cfgs, remove unsupported modes, or document them as external
  prerequisites and surface that in UI/docs.
- Risk level: medium
- Verification command or strategy: Add cfg integrity test; run `npm test` under
  Node 22; perform real RCON `exec` smoke for external cfgs.
- Confidence: high

### LCA-011 - Default admin bootstrap can create a username that login normalizes away

- Location: `apps/operate/panel/db.ts:192-240`,
  `apps/operate/panel/routes/auth.ts:20-37`
- Evidence: Bootstrap stores `DEFAULT_USERNAME`as`String(envUsername).slice(0,
  255)`without trimming. Login validates`username` before trimming, then
  queries with `rawUsername.trim()`.
- Why it matters: An env username with leading/trailing whitespace, or only
  whitespace, can create an admin row that cannot be reached by normal login
  input. On a first boot with no users, this can leave the panel with an
  unusable bootstrap account.
- Minimal reproduction or reasoning: Set `ALLOW_DEFAULT_CREDENTIALS=true` and
  `DEFAULT_USERNAME=" admin "`. DB stores `" admin "`. Login with either
  `"admin"`or`" admin "`trims to`"admin"` and cannot find the row.
- Existing test coverage, if any: User creation tests reject whitespace-only
  usernames through the admin route, but default bootstrap tests use clean
  usernames and do not cover trimming.
- Missing test that should exist: Entrypoint/bootstrap test for whitespace in
  `DEFAULT_USERNAME`, requiring either trim-before-store or fail-fast.
- Suggested minimal fix: Trim and validate `DEFAULT_USERNAME` before bootstrap;
  reject empty-after-trim values and store the normalized username.
- Risk level: medium
- Verification command or strategy: Add entrypoint/bootstrap tests under Node
  22, then run `npm test`.
- Confidence: high

### LCA-012 - Some tests assert source text instead of runtime behavior

- Location: `apps/operate/panel/test/scripts.test.ts:97-172`
- Evidence: Tests read docs/templates/source files and assert regex matches such
  as `form.addEventListener('submit')`, absence of `innerHTML`, and
  `store: makeRateLimitStore()`.
- Why it matters: These tests can pass while the user-visible workflow is
  broken, or fail during harmless refactors that preserve behavior. They are
  useful guardrails, but weak as correctness coverage.
- Minimal reproduction or reasoning: A login form could keep the asserted
  `addEventListener` text while posting the wrong JSON body or mishandling
  errors. Conversely, moving equivalent behavior to a shared module could fail
  the regex while behavior still works.
- Existing test coverage, if any: Some Playwright coverage exists for login and
  manage page states, but the text-assertion tests are not browser behavior
  tests.
- Missing test that should exist: Browser/integration tests that submit login,
  add-server, admin-users, and risky manage controls through their real DOM
  behavior.
- Suggested minimal fix: Keep text tests only for narrow security invariants
  that cannot be covered otherwise; add behavior tests for forms and admin-user
  rendering before relying on them as regression coverage.
- Risk level: low
- Verification command or strategy: Add Playwright or DOM-level tests and run
  `npm run test:e2e` under Node 22.
- Confidence: high

## Suspected Issues Needing Verification

### LCA-013 - Migration 2 may fail on old databases that already have `is_admin`

- Location: `apps/operate/panel/db.ts:62-123`
- Evidence: Migration 1 explicitly handles pre-migration server columns with
  `ALTER TABLE ... ADD COLUMN`wrapped in`try/catch`. Migration 2 unconditionally
  runs `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`.
- Why it matters: If any old DB has `users.is_admin`but`PRAGMA user_version <
  2`, startup would crash on a duplicate-column error. Whether such DBs exist is
  unclear from current code alone.
- Minimal reproduction or reasoning: Create a DB with `users(id, username,
  password, is_admin)`and`PRAGMA user_version = 1`, then import `db.ts`.
  SQLite should reject the duplicate `ADD COLUMN`.
- Existing test coverage, if any: No migration fixture tests were found for
  old/pre-migration DB shapes.
- Missing test that should exist: Migration tests for supported historical DB
  fixtures and explicit unsupported-shape failure messages.
- Suggested minimal fix: First decide supported DB compatibility. If the shape
  is supported, make migration 2 idempotent or detect existing columns. If not,
  fail with a clear migration-boundary error.
- Risk level: high
- Verification command or strategy: Needs git-history or runtime DB fixture
  verification. Inspect historical schemas, then run migration tests under Node
  22.
- Confidence: medium

### LCA-014 - RCON auth timeout relies on socket destruction to settle authentication

- Location: `apps/operate/panel/modules/rcon.ts:191-215`
- Evidence: The auth timeout sets `authCompleted = true`, logs, and destroys the
  socket, but the code still awaits `conn.authenticate(decryptedPassword)`.
  There is no `Promise.race` that directly rejects the auth wait.
- Why it matters: If `rcon-srcds`does not reject`authenticate()` on socket
  destruction in some network state, connect/probe/reconnect can hang rather
  than fail within `RCON_AUTH_TIMEOUT_MS`.
- Minimal reproduction or reasoning: Simulate or fake an RCON client whose
  `authenticate()` never resolves and whose connection destroy does not reject
  that promise. The timeout callback runs, but the `await` remains pending.
- Existing test coverage, if any: RCON manager tests cover host revalidation and
  command serialization, not auth timeout settlement.
- Missing test that should exist: Fake RCON class with never-resolving
  `authenticate()`and assertion that`probeServer()`/`connectServer()` settles
  within the auth timeout.
- Suggested minimal fix: Race `conn.authenticate()` against an explicit timeout
  promise that rejects, and clean up the socket in `finally`.
- Risk level: medium
- Verification command or strategy: Add a fake-client unit test; if possible,
  run a network blackhole/manual timeout smoke against an unroutable RCON port.
- Confidence: low

## Coverage Notes

- Updater and startup scripts were inspected for obvious silent-success paths.
  The updater already treats unknown remote build status as a hard stop before
  service downtime, so no confirmed updater correctness issue is listed here.
- Runtime CS2/RCON behavior was not exercised. Findings involving actual RCON
  command semantics need live or fixture-backed verification.
- Full root verification and panel test suites were not run in this audit turn;
  see `docs/verification-baseline.md` for current blockers.
