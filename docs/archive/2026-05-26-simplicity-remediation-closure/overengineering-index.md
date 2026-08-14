# Overengineering Index

Date: 2026-05-26

Scope: current working tree under `/Users/sebastian/Git/cs2-server-ops`.
This is a docs-only audit. It includes tracked and visible untracked source in
`apps/`, `scripts/`, `configs/`, root workflows, and relevant repository docs.
Generated/dependency/runtime artifacts such as `node_modules`, `dist`,
temporary SQLite databases, screenshots, and Docker/runtime outputs were not
audited as source.

Evidence standard: this index flags code that appears more complex than the
minimum required from current in-repo evidence. If active operator usage or
historical intent is not proven, the finding says `UNCLEAR`.

## Findings

### OE-001

- File: `apps/operate/panel/routes/operator.ts`; `apps/operate/panel/utils/rconParsers.ts`; `apps/operate/panel/public/ts/manage.ts`
- Symbol / function / class / module: `loadAutocomplete`, `/api/rcon/autocomplete/:server_id`, `parseAutocompleteOutput`
- Category: SPECULATIVE_FEATURE
- Evidence: `operator.ts:19-35` defines autocomplete cache state and TTL values.
  `operator.ts:131-172` runs both `cmdlist` and `cvarlist`, parses successful
  outputs, stores cache entries, and records partial errors. `operator.ts:218-240`
  exposes the autocomplete route. `rconParsers.ts:141-162` exists to parse that
  output. `manage.ts:644-660` calls the endpoint and `manage.ejs:225-238` adds a
  Suggest control and suggestions box. Current tests cover this feature, but the
  product need beyond UI/tests is `UNCLEAR`.
- Why this is more complex than necessary: a raw RCON console can work without a
  server-side command-discovery cache, parser, refresh flag, query filtering, and
  UI suggestion surface.
- Simpler alternative: remove autocomplete and keep only the raw RCON input, or
  replace dynamic discovery with a short static list of known safe commands if
  command discoverability is required.
- What could break if simplified: operators lose command suggestions; tests for
  autocomplete and the Suggest button would need removal or rewrite; any real
  workflow relying on `cmdlist`/`cvarlist` discovery would lose that convenience.
- Verification needed: `rg "rcon/autocomplete|parseAutocompleteOutput|rconSuggestions|rconSuggestRefreshBtn"`,
  panel typecheck/unit tests/e2e, and browser smoke for the RCON console.
- Confidence: medium

### OE-002

- File: `apps/operate/panel/utils/rconHistory.ts`; `apps/operate/panel/db.ts`; `apps/operate/panel/routes/operator.ts`; `apps/operate/panel/public/ts/manage.ts`
- Symbol / function / class / module: RCON command history storage and routes
- Category: SPECULATIVE_FEATURE
- Evidence: `db.ts:207-218` creates `rcon_command_history` with a uniqueness
  constraint and recency index. `rconHistory.ts:10-65` implements a hard-coded
  50-command limit, upsert, prune, list, and clear operations. `operator.ts:307-318`
  exposes list/clear endpoints. `match.ts:616-620` records successful raw RCON
  commands. `manage.ts:667-783` renders and clears history.
- Why this is more complex than necessary: the minimum console feature is "send a
  command and show output"; persisted per-user/per-server command history adds a
  table, migration, pruning transaction, API routes, UI state, and tests.
- Simpler alternative: remove persisted history, or keep a browser-local recent
  commands list if the goal is only operator convenience.
- What could break if simplified: operators lose cross-session command recall;
  existing SQLite databases retain an unused table unless a schema cleanup policy
  is defined; tests and e2e checks around history need updates.
- Verification needed: migration tests, RCON route tests, e2e manage-page checks,
  and a decision on whether unused SQLite tables are left in place or migrated.
- Confidence: medium

### OE-003

- File: `apps/operate/panel/routes/operator.ts`; `apps/operate/panel/db.ts`; `apps/operate/panel/views/manage.ejs`; `apps/operate/panel/public/ts/manage.ts`
- Symbol / function / class / module: workshop favorites CRUD
- Category: SPECULATIVE_FEATURE
- Evidence: `db.ts:193-205` creates `workshop_favorites`.
  `operator.ts:37-109` defines schemas and prepared statements for favorites.
  `operator.ts:242-304` exposes list/create/update/delete routes.
  `manage.ejs:84-97` renders favorites UI. `manage.ts:855-1003` implements
  render/load/save/edit/delete/launch behavior. The API reference documents
  `workshop-map` and `workshop-collection`, but current API docs do not document
  `workshop-favorites`; active operator need is `UNCLEAR`.
