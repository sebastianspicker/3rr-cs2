# Refactor and Code-Quality Plan

Date: 2026-05-26

Scope: this plan is derived from `AGENTS.md`, `docs/code-index.md`,
`docs/verification-baseline.md`, `docs/architecture-map.md`,
`docs/deprecation-and-simplification-audit.md`, and
`docs/logic-and-correctness-audit.md`.

Current verification state: PARTIAL. The root verifier is blocked by Docker
daemon access in the audited environment, and host-side panel tests are not
canonical because the host runs Node 26 while the panel requires Node `>=22 <23`.
All panel implementation slices below assume a supported Node 22 environment.

Execution rules:

- Use one slice per PR unless a slice explicitly says otherwise.
- Do not start behavior refactors until RP-001 gives a trusted verification
  baseline or records an external blocker that cannot be solved in code.
- Keep each slice limited to the files listed unless inspection proves an
  immediate caller/test must also change.
- Add tests that prove why the behavior matters. Avoid source-text assertions
  unless the invariant cannot be tested through behavior.
- Run the listed verification commands. If any command is skipped, record why in
  the PR and do not claim full verification.
- Do not delete compatibility paths or unused code unless the slice includes
  evidence that no active repo, CI, docs, or runtime path still depends on it.

## Prioritized Slices

### RP-001 - Re-establish a trusted verification baseline

- ID: RP-001
- Title: Re-establish a trusted verification baseline
- Problem: `docs/verification-baseline.md` shows the canonical root verifier
  failed before completing panel CI, Docker validation/smoke, updater checks,
  provision checks, and startup probes. Host-side panel tests also failed under
  unsupported Node 26 with a native SQLite ABI mismatch.
- Findings addressed: verification baseline blockers; prerequisite for all LCA
  and DSA fixes.
- Files affected: `docs/verification-baseline.md` only, unless a discovered
  verifier bug is isolated into a separate follow-up PR.
- Behavior affected: none.
- Public contracts affected: none.
- Storage/migration impact: none.
- Tests to add or update: none in this slice.
- Verification commands:
  - `./scripts/verify.sh` on a host with Docker daemon access, or
  - `cd apps/operate/panel && npm ci && npm run ci` under Node 22, plus
  - `cd apps/maintain/updater && make ci`.
- Rollback strategy: revert the documentation update if it records incorrect
  evidence.
- Risk level: low.
- Ordering rationale: verification must be trustworthy before correctness or
  cleanup PRs can be evaluated.
- Definition of Done: the baseline document states exactly what passes, fails,
  or remains blocked under Node 22 and Docker-capable verification, and no
  behavior PR relies on Node 26 host results as canonical.

### RP-002 - Remove deprecated Node test-mocking API usage

- ID: RP-002
- Title: Remove deprecated Node test-mocking API usage
- Problem: Panel tests emit deprecation warnings for `mock.module()` options
  `defaultExport` and `namedExports`, reducing trust in test output and creating
  future Node compatibility risk.
- Findings addressed: DSA-009.
- Files affected: affected files under `apps/operate/panel/test/*.test.ts`.
- Behavior affected: none expected; test harness only.
- Public contracts affected: none.
- Storage/migration impact: none.
- Tests to add or update: update existing mocks to use `exports` and keep the
  existing behavioral assertions intact.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the test-only PR.
- Risk level: low.
- Ordering rationale: this is verification infrastructure and should happen
  before relying on the full panel test suite for behavior fixes.
- Definition of Done: panel tests run under Node 22 without the deprecated
  `mock.module()` option warnings and with the same behavioral coverage.

### RP-003 - Make RCON add and reconnect fail truthfully

- ID: RP-003
- Title: Make RCON add and reconnect fail truthfully
- Problem: `/api/reconnect-server` and `/api/add-server` can return success
  after `RconManager.connectServer()` fails to establish an authenticated
  connection.