- Why this is more complex than necessary: loading a workshop map only requires a
  workshop ID input and one RCON command; saved favorites add persistent CRUD,
  schema, UI rendering, edit state, and route tests.
- Simpler alternative: keep only the one-shot Workshop URL/ID input. If favorites
  are still useful, prefer browser-local storage before committing server schema.
- What could break if simplified: users lose saved per-server favorites; tests
  and e2e state checks need updates; existing DB rows become unused unless
  cleanup is planned.
- Verification needed: confirm operator usage, update API/docs/tests, run panel
  migration/unit/e2e checks, and verify the workshop map one-shot flow still works.
- Confidence: medium

### OE-004

- File: `apps/operate/panel/routes/game/helpers.ts`; `apps/operate/panel/routes/game/controls.ts`
- Symbol / function / class / module: `makeMultiPresetRoute`
- Category: SINGLE_USE_ABSTRACTION
- Evidence: `helpers.ts:275-298` defines a generic route factory with an
  allowlist, async command-builder callback, and message-builder callback.
  Current call sites are the two endpoints in `controls.ts:84-95` and
  `controls.ts:106-117`.
- Why this is more complex than necessary: two concrete routes are routed through
  a callback-based mini-framework. The abstraction saves little code while making
  the command sequence harder to read at the endpoint.
- Simpler alternative: inline the two handlers, or use a narrow local helper that
  accepts the exact command list for start money and round time.
- What could break if simplified: validation, logging, status codes, and partial
  RCON sequence errors could drift from the other game-control routes.
- Verification needed: focused route tests for `/api/set-startmoney` and
  `/api/set-roundtime`, plus game helper tests for partial sequence behavior.
- Confidence: high

### OE-005

- File: `apps/operate/panel/public/ts/context.ts`; `apps/operate/panel/public/ts/console.ts`; `apps/operate/panel/public/ts/manage.ts`
- Symbol / function / class / module: module-scoped server ID context
- Category: SINGLE_USE_ABSTRACTION
- Evidence: `context.ts:1-10` stores one module-level `serverId`. `console.ts:8-11`
  sets it once from `#main[data-server-id]`. `manage.ts` imports `getServerId`
  and calls it throughout the manage-page handlers.
- Why this is more complex than necessary: the manage page has exactly one server
  ID, available from the DOM at initialization. A separate mutable context module
  hides that dependency.
- Simpler alternative: read the server ID once in `initManagePage()` and close
  over it, or call `initManagePage(serverId)` from `console.ts`.
- What could break if simplified: any manage-page action could send an empty or
  stale `server_id` if initialization order is changed incorrectly.
- Verification needed: TypeScript client check, build client bundle, and e2e
  manage-page smoke covering at least one server-scoped action.
- Confidence: high

### OE-006

- File: `apps/operate/panel/public/ts/common.ts`; `apps/operate/panel/public/ts/manage.ts`
- Symbol / function / class / module: `sendPostRequest`, `fetchJson`, `sendJson`
- Category: DUPLICATION
- Evidence: `common.ts:6-31` implements JSON POST with CSRF, 401 redirect, JSON
  error parsing, and typed success output. `manage.ts:103-135` reimplements CSRF
  headers, 401 redirect, JSON error parsing, and request dispatch for GET/PATCH/DELETE.
- Why this is more complex than necessary: two browser request helpers maintain
  the same session-expiry and error-message behavior with different method
  support.
- Simpler alternative: make one small `requestJson` helper with method/body
  options, then keep `sendPostRequest` only as a thin alias if needed.
- What could break if simplified: CSRF headers, 401 redirects, and non-JSON error
  fallback behavior could change on some manage-page requests.
- Verification needed: client typecheck/build, unit or browser checks for
  401/403/error responses, and e2e flows for RCON, favorites, history, and setup.
- Confidence: high

### OE-007

- File: `apps/operate/panel/app.ts`
- Symbol / function / class / module: `DEFAULT_PORT` fallback
- Category: COMPATIBILITY_SLOP
- Evidence: `app.ts:246` accepts `process.env.PORT || process.env.DEFAULT_PORT || 3000`.
  Current `.env.example` documents `PORT` only at `.env.example:5`, and
  `apps/operate/panel/README.md:43-50` documents `PORT` only. `rg "DEFAULT_PORT"`
  found no live code, docs, or tests outside this fallback and archived audit docs.
- Why this is more complex than necessary: two environment names configure the
  same listen port, but only one is part of the visible current contract.
- Simpler alternative: accept only `PORT`.
- What could break if simplified: hidden deployments that still set
  `DEFAULT_PORT` would silently fall back to `3000`.
- Verification needed: git-history check for `DEFAULT_PORT`, docs update if
  removed, startup test covering `PORT`, and a Docker/runtime smoke.
- Confidence: high

### OE-008

- File: `apps/operate/panel/utils/redis.ts`; `apps/operate/panel/app.ts`
- Symbol / function / class / module: `REDIS_HOST` / `REDIS_PORT` alternative to `REDIS_URL`
- Category: DUPLICATION
- Evidence: `redis.ts:10-13` builds `redisUrl` from either `REDIS_URL` or
  `REDIS_HOST` plus `REDIS_PORT`. `.env.example:7-9` lists all three variables.
  `apps/operate/panel/README.md:43-50` documents only `REDIS_URL`.
  `app.ts:125` still describes production Redis as `REDIS_URL (or REDIS_HOST/REDIS_PORT)`.
- Why this is more complex than necessary: two configuration shapes express the
  same Redis endpoint. The split host/port form also needs its own port parser.
- Simpler alternative: require `REDIS_URL` for Redis-backed sessions/rate limits.
- What could break if simplified: existing deployments using `REDIS_HOST` and
  `REDIS_PORT` would fail to configure Redis until migrated to `REDIS_URL`.
- Verification needed: docs/env contract update, startup tests for missing Redis
  in production, and Redis-enabled smoke or mocked startup coverage.
- Confidence: medium

### OE-009

- File: `apps/operate/panel/modules/rcon.ts`; `apps/operate/panel/test/rcon-manager.test.ts`
- Symbol / function / class / module: `RCON_AUTH_TIMEOUT_MS`
- Category: SPECULATIVE_FEATURE
- Evidence: `rcon.ts:15-20` reads `RCON_AUTH_TIMEOUT_MS` from the production
  environment. `rcon-manager.test.ts:5` sets it to `50` for tests. Current docs
  and `.env.example` document `RCON_COMMAND_TIMEOUT_MS`, but not
  `RCON_AUTH_TIMEOUT_MS`.
- Why this is more complex than necessary: a test-speed knob is exposed through
  the production environment even though it is not documented as an operator
  contract.
- Simpler alternative: keep the production auth timeout constant and inject a
  test timeout through a constructor option or fake timer.
- What could break if simplified: timeout tests may take 10 seconds or become
  hard to write; hidden deployments that tuned auth timeout would lose the knob.
- Verification needed: targeted RCON manager timeout tests, full unit suite, and
  a manual or simulated unreachable-auth smoke.
- Confidence: high

### OE-010

- File: `apps/operate/panel/app.ts`; `apps/operate/panel/.env.example`
- Symbol / function / class / module: `CONTENT_SECURITY_POLICY` override
- Category: SPECULATIVE_FEATURE
- Evidence: `app.ts:163-184` lets an environment variable replace the generated
  nonce-based CSP. `.env.example:14` exposes the knob. Current tests/docs found
  in this audit do not prove a real deployment requires overriding CSP; usage is
  `UNCLEAR`.
- Why this is more complex than necessary: the default CSP is already generated
  in code with the page nonce. A full override lets deployments bypass that
  structure and creates another security configuration surface.
- Simpler alternative: remove the override, or support only named, documented
  additions that preserve nonce-based script policy.
- What could break if simplified: deployments with custom reverse-proxy or asset
  requirements may rely on a custom CSP.
- Verification needed: search deployment docs/history, security-header tests, and
  browser smoke for pages using nonce scripts and static assets.
- Confidence: medium

### OE-011

- File: `apps/maintain/updater/update_cs2.sh`; `apps/maintain/updater/cs2-auto-update.conf.example`
- Symbol / function / class / module: updater config parser
- Category: OVERENGINEERING
- Evidence: `update_cs2.sh:31-118` hand-parses CLI options before config loading.
  `update_cs2.sh:153-256` defines a whitelist, comment stripping, quote handling,
  removed-key detection, and config-file loading. `update_cs2.sh:281-293` trims
  all config variables again. The example config is a simple commented `KEY=value`
  file at `cs2-auto-update.conf.example:1-28`.