- Findings addressed: LCA-001.
- Files affected:
  - `apps/operate/panel/modules/rcon.ts`
  - `apps/operate/panel/routes/server.ts`
  - `apps/operate/panel/test/rcon-manager.test.ts`
  - `apps/operate/panel/test/server-crud.test.ts`
  - `apps/operate/panel/docs/API.md` if response contracts change.
- Behavior affected: failed post-probe reconnect/add attempts return an error
  instead of optimistic success.
- Public contracts affected: yes. Add/reconnect API response status or body may
  change for failed RCON connection attempts; document the compatibility impact.
- Storage/migration impact: none.
- Tests to add or update: route tests where `connectServer()` cannot establish
  a socket and RCON manager tests for explicit failure/result propagation.
- Verification commands:
  - `cd apps/operate/panel && npm run lint`
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
  - Manual smoke against an unreachable RCON endpoint when available.
- Rollback strategy: revert the RCON result/route PR; no data migration is
  involved.
- Risk level: high.
- Ordering rationale: this fixes a high-risk false-success state in the RCON
  runtime boundary.
- Definition of Done: a failed authenticated RCON connection cannot produce a
  successful add/reconnect response, and tests fail if optimistic success is
  reintroduced.

### RP-004 - Revalidate session users and admin state

- ID: RP-004
- Title: Revalidate session users and admin state
- Problem: `isAuthenticated` and `isAdmin` trust `req.session.user`, so deleted
  users or removed admins can retain access until session expiry.
- Findings addressed: LCA-002.
- Files affected:
  - `apps/operate/panel/modules/middleware.ts`
  - `apps/operate/panel/routes/users.ts` only if deletion/logout behavior must
    coordinate with middleware
  - `apps/operate/panel/test/user-management.test.ts`
  - `apps/operate/panel/docs/API.md` if auth failure behavior is documented.
- Behavior affected: stale sessions for deleted users or demoted admins are
  rejected or refreshed from storage.
- Public contracts affected: authenticated/admin access becomes stricter after
  user deletion or admin-state changes.
- Storage/migration impact: none unless inspection proves a session version
  column is required; prefer DB revalidation before schema changes.
- Tests to add or update: integration test that deletes a logged-in user and
  verifies subsequent protected/admin requests fail; test admin demotion if the
  route supports it.
- Verification commands:
  - `cd apps/operate/panel && npm run lint`
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the middleware/session PR.
- Risk level: high.
- Ordering rationale: stale privileged sessions are a silent authorization
  failure and should precede lower-risk UI or cleanup work.
- Definition of Done: deleted users and stale admin sessions no longer pass
  protected middleware, and tests prove the stale-session scenario.

### RP-005 - Represent partial RCON status honestly

- ID: RP-005
- Title: Represent partial RCON status honestly
- Problem: partial RCON observations can be labeled `authenticated`, and unknown
  player counts can render as `0`.
- Findings addressed: LCA-003.
- Files affected:
  - `apps/operate/panel/routes/status.ts`
  - `apps/operate/panel/public/ts/manage.ts`
  - `apps/operate/panel/public/ts/servers.ts`
  - `apps/operate/panel/test/status.test.ts`
  - browser or E2E tests covering status rendering.
- Behavior affected: status APIs and UI distinguish connection/auth state from
  data completeness, and unknown counts stay unknown.
- Public contracts affected: status JSON semantics may change; update
  `apps/operate/panel/docs/API.md` if documented response fields change.
- Storage/migration impact: none.
- Tests to add or update: partial-failure API tests and UI rendering tests for
  `status` failed while other RCON commands succeeded.
- Verification commands:
  - `cd apps/operate/panel && npm run build`
  - `cd apps/operate/panel && npm test`
  - `cd apps/operate/panel && npm run test:e2e`
- Rollback strategy: revert the status/API/UI PR.
- Risk level: medium.
- Ordering rationale: this removes a misleading healthy/authenticated UI state
  before cosmetic UI work.
- Definition of Done: partial RCON data cannot display as fully authenticated
  healthy status or as a zero-player count unless zero was actually observed.

### RP-006 - Report multi-command RCON partial failures explicitly