- Why this is more complex than necessary: the updater supports a mini config
  language for one shell script. The parser carries quoting/comment/whitelist
  behavior that is larger than the actual example contract.
- Simpler alternative: accept environment variables only, or source a strictly
  documented shell env file after validating the path and requiring simple
  `KEY=value` lines.
- What could break if simplified: existing configs using inline comments, quotes,
  empty values, or current precedence rules could behave differently.
- Verification needed: updater config tests, `make ci`, review of install docs,
  and a migration note for unsupported config syntax.
- Confidence: medium

### OE-012

- File: `apps/maintain/updater/update_cs2.sh`; `apps/maintain/updater/tests/run.sh`
- Symbol / function / class / module: removed config key warning path
- Category: COMPATIBILITY_SLOP
- Evidence: `update_cs2.sh:153-158` keeps `REMOVED_CONFIG_VARS` for old webhook
  and RCON config names. `update_cs2.sh:209-225` records those keys from env.
  `update_cs2.sh:339-343` warns for them. `tests/run.sh:29-31` clears those old
  env vars between tests. Prior changelog entries mention removed webhook/RCON
  config, but current active operator usage is `UNCLEAR`.
- Why this is more complex than necessary: unsupported settings remain in parser
  state and tests after the feature itself is gone.
- Simpler alternative: remove the removed-key list, detection, warning function,
  and warning assertions after a defined migration window.
- What could break if simplified: operators with stale configs lose explicit
  warnings that old keys are ignored.
- Verification needed: git-history/release-window review, updater tests, and
  docs/changelog update if the warning window is closed.
- Confidence: medium

### OE-013

- File: `scripts/validate.sh`
- Symbol / function / class / module: root validation wrapper
- Category: COMPATIBILITY_SLOP
- Evidence: `scripts/validate.sh:1-5` only resolves its directory and `exec`s
  `verify.sh`. `scripts/verify.sh:139-150` shellchecks and formats this wrapper,
  and `rg "scripts/validate.sh|./scripts/validate.sh"` found archive and test/doc
  references, but no distinct root validation behavior.
- Why this is more complex than necessary: two root command names imply two
  verification paths, but one simply delegates to the other.
- Simpler alternative: document and use only `./scripts/verify.sh`.
- What could break if simplified: external users, old CI snippets, or docs that
  call `./scripts/validate.sh`.
- Verification needed: git-history and docs search, update any live references,
  then run root shell checks and repository verification.
- Confidence: medium

### OE-014

- File: `apps/maintain/updater/scripts/ci-install-tools.sh`; `apps/maintain/updater/scripts/ci-tools-versions.env`; `.github/workflows/ci.yml`
- Symbol / function / class / module: pinned shellcheck/shfmt installer
- Category: BOILERPLATE
- Evidence: `ci-install-tools.sh:1-206` downloads shellcheck and shfmt with
  platform cases and SHA256 verification. `ci-tools-versions.env:1-10` stores
  version/hash data. Current GitHub Actions installs shell tooling with apt at
  `.github/workflows/ci.yml:27-31`. `apps/maintain/updater/CONTRIBUTING.md:7-14`
  documents the downloader as local/manual setup.
- Why this is more complex than necessary: current CI does not use this supply
  chain path, so the repo maintains a downloader, checksum matrix, and lint list
  entry for a manual convenience path.
- Simpler alternative: require contributors to install shellcheck/shfmt through
  their package manager, or move the downloader outside the release-critical
  script set.
- What could break if simplified: contributors who rely on the pinned downloader
  lose a one-command setup path; lint/fmt script lists need updates.
- Verification needed: contributor expectation check, `rg "ci-install-tools|ci-tools-versions"`,
  updater `make lint`, and root verification.
- Confidence: medium

### OE-015

- File: `apps/operate/panel/db.ts`
- Symbol / function / class / module: migration baseline compatibility
- Category: COMPATIBILITY_SLOP
- Evidence: `db.ts:97-119` validates old schema versions by required columns.
  `db.ts:122-173` defines migration 1 as a full baseline that also handles
  databases "already bootstrapped by the pre-migration inline code", adds legacy
  columns if missing, backfills `owner_id`, and backfills `server_access`.
  `db.ts:175-189` adds admin compatibility.
- Why this is more complex than necessary: every startup carries old SQLite
  compatibility and backfill logic instead of supporting one current schema
  baseline.
- Simpler alternative: define a supported minimum schema version and provide a
  separate one-time migration path for older operator databases.
- What could break if simplified: existing installations with pre-migration
  SQLite files could fail to boot or lose server access/admin semantics.
- Verification needed: fixture-backed migration tests, old DB backup smoke,
  login/server-access smoke after migration, and an explicit support-window
  decision.
- Confidence: high

### OE-016

- File: `apps/operate/panel/tsconfig.json`
- Symbol / function / class / module: CommonJS module compatibility suppression
- Category: COMPATIBILITY_SLOP
- Evidence: `tsconfig.json:17-20` uses `"moduleResolution": "node"` and
  `"ignoreDeprecations": "6.0"` with a TODO that the runtime/tests still use
  CommonJS and may later move to NodeNext.
- Why this is more complex than necessary: the project carries an explicit
  future-migration branch in compiler config instead of either accepting the
  current module system without TODO churn or completing the module migration.
- Simpler alternative: make a dedicated decision: keep CommonJS and remove the
  TODO/deprecation suppression only when TypeScript allows it, or migrate server,
  tests, mocks, Docker entrypoint, and build output to NodeNext in one slice.
- What could break if simplified: imports, local `require` shims, Node test
  module mocks, compiled output, Docker startup, and E2E server boot.
- Verification needed: full panel typecheck/build/unit/e2e under Node 22, Docker
  build/run smoke, and targeted mock-module tests.
- Confidence: high

### OE-017

- File: `apps/operate/panel/test/scripts.test.ts`
- Symbol / function / class / module: implementation-string and docs-string tests
- Category: BOILERPLATE
- Evidence: `scripts.test.ts:100-118` asserts exact documentation strings and
  repo-map content. `scripts.test.ts:133-141` reads source files and asserts the
  Redis limiter implementation contains `RateLimitRedisStore`,
  `makeRateLimitStore`, and `store: makeRateLimitStore()`.
- Why this is more complex than necessary: these tests guard implementation text
  and documentation wording, not runtime behavior. They can fail during harmless
  wording/refactor changes while missing broken behavior.
- Simpler alternative: replace implementation regex checks with behavior tests,
  or remove doc-string assertions unless the doc text is a required release
  contract.
- What could break if simplified: fewer guards against accidentally removing
  specific docs or Redis store wiring during refactors.
- Verification needed: panel unit suite and, if Redis behavior remains important,
  a behavior-level test that constructs the limiter with a mocked Redis store.
- Confidence: high

### OE-018

- File: `apps/operate/panel/modules/rcon.ts`
- Symbol / function / class / module: `PasswordProvider`, constructor injection,
  lazy DB import
- Category: SINGLE_USE_ABSTRACTION
- Evidence: `rcon.ts:47` defines `PasswordProvider`. `rcon.ts:71-90` optionally
  injects it, otherwise lazily `require`s `../db` to query the password.
  Production exports a singleton at `rcon.ts:487`; tests instantiate
  `RconManager` with fake providers. The lazy import exists to avoid circular
  dependency/import timing.
- Why this is more complex than necessary: production uses one singleton, but the
  class carries a provider abstraction and lazy CommonJS require path mostly for
  testability and import-order compatibility.
- Simpler alternative: create the singleton through an explicit factory that is
  passed a password lookup function, or keep password lookup route-local and make
  tests mock the factory boundary.
- What could break if simplified: RCON tests, startup import order, circular
  dependency behavior, and password freshness on reconnect.
- Verification needed: RCON manager tests, add/reconnect server route tests,
  startup smoke from compiled `dist/app.js`, and a reconnect/password-rotation
  regression.
- Confidence: medium

### OE-019

- File: `apps/operate/panel/utils/parseServerId.ts`
- Symbol / function / class / module: `getCheckAccessStmt`, authorization helpers
- Category: COMPATIBILITY_SLOP
- Evidence: `parseServerId.ts:25-40` lazy-loads SQLite with CommonJS `require`
  so DB imports do not happen at module scope. `parseServerId.ts:42-79` mixes
  parsing, Express response writing, session inspection, and database access
  checks in one utility.
- Why this is more complex than necessary: a simple ID parser now also owns
  route response behavior and a lazy DB statement cache. This hides route
  authorization side effects behind a parsing utility.