- ID: RP-006
- Title: Report multi-command RCON partial failures explicitly
- Problem: several controls issue multiple RCON commands and can leave the
  server partially changed while returning only a generic failure.
- Findings addressed: LCA-009.
- Files affected:
  - `apps/operate/panel/routes/game/controls.ts`
  - `apps/operate/panel/routes/game/helpers.ts`
  - related route tests under `apps/operate/panel/test/`.
- Behavior affected: multi-command controls either avoid hidden partial success
  where possible or report which command failed after earlier commands applied.
- Public contracts affected: error bodies for affected control routes may gain
  partial-failure detail; document if API docs cover them.
- Storage/migration impact: none.
- Tests to add or update: per-route tests that fail the second command and
  assert no false full-success response is returned.
- Verification commands:
  - `cd apps/operate/panel && npm run lint`
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
  - Manual RCON smoke for one affected control when a test server is available.
- Rollback strategy: revert the controls PR.
- Risk level: high.
- Ordering rationale: high-risk runtime control paths come before parsing
  cleanup and non-critical UI corrections.
- Definition of Done: tests prove second-command failures do not look like
  full success and expose enough detail for the operator or caller to know
  partial state may exist.

### RP-007 - Make numeric preset parsing strict

- ID: RP-007
- Title: Make numeric preset parsing strict
- Problem: `parseIntBody()` accepts trailing junk such as `"5abc"` and can send
  a valid-looking RCON command from malformed input.
- Findings addressed: LCA-004.
- Files affected:
  - `apps/operate/panel/routes/game/helpers.ts`
  - `apps/operate/panel/routes/game/controls.ts` only if callers need updated
    validation handling
  - `apps/operate/panel/test/game-helpers.test.ts`
  - related route tests.
- Behavior affected: malformed numeric strings are rejected instead of silently
  normalized.
- Public contracts affected: API callers sending non-integer strings now receive
  validation errors.
- Storage/migration impact: none.
- Tests to add or update: helper and route tests for suffix, prefix, decimal,
  empty, zero, allowed integer, and out-of-range values.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the parser/route validation PR.
- Risk level: medium.
- Ordering rationale: small correctness fix on a command boundary after the
  larger false-success RCON slices.
- Definition of Done: malformed numeric preset inputs cannot pass allowlists,
  and tests cover accepted and rejected boundary values.

### RP-008 - Align player userid parsing and action validation

- ID: RP-008
- Title: Align player userid parsing and action validation
- Problem: RCON parser accepts five-digit userids, but player action routes
  reject them.
- Findings addressed: LCA-005.
- Files affected:
  - `apps/operate/panel/utils/rconParsers.ts`
  - `apps/operate/panel/routes/game/match.ts`
  - `apps/operate/panel/test/rcon-parsers.test.ts`
  - player action route tests.
- Behavior affected: a userid rendered from RCON output is either accepted by
  player actions or consistently excluded earlier with clear behavior.
- Public contracts affected: player action validation may become less or more
  permissive at the five-digit boundary; document if API docs mention it.
- Storage/migration impact: none.
- Tests to add or update: parser plus route test for userid `10000` and
  invalid values around the chosen boundary.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the validation alignment PR.
- Risk level: medium.
- Ordering rationale: fixes a user-visible action failure caused by internal
  parser/schema disagreement.
- Definition of Done: parsed player IDs and route-accepted player IDs share one
  documented boundary, and tests prove the boundary.

### RP-009 - Parse latest-backup cvar output correctly

- ID: RP-009
- Title: Parse latest-backup cvar output correctly
- Problem: restore-latest can miss valid quoted `mp_backup_round_file_last`
  output and report no backup.
- Findings addressed: LCA-008.
- Files affected:
  - `apps/operate/panel/routes/game/match.ts`
  - related backup route or parser tests under `apps/operate/panel/test/`.
- Behavior affected: quoted and unquoted latest-backup cvar output is parsed
  before filename sanitization.
- Public contracts affected: none expected except fewer false negative
  restore-latest responses.