- Simpler alternative: keep `parseServerId` pure and move access checks into a
  small route middleware or route-local helper with direct DB dependencies.
- What could break if simplified: status codes may drift between body-param and
  route-param cases; tests that rely on lazy DB mocking could fail; route
  authorization bugs are high impact.
- Verification needed: server/game/operator route tests for missing, invalid,
  unauthorized, and authorized server IDs, plus typecheck.
- Confidence: medium

## Highest-Impact Simplification Targets

1. Operator convenience subsystem: autocomplete, persisted RCON history, and
   workshop favorites together account for routes, DB schema, UI state, parser
   code, tests, and e2e surface. Confirm actual operator need before keeping all
   three.
2. Updater config/compatibility surface: the hand-rolled config parser, removed
   config key warnings, and manual CI tool downloader are large relative to the
   narrow updater job.
3. Browser manage-page plumbing: `context.ts`, duplicate request helpers, and
   large event-handler tables are good targets for small inlining/dedup slices.
4. Configuration aliases and knobs: `DEFAULT_PORT`, split Redis config, CSP
   override, and `RCON_AUTH_TIMEOUT_MS` should each be justified as active
   operator contracts or removed/deprecated.
5. Storage/module compatibility: SQLite old-schema support and CommonJS
   deprecation suppression are high-impact but need the most proof before change.

## Low-Risk Deletion/Inlining Candidates

1. Inline `makeMultiPresetRoute` into its two current call sites if route tests
   remain clear.
2. Remove `DEFAULT_PORT` after checking git history and live docs for old usage.
3. Replace `context.ts` with `initManagePage(serverId)` or a single local DOM
   read.
4. Merge `sendPostRequest`, `fetchJson`, and `sendJson` into one request helper.
5. Remove or rewrite `scripts.test.ts` implementation-string assertions in favor
   of behavior checks.
6. Keep `scripts/validate.sh` only if external compatibility is intentionally
   supported; code-risk is low, compatibility-risk is `UNCLEAR`.

## Risky Areas That Need More Proof Before Simplification

1. `apps/operate/panel/db.ts` migrations: requires old DB fixtures/backups and a
   documented support boundary.
2. `apps/operate/panel/modules/rcon.ts`: live sockets, command serialization,
   reconnects, heartbeats, timeouts, and password lookup are runtime-critical.
3. `apps/maintain/updater/update_cs2.sh`: service stop/start, lock recovery, and
   unknown remote status protect host uptime.
4. `apps/operate/panel/utils/networkValidation.ts` and RCON command validation:
   these are security/runtime boundaries, not cleanup targets without tests.
5. `apps/operate/panel/tsconfig.json` module-system migration: touches runtime,
   tests, mocks, build output, and Docker.
6. Operator feature removal that leaves SQLite tables behind: needs a schema
   cleanup policy or an explicit "orphaned table is acceptable" decision.

## Files That Are Simple Enough And Should Not Be Touched

1. `apps/provision/bootstrap/scripts/bootstrap-admins.sh`
2. `apps/provision/bootstrap/scripts/bootstrap-plugins.sh`
3. `configs/examples/startup/server-start.sh`
4. `apps/operate/panel/utils/logger.ts`
5. `apps/operate/panel/utils/rconDisplay.ts`
6. `apps/operate/panel/utils/rconResponse.ts`
7. `apps/operate/panel/utils/mapsConfig.ts`
8. `apps/operate/panel/routes/game/index.ts`
9. `apps/operate/panel/modules/middleware.ts`
10. `apps/operate/panel/routes/auth.ts`

These files are either already direct, or their complexity is tied to a narrow
runtime/security purpose. Touch them only when a concrete bug or behavior change
requires it.

## Remaining Uncertainty

- The working tree was already dirty and includes untracked source files; this
  audit reflects the live checkout, not a clean committed baseline.
- No live CS2 server, SteamCMD host, systemd service, Redis service, or RCON
  endpoint was exercised.
- External operator usage is unknown for compatibility paths such as
  `DEFAULT_PORT`, root `validate.sh`, old updater config keys, Redis host/port
  settings, and custom CSP.
- Git history was not exhaustively audited for every finding. Some archive docs
  contain prior history notes, but this index records current source evidence.
- Generated assets, dependency trees, screenshots, and runtime databases were
  excluded from source inspection.
- "Simpler" does not mean "safe to delete now." Items marked `UNCLEAR` need
  usage proof before removal.