- Storage/migration impact: none.
- Tests to add or update: tests for quoted cvar output, unquoted `key=value`,
  empty output, malformed output, and unsafe filenames.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the parser/route PR.
- Risk level: medium.
- Ordering rationale: targeted silent wrong-result fix in a runtime command
  path.
- Definition of Done: valid quoted backup cvar output can trigger restore, and
  malformed or unsafe names still fail safely.

### RP-010 - Normalize default admin bootstrap username

- ID: RP-010
- Title: Normalize default admin bootstrap username
- Problem: bootstrap can store a whitespace-padded `DEFAULT_USERNAME` that the
  login route trims away, creating an unreachable default admin account.
- Findings addressed: LCA-011.
- Files affected:
  - `apps/operate/panel/db.ts`
  - `apps/operate/panel/routes/auth.ts` only if normalization must be shared
  - `apps/operate/panel/test/entrypoint.test.ts` or startup/bootstrap tests.
- Behavior affected: default admin usernames are trimmed and validated before
  storage, or startup fails clearly for invalid values.
- Public contracts affected: environment handling for `DEFAULT_USERNAME`
  becomes stricter and more explicit.
- Storage/migration impact: no migration for existing users in this slice; if
  existing bad bootstrap rows need cleanup, plan a separate storage slice.
- Tests to add or update: bootstrap tests for leading/trailing whitespace,
  whitespace-only username, and normal username.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the bootstrap normalization PR.
- Risk level: medium.
- Ordering rationale: prevents first-boot false success for admin setup after
  higher-risk RCON/session failures are addressed.
- Definition of Done: bootstrap cannot create an admin username that normal
  login normalization cannot find.

### RP-011 - Restore saved manage-page game selection

- ID: RP-011
- Title: Restore saved manage-page game selection
- Problem: the server route computes `lastGameType`, `lastGameMode`, and
  `lastMap`, but the rendered manage page initializes to first options instead
  of saved values.
- Findings addressed: LCA-006.
- Files affected:
  - `apps/operate/panel/routes/server.ts`
  - `apps/operate/panel/views/manage.ejs`
  - `apps/operate/panel/public/ts/manage.ts`
  - Playwright or DOM-level tests.
- Behavior affected: manage setup controls initialize from saved server state
  when the saved values are valid.
- Public contracts affected: none for HTTP API; visible UI behavior changes to
  honor persisted state.
- Storage/migration impact: none.
- Tests to add or update: E2E or DOM-level test that prepopulates
  `servers.last_*` and verifies selected controls after page load.
- Verification commands:
  - `cd apps/operate/panel && npm run build`
  - `cd apps/operate/panel && npm run test:e2e`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the route/view/browser PR.
- Risk level: medium.
- Ordering rationale: this is user-visible correctness, but it can wait until
  false-success RCON/session paths are fixed.
- Definition of Done: saved valid game setup state is rendered and selected on
  reload; invalid saved state falls back deliberately.

### RP-012 - Correct autocomplete cache-hit reporting

- ID: RP-012
- Title: Correct autocomplete cache-hit reporting
- Problem: first-time autocomplete fetches can report `cached: true` because the
  route calculates cache state after writing a fresh entry.
- Findings addressed: LCA-007.
- Files affected:
  - `apps/operate/panel/routes/operator.ts`
  - related route tests under `apps/operate/panel/test/`.
- Behavior affected: autocomplete responses distinguish fresh RCON observations
  from cache hits.
- Public contracts affected: `cached` field semantics become truthful.
- Storage/migration impact: none.
- Tests to add or update: first request `cached:false`, second request within
  TTL `cached:true`, refresh request `cached:false`.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the autocomplete PR.
- Risk level: low.
- Ordering rationale: low-risk correctness cleanup after higher-risk runtime
  command and auth work.
- Definition of Done: tests prove `cached` only means a pre-existing cache entry
  was used.

### RP-013 - Add CFG integrity coverage before changing modes

- ID: RP-013
- Title: Add CFG integrity coverage before changing modes
- Problem: `maps.json` references `oitc.cfg` and `1v1arenas.cfg`, while
  `live.cfg` pathing is unclear and tests mock RCON success without proving CFG
  availability.
- Findings addressed: LCA-010, DSA-003, DSA-004, DSA-005.
- Files affected:
  - `apps/operate/panel/cfg/maps.json`
  - `apps/operate/panel/cfg/*.cfg`
  - `apps/operate/panel/cfg/server-provided/live.cfg`
  - panel tests that validate CFG integrity
  - operator docs if external server-provided CFGs are intentional.
- Behavior affected: no mode should be accepted solely because mocked RCON says
  `ok`; each `exec` target must be present in repo-managed CFGs or explicitly
  documented as server-provided with runtime proof.
- Public contracts affected: game modes may be removed, added, renamed, or
  documented as external prerequisites. Document any mode availability change.
- Storage/migration impact: none.
- Tests to add or update: config integrity test for every `gm.exec` target and
  a targeted setup-game test that fails when an exec target is unsupported.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
  - Manual RCON `exec` smoke for any CFG intentionally marked server-provided.
- Rollback strategy: revert the CFG/test/docs PR; if mode availability changed,
  restore the previous `maps.json`.
- Risk level: medium.
- Ordering rationale: CFG deletion or mode cleanup needs proof first; this
  slice creates that proof before changing compatibility.
- Definition of Done: every `maps.json` exec target is either test-proven in the
  repo or explicitly documented and smoke-tested as server-provided.

### RP-014 - Make migration compatibility fixture-backed

- ID: RP-014
- Title: Make migration compatibility fixture-backed
- Problem: migration 2 may fail on historical DBs that already have
  `users.is_admin` with `PRAGMA user_version < 2`, but supported historical
  shapes are not proven by tests.
- Findings addressed: LCA-013, DSA-008.
- Files affected:
  - `apps/operate/panel/db.ts`
  - migration fixture tests under `apps/operate/panel/test/`
  - migration docs only if a compatibility boundary is intentionally narrowed.
- Behavior affected: existing supported SQLite files migrate predictably, or
  unsupported shapes fail with a clear compatibility error.
- Public contracts affected: SQLite migration compatibility boundary may be
  clarified; document any dropped compatibility.
- Storage/migration impact: potential migration behavior change. Use fixture
  DBs and back up any real DB before manual smoke.
- Tests to add or update: migration fixture tests for supported current,
  user_version 0/1, duplicate-column, and unsupported shapes.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
  - Manual startup smoke against copied historical DB fixtures if available.
- Rollback strategy: revert migration code and tests; restore DB from backup if
  manual smoke was run.
- Risk level: high.
- Ordering rationale: storage compatibility is high impact, but it should be
  addressed after the most direct runtime false-success issues and with fixtures
  before code changes.
- Definition of Done: supported migration inputs are explicit and tested, and
  duplicate-column or unsupported old DB behavior is deterministic.

### RP-015 - Make RCON authentication timeout deterministic

- ID: RP-015
- Title: Make RCON authentication timeout deterministic
- Problem: auth timeout currently depends on socket destruction to settle
  `authenticate()`, which may hang if the dependency never rejects.
- Findings addressed: LCA-014.
- Files affected:
  - `apps/operate/panel/modules/rcon.ts`
  - `apps/operate/panel/test/rcon-manager.test.ts`
- Behavior affected: RCON connect/probe/reconnect attempts settle within the
  configured auth timeout even if the dependency hangs.
- Public contracts affected: timeout failures should surface as existing RCON
  connection failures; document only if error messages/statuses change.
- Storage/migration impact: none.
- Tests to add or update: fake RCON client whose `authenticate()` never resolves
  and assertion that probe/connect settles within the auth timeout.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
  - Optional network blackhole/manual timeout smoke when available.
- Rollback strategy: revert the timeout PR.
- Risk level: medium.
- Ordering rationale: suspected but meaningful RCON liveness issue; schedule
  after confirmed false-success and migration risks.
- Definition of Done: tests prove auth timeout settlement without relying on
  dependency socket-destroy behavior.

### RP-016 - Isolate or justify the E2E seed route

- ID: RP-016
- Title: Isolate or justify the E2E seed route
- Problem: the test-only `/api/test/servers` route lives in the production app
  entrypoint behind environment gates.
- Findings addressed: DSA-011.
- Files affected:
  - `apps/operate/panel/app.ts`
  - `apps/operate/panel/playwright.config.ts`
  - E2E setup/helpers if the seed path moves
  - tests proving the route is unavailable outside E2E.
- Behavior affected: production app surface should not include test seed routes
  unless the current gating is deliberately retained and tested.
- Public contracts affected: none for production; E2E harness contract may
  change.
- Storage/migration impact: none.
- Tests to add or update: production-mode route absence test and E2E seed
  availability test under explicit E2E env.
- Verification commands:
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
  - `cd apps/operate/panel && npm run test:e2e`
- Rollback strategy: revert the E2E route isolation PR.
- Risk level: medium.
- Ordering rationale: defer until E2E verification is trusted, then simplify the
  app entrypoint without weakening test setup.
- Definition of Done: E2E seeding remains available only in the intended test
  environment, and production/test assertions prove the boundary.

### RP-017 - Replace low-signal source-text tests with behavior coverage

- ID: RP-017
- Title: Replace low-signal source-text tests with behavior coverage
- Problem: some tests assert regexes against source text rather than behavior,
  so they can pass while workflows break or fail during harmless refactors.
- Findings addressed: LCA-012.
- Files affected:
  - `apps/operate/panel/test/scripts.test.ts`
  - Playwright or DOM-level tests for login, add-server, admin-users, and risky
    manage controls.
- Behavior affected: none intended; test coverage becomes behavior-oriented.
- Public contracts affected: none.
- Storage/migration impact: none.
- Tests to add or update: add behavior tests first, then remove or narrow
  source-text assertions to true security invariants.
- Verification commands:
  - `cd apps/operate/panel && npm test`
  - `cd apps/operate/panel && npm run test:e2e`
- Rollback strategy: revert the test refactor PR.
- Risk level: low.
- Ordering rationale: useful test-quality work, but it should follow the
  correctness fixes whose behavior tests can replace brittle guards.
- Definition of Done: workflows previously guarded by source text have behavior
  tests, and remaining text tests document specific security invariants.

### RP-018 - Deduplicate security-sensitive RCON display sanitizers

- ID: RP-018
- Title: Deduplicate security-sensitive RCON display sanitizers
- Problem: server and browser code duplicate RCON display sanitization logic,
  which can drift in a security-sensitive display path.
- Findings addressed: DSA-014.
- Files affected:
  - server-side RCON response/sanitizer utilities
  - browser RCON display code under `apps/operate/panel/public/ts/`
  - sanitizer tests.
- Behavior affected: none intended; server and browser sanitization should stay
  equivalent.
- Public contracts affected: none if output is identical; document any escaping
  behavior change.
- Storage/migration impact: none.
- Tests to add or update: shared fixture tests for HTML special characters,
  control characters, long output, and already-escaped content.
- Verification commands:
  - `cd apps/operate/panel && npm run build`
  - `cd apps/operate/panel && npm test`
  - `cd apps/operate/panel && npm run test:e2e` for console display smoke if
    coverage exists.
- Rollback strategy: revert the sanitizer deduplication PR.
- Risk level: medium.
- Ordering rationale: simplify after correctness work, and only with tests
  because display sanitization is security-sensitive.
- Definition of Done: one tested sanitizer contract covers both server and
  browser display paths without changing intended escaping.

### RP-019 - Delete only proven-unused browser and type exports

- ID: RP-019
- Title: Delete only proven-unused browser and type exports
- Problem: `escapeHtml` and exported map config types appear unused in-repo, but
  deletion should happen only after reference checks confirm no active
  consumers.
- Findings addressed: DSA-001, DSA-002.
- Files affected:
  - `apps/operate/panel/public/ts/manage.ts` or the file exporting `escapeHtml`
  - `apps/operate/panel/types/config.ts`
  - tests only if imports need updates.
- Behavior affected: none expected.
- Public contracts affected: TypeScript exports may be removed; confirm they are
  not documented public API.
- Storage/migration impact: none.
- Tests to add or update: none unless an import is removed from tests; use
  deterministic reference checks as the main proof.
- Verification commands:
  - `rg "escapeHtml|MapConfig|GameTypeConfig|GameModeConfig" apps docs`
  - `cd apps/operate/panel && npm run typecheck`
  - `cd apps/operate/panel && npm test`
- Rollback strategy: revert the deletion PR.
- Risk level: low.
- Ordering rationale: cleanup waits until higher-risk correctness fixes are
  complete and usage evidence is clear.
- Definition of Done: reference checks show no active consumers, deleted exports
  are not public contracts, and typecheck/tests pass.

### RP-020 - Resolve exact compatibility helpers only with usage evidence

- ID: RP-020
- Title: Resolve exact compatibility helpers only with usage evidence
- Problem: several compatibility/manual paths may be obsolete, but current
  audits do not prove they are safe to delete.
- Findings addressed: DSA-006, DSA-007, DSA-016.
- Files affected: depending on proof:
  - `scripts/validate.sh`
  - updater removed-config warning code in `apps/maintain/updater/update_cs2.sh`
  - `apps/maintain/updater/scripts/ci-install-tools.sh`
  - `apps/maintain/updater/scripts/ci-tools-versions.env`
  - docs or CI files that reference those paths.
- Behavior affected: only the exact proven-obsolete compatibility/manual path
  should change; keep paths that still have active docs, CI, or operator usage.
- Public contracts affected: possible removal of root wrapper or updater
  warnings. Document any removed command/config compatibility.
- Storage/migration impact: none.
- Tests to add or update: updater tests for removed-config behavior if kept or
  changed; root verifier/docs tests if wrapper is removed.
- Verification commands:
  - `rg "validate.sh|NOTIFY_WEBHOOK_URL|NOTIFY_PLAYERS_MESSAGE|RCON_CLI|RCON_HOST|RCON_PORT|RCON_PASSWORD|ci-install-tools|ci-tools-versions" .github apps configs docs scripts`
  - `git log --all -- scripts/validate.sh apps/maintain/updater/scripts/ci-install-tools.sh apps/maintain/updater/scripts/ci-tools-versions.env`
  - `./scripts/verify.sh`
  - `cd apps/maintain/updater && make ci`
- Rollback strategy: revert the exact removal/change PR.
- Risk level: medium.
- Ordering rationale: cleanup of compatibility paths must wait for source and
  git-history evidence.
- Definition of Done: each changed path has explicit usage evidence, the PR
  either deletes it safely or keeps it with documented rationale, and root or
  updater verification passes.

## Deferred Items

These findings are not scheduled as immediate implementation slices because the
current evidence does not justify touching them before the correctness work
above.

- DSA-010: CommonJS/`ignoreDeprecations` module-system migration. Defer until
  panel tests and E2E are stable; this is broad and can create churn unrelated
  to current correctness risks.
- DSA-012: duplicate inline toast/POST handling. Defer until behavior coverage
  exists for the affected pages; do not introduce a shared abstraction for one
  or two call sites.
- DSA-013: duplicate `parsePort`. Defer unless a third usage or a real bug
  appears; two small local parsers may be cheaper than a new shared dependency.
- DSA-015: mixed-responsibility large files. Do not split broad files as a
  standalone cleanup. Extract only when an earlier slice needs a tested seam for
  behavior.
- DSA-017: duplicated RCON history response type. Defer unless a type drift bug
  appears or a nearby slice already touches both server and browser history code.

## Recommended First Implementation Slice

Start with RP-001. If Node 22 plus Docker-capable verification still fails for
repo reasons, create a separate small verifier-fix PR before RP-002. If RP-001
shows the only blockers are environmental and all canonical commands otherwise
pass, continue with RP-002 and then RP-003.
