# Deprecation and Simplification Audit

Date: 2026-05-26

Scope: current working tree under `/Users/sebastian/Git/cs2-server-ops`.
This audit is documentation-only. It includes visible tracked and untracked
source files and does not modify production code.

Evidence standard:

- "Unused" means no current in-repo reference was found with `rg` in the
  inspected working tree, excluding dependency/build output where applicable.
- Deletion is recommended only where current in-repo evidence is strong.
- If active runtime use cannot be proven from code, docs, tests, or config, the
  finding is marked "needs runtime or git-history verification."

## Commands Run

```text
git status --short
rg -n "TODO|FIXME|HACK|deprecated|Deprecation|legacy|compat|compatibility|obsolete|remove|removed|temporary|test-only|ignoreDeprecations|defaultExport|namedExports" .
rg -n "^export ...|function ...|class ..." ...
npm run lint                         # apps/operate/panel: passed
npm run typecheck                    # apps/operate/panel: passed
npm ls --depth=0                     # apps/operate/panel: passed
make lint                            # apps/maintain/updater: passed
find apps/operate/panel/cfg -maxdepth 3 -type f
rg -n "escapeHtml|GameMode|GameType|MapGroup|MapsConfig|RconHistoryRow|ci-install-tools|ci-tools-versions|live_wingman|server-provided/live|oitc\\.cfg|1v1arenas\\.cfg|validate\\.sh" .
rg -n "parsePort\\(|UNSAFE_(UNICODE|DISPLAY)_RE|defaultExport|namedExports|ignoreDeprecations|CommonJS|REMOVED_CONFIG_VARS|warn_removed_config_keys" apps/operate/panel apps/maintain/updater docs/verification-baseline.md
wc -l apps/operate/panel/public/ts/manage.ts apps/operate/panel/routes/game/match.ts apps/operate/panel/app.ts apps/maintain/updater/update_cs2.sh apps/operate/panel/test/app.test.ts apps/operate/panel/test/game-routes.test.ts apps/maintain/updater/tests/run.sh
```

The lint/typecheck checks above passed. Full repository verification was not run
for this audit.

## Findings

### DSA-001 - Unused browser export `escapeHtml`

- Category: unused export / dead utility
- Location: `apps/operate/panel/public/ts/common.ts:6`
- Evidence: `escapeHtml` is exported at `common.ts:6-15`. `rg "escapeHtml"`
  found only this definition and prior audit docs; current browser code writes
  dynamic values with DOM APIs such as `textContent` in the toast helper at
  `common.ts:69-72`.
- Why it is likely obsolete or harmful: It adds an apparent public browser
  utility with no current caller, increasing review surface for XSS-related
  changes without protecting any active path.
- What could break if changed: An out-of-tree script or stale generated bundle
  importing `escapeHtml`; no in-repo caller was found.
- Suggested action: delete after a final `rg "escapeHtml"` check, then rebuild
  the browser bundle.
- Risk level: low
- Verification needed: `rg "escapeHtml"`, `npm run typecheck`, `npm run
  build:client`, and a browser smoke of pages using the shared bundle.

### DSA-002 - Exported map config types have no in-repo consumers

- Category: unused exports / single-use type surface
- Location: `apps/operate/panel/utils/mapsConfig.ts:25-30`
- Evidence: `GameMode`, `GameType`, `MapGroup`, and `MapsConfig` are exported
  at `mapsConfig.ts:25-28`. `rg "GameMode|GameType|MapGroup|MapsConfig"`
  found no imports of those type exports; active consumers import only
  `mapsConfig` and `getMapsForMode` in `routes/server.ts` and
  `routes/game/match.ts`.
- Why it is likely obsolete or harmful: It exposes a typed public surface that
  is not used by this application and can make future cleanup look like an API
  break when it is only local implementation detail.
- What could break if changed: Hidden out-of-tree TypeScript imports, though
  this appears to be an app repository rather than a package.
- Suggested action: inline these as non-exported local aliases, or remove the
  aliases that are not needed for the `mapsConfig` annotation.
- Risk level: low
- Verification needed: `rg "GameMode|GameType|MapGroup|MapsConfig"`, `npm run
  typecheck`, and route tests for server/game map selection.

### DSA-003 - `maps.json` references cfg files absent from the repo

- Category: obsolete compatibility/config branch / runtime false-success risk
- Location: `apps/operate/panel/cfg/maps.json:49-55`
- Evidence: `maps.json` references `oitc.cfg` and `1v1arenas.cfg`. `find
  apps/operate/panel/cfg -maxdepth 3 -type f` did not list either file. The game
  setup route validates the cfg filename at `routes/game/match.ts:133-138` and
  then executes it before changing the map at `routes/game/match.ts:155-160`.
- Why it is likely obsolete or harmful: The UI/API can accept a mode that passes
  JSON validation but fails at RCON execution unless the target server has an
  untracked cfg installed.
- What could break if changed: Operators may have these cfg files installed
  manually on servers even though they are absent from the repo.
- Suggested action: investigate. Do not delete the modes until runtime or
  git-history evidence proves they are not supported. If unsupported, remove the
  modes and tests together; if supported, add the missing deployment contract.
- Risk level: medium
- Verification needed: needs runtime or git-history verification. Check git
  history for removed cfg files, deployment docs, and a real server RCON smoke
  for `exec oitc.cfg` and `exec 1v1arenas.cfg`.

### DSA-004 - `live_wingman.cfg` appears manual-only or unused by code

- Category: unused file candidate / unclear manual asset
- Location: `apps/operate/panel/cfg/live_wingman.cfg`
- Evidence: `rg "live_wingman"` found `apps/operate/panel/docs/SERVER-SETUP.md:14`
  and audit docs, but no route, `maps.json` entry, or test reference.
- Why it is likely obsolete or harmful: A shipped cfg with no active code path
  can confuse operators about which ruleset is actually used.
- What could break if changed: Manual server setup workflows may copy this file
  based on `SERVER-SETUP.md`.
- Suggested action: investigate and either document it explicitly as manual-only
  or delete it if git history/runtime checks show no active use.
- Risk level: medium
- Verification needed: needs runtime or git-history verification. Inspect git
  history, operator setup notes, and deployed server cfg directories.

### DSA-005 - `server-provided/live.cfg` path does not match route execution

- Category: compatibility path / unclear deployment contract
- Location: `apps/operate/panel/cfg/server-provided/live.cfg`;
  `apps/operate/panel/routes/game/match.ts:322-328` and `:401-421`
- Evidence: MatchZy routes execute `live.cfg` at `match.ts:327` and
  `match.ts:420`, while the repo file is nested at
  `cfg/server-provided/live.cfg`. `SERVER-SETUP.md` does not show how this file
  is copied into the server cfg root as `live.cfg`.
- Why it is likely obsolete or harmful: The nested cfg may be stale sample data,
  or the route may rely on an undocumented manual copy step. Either way the
  current contract is ambiguous.
- What could break if changed: Existing servers may already have `live.cfg`
  installed manually, and MatchZy flows may depend on that external file.
- Suggested action: investigate. Either codify the copy/deployment contract or
  remove the nested file if it is not the source of truth.
- Risk level: medium
- Verification needed: needs runtime or git-history verification. Check deploy
  scripts/docs and run a MatchZy server smoke that proves `exec live.cfg` works.

### DSA-006 - Root `validate.sh` is a thin compatibility wrapper

- Category: compatibility shim / wrapper that adds no value
- Location: `scripts/validate.sh:1-5`
- Evidence: The script only resolves its directory and executes
  `scripts/verify.sh`. Root verification still references it in
  `scripts/verify.sh:141`, `scripts/verify.sh:147`, and `scripts/verify.sh:207`;
  panel tests also exercise it in `apps/operate/panel/test/scripts.test.ts`.
- Why it is likely obsolete or harmful: The name suggests a separate validation
  path, but it always runs the verifier. Maintaining both names makes command
  documentation and tests noisier.
- What could break if changed: Existing users, docs, CI snippets, or tests that
  call `./scripts/validate.sh`.
- Suggested action: keep for now, or deprecate in docs before removal. Do not
  delete without migration evidence.
- Risk level: medium
- Verification needed: needs runtime or git-history verification. Search commit
  history and docs for external references, then run root verification and the
  panel script tests after any change.

### DSA-007 - Updater keeps warnings for removed config keys

- Category: deprecated internal API / stale compatibility branch
- Location: `apps/maintain/updater/update_cs2.sh:157`,
  `:209-224`, `:339-343`, `:886`
- Evidence: `REMOVED_CONFIG_VARS` includes old notification and RCON keys at
  line 157. The updater detects those old keys at lines 218-224 and emits
  warnings at lines 339-343. Tests in `apps/maintain/updater/tests/run.sh`
  assert this behavior.
- Why it is likely obsolete or harmful: This permanent compatibility warning
  keeps old config names alive in parser logic and tests after support has been
  removed.
- What could break if changed: Operators upgrading from old config files would
  lose explicit warnings that their old keys are ignored.
- Suggested action: investigate the release/migration window. If old configs no
  longer need a warning path, delete the removed-key list, detection, warning
  function, and tests together.
- Risk level: medium
- Verification needed: needs runtime or git-history verification. Review
  changelog/history for when the keys were removed, then run
  `apps/maintain/updater` `make test` or `make ci`.

### DSA-008 - Database migration keeps pre-migration bootstrap compatibility

- Category: compatibility branch / storage contract
- Location: `apps/operate/panel/db.ts:62-123`
- Evidence: Migration 1 explicitly supports a database "already bootstrapped by
  the pre-migration inline code" at `db.ts:63-65`, ignores duplicate legacy
  columns at `db.ts:88-102`, and backfills owner/access data at `db.ts:105-114`.
  Migration 2 upgrades admin state at `db.ts:117-123`.
- Why it is likely obsolete or harmful: Startup migrations carry old schema
  compatibility paths and silent `ALTER TABLE` catches. This adds complexity to
  every boot and can obscure the supported database baseline.
- What could break if changed: Existing installations with pre-migration SQLite
  files could fail to boot or lose access/admin semantics.
- Suggested action: keep until the supported database compatibility window is
  explicitly decided. If the old baseline is no longer supported, replace this
  with a documented migration boundary and tests using old DB fixtures.
- Risk level: high
- Verification needed: needs runtime or git-history verification. Use old
  database fixtures or backups, run migration tests, and smoke login/server
  access after migration.

### DSA-009 - Tests use deprecated `mock.module` option names

- Category: deprecated library API
- Location: `apps/operate/panel/test/*.test.ts`
- Evidence: `docs/verification-baseline.md:177-180` records Node warnings:
  `options.defaultExport` is deprecated and `options.namedExports` is
  deprecated. `rg "defaultExport|namedExports" apps/operate/panel/test` found
  current usage in `game-routes.test.ts`, `status.test.ts`,
  `user-management.test.ts`, `game-helpers.test.ts`, `app.test.ts`,
  `server-crud.test.ts`, and `rcon-manager.test.ts`.
- Why it is likely obsolete or harmful: Deprecation warnings make test output
  noisy and this API shape may be removed by a future Node test runner.
- What could break if changed: Tests that rely on current mock export shape may
  fail if converted incorrectly.
- Suggested action: replace deprecated `defaultExport` and `namedExports` with
  `exports` in tests only.
- Risk level: low
- Verification needed: `npm test` under Node 22 and `npm run typecheck`.

### DSA-010 - TypeScript config suppresses module-system deprecation pressure

- Category: deprecated/compatibility tooling configuration
- Location: `apps/operate/panel/tsconfig.json:17-20`
- Evidence: The config uses `"moduleResolution": "node"` and
  `"ignoreDeprecations": "6.0"` with a TODO stating the runtime/tests still use
  CommonJS and should eventually migrate to NodeNext.
- Why it is likely obsolete or harmful: It intentionally suppresses future
  TypeScript module-system deprecation pressure and preserves CJS assumptions
  across server, tests, and build output.
- What could break if changed: Runtime module loading, `mock.module` tests,
  compiled output paths, Docker startup, and any lazy CommonJS require shims.
- Suggested action: investigate as a dedicated migration, not as incidental
  cleanup. Do not remove the suppression until module format, tests, Docker,
  and runtime startup are migrated together.
- Risk level: high
- Verification needed: full panel `npm run ci` under Node 22, Docker build,
  Playwright e2e, and runtime smoke from compiled `dist/app.js`.

### DSA-011 - E2E seed API is embedded in the production app entrypoint

- Category: test-only branch in runtime entrypoint / stale feature flag risk
- Location: `apps/operate/panel/app.ts:319-342`;
  `apps/operate/panel/playwright.config.ts:39-48`
- Evidence: `app.ts` registers `/api/test/servers` only when
  `NODE_ENV === 'test'` and `ENABLE_E2E_TEST_ROUTES === 'true'`. Playwright sets
  those values at `playwright.config.ts:39-48`.
- Why it is likely obsolete or harmful: Test-only behavior lives in the
  production app module and could be exposed if environment flags are set
  incorrectly.
- What could break if changed: Playwright tests that seed servers through the
  HTTP route.
- Suggested action: keep unless replacing it with a test-harness seed mechanism,
  such as direct DB fixture setup. If moved, keep the route out of production
  registration entirely.
- Risk level: medium
- Verification needed: `npm run test:e2e` and a production-mode smoke proving
  `/api/test/servers` is unavailable.

### DSA-012 - Toast and POST handling are duplicated across inline pages

- Category: duplicated logic / boilerplate
- Location: `apps/operate/panel/public/js/toast-inline.js:1-26`,
  `apps/operate/panel/public/ts/common.ts:17-78`,
  `apps/operate/panel/views/login.ejs:55-99`
- Evidence: `toast-inline.js` creates the same toast container and animation
  pattern as `common.ts:45-78`. `login.ejs:55-99` manually extracts CSRF,
  performs `fetch`, parses JSON, and handles errors instead of using
  `sendPostRequest` from `common.ts:17-43`. Similar inline patterns exist in
  add-server, settings, and admin-users views.
- Why it is likely obsolete or harmful: Error handling, CSRF fetch behavior, and
  toast UI can drift between pages.
- What could break if changed: Login/add-server pages may intentionally avoid
  the main bundle and depend on the smaller inline script plus CSP nonce.
- Suggested action: deduplicate only if these pages can load an existing shared
  helper without adding a broad new abstraction. Otherwise keep and document the
  intentional split.
- Risk level: medium
- Verification needed: browser or Playwright smoke for login, add-server,
  settings, admin-users, CSRF failures, and CSP behavior; `npm run build:client`.

### DSA-013 - `parsePort` is duplicated in app and Redis config

- Category: duplicated logic / small boilerplate
- Location: `apps/operate/panel/app.ts:114-117`;
  `apps/operate/panel/utils/redis.ts:5-8`
- Evidence: Both files define the same integer port parser and use it for
  `PORT`/`DEFAULT_PORT` and `REDIS_PORT`.
- Why it is likely obsolete or harmful: Duplicated config parsing can drift,
  though the current helper is tiny and easy to read.
- What could break if changed: A shared helper could introduce an import cycle
  or change fallback behavior for app or Redis startup.
- Suggested action: keep the duplication unless both paths are already being
  touched. If touched, inline a single minimal helper in a config utility with
  no side effects.
- Risk level: low
- Verification needed: `npm run typecheck`, app startup smoke, Redis URL/config
  tests if added.

### DSA-014 - RCON display sanitizers duplicate security-sensitive logic

- Category: duplicated logic / hidden coupling
- Location: `apps/operate/panel/utils/rconResponse.ts:1-20`;
  `apps/operate/panel/utils/rconParsers.ts:1-23`
- Evidence: Both files define nearly identical unsafe Unicode regexes for
  control, zero-width, and bidirectional characters. `rconResponse.ts` sanitizes
  hostnames; `rconParsers.ts` sanitizes status/player fields.
- Why it is likely obsolete or harmful: Security-sensitive display cleanup can
  drift between hostname/status/player surfaces.
- What could break if changed: The helpers have different fallback/trim/split
  semantics, so an over-broad merge could alter hostname parsing or player list
  parsing.
- Suggested action: deduplicate only the regex or a narrow `cleanRconDisplay`
  helper used by both real call sites. Do not create a parser framework.
- Risk level: medium
- Verification needed: `rcon-response.test.ts`, `rcon-parsers.test.ts`, status
  route tests, and UI smoke for server hostname/player rendering.

### DSA-015 - Several files have mixed responsibilities and high edit risk

- Category: overcomplicated files / mixed responsibilities
- Location: `apps/operate/panel/public/ts/manage.ts`,
  `apps/operate/panel/routes/game/match.ts`, `apps/operate/panel/app.ts`,
  `apps/maintain/updater/update_cs2.sh`, broad test files
- Evidence: Line counts from `wc -l`:
  `manage.ts` 1067, `match.ts` 634, `app.ts` 445, `update_cs2.sh` 980,
  `test/app.test.ts` 1220, `test/game-routes.test.ts` 619,
  `apps/maintain/updater/tests/run.sh` 643.
- Why it is likely obsolete or harmful: These files mix setup, routing, state,
  UI events, command construction, and tests. Broad edits will be hard to review
  and easy to regress.
- What could break if changed: Core panel startup, operator UI, game commands,
  updater behavior, and regression coverage.
- Suggested action: no broad rewrite. Simplify only around a concrete behavior
  change, with targeted tests first. Prefer deleting proven-dead branches and
  inlining single-use helpers over extracting generic layers.
- Risk level: high
- Verification needed: targeted tests for the touched behavior plus broader
  `npm run ci` or updater `make ci` depending on file.

### DSA-016 - Updater CI tool installer appears manual-only under current CI

- Category: unused script candidate / obsolete compatibility branch
- Location: `apps/maintain/updater/scripts/ci-install-tools.sh:1-18`,
  `apps/maintain/updater/scripts/ci-tools-versions.env:1-10`,
  `.github/workflows/ci.yml:27-30`
- Evidence: The helper downloads pinned shellcheck/shfmt releases using hashes
  from `ci-tools-versions.env`. Current GitHub Actions instead installs
  shellcheck, shfmt, jq, and ruby with `apt-get` at `.github/workflows/ci.yml:27-28`
  and runs `./scripts/verify.sh` at line 30. `rg "ci-install-tools"` found only
  updater contributing docs, shell lint file lists, and the helper itself.
- Why it is likely obsolete or harmful: The repo maintains a supply-chain
  download helper and checksum table that current root CI does not call.
- What could break if changed: Contributors following
  `apps/maintain/updater/CONTRIBUTING.md:7-13` may rely on the helper for local
  setup.
- Suggested action: investigate. If manual setup support is no longer needed,
  delete the helper, version file, shell lint entry, and contributing reference
  together. If it is needed, document it as manual-only.
- Risk level: medium
- Verification needed: needs runtime or git-history verification. Review CI
  history and contributor setup expectations, then run updater `make lint` and
  root verification after any change.

### DSA-017 - RCON history response type is duplicated across server and browser

- Category: duplicated contract / unclear export
- Location: `apps/operate/panel/utils/rconHistory.ts:3-8`;
  `apps/operate/panel/public/ts/manage.ts:62-70`
- Evidence: `rconHistory.ts` exports `RconHistoryRow` for server-side DB rows,
  while `manage.ts` declares a separate browser interface with the same shape
  for API responses. `rconHistory.ts` is visible in the current working tree as
  an untracked source file.
- Why it is likely obsolete or harmful: The exported server interface looks like
  a shared API contract, but browser code cannot import the server module
  because it depends on SQLite. The two shapes can drift.
- What could break if changed: Current untracked server route/test work may
  import the exported type, and hidden consumers cannot be ruled out without
  history.
- Suggested action: inline the server type if only used inside
  `rconHistory.ts`, or keep both explicit if the browser/server boundary is
  intentionally duplicated. Do not add a new shared abstraction unless another
  real API response shape needs it too.
- Risk level: low
- Verification needed: `rg "RconHistoryRow"`, `npm run typecheck`, and RCON
  history route/browser tests.

## Non-Findings and Guardrails

- No unused production dependency was proven from `npm ls --depth=0` plus import
  and script review in `apps/operate/panel`. This is not a full dependency
  reachability proof.
- No production files were modified for this audit.
- Database migrations, cfg files, and command wrappers should not be deleted
  without runtime or git-history proof because they may be compatibility
  contracts for existing operators.

## Highest-Risk Simplification Targets

1. `apps/operate/panel/db.ts` migration compatibility paths: high storage
   compatibility risk.
2. `apps/operate/panel/cfg/*.cfg` and `cfg/maps.json`: runtime game-command
   false-success risk if cfg availability is wrong.
3. `apps/operate/panel/tsconfig.json` CommonJS/deprecation suppression:
   cross-cutting runtime/test/build migration.
4. `apps/operate/panel/app.ts` test route registration: possible exposure if
   env flags are wrong.
5. `apps/maintain/updater/update_cs2.sh`: large shell runtime with old config
   compatibility behavior.

## Likely Dead or Manual-Only Candidates

- `apps/operate/panel/public/ts/common.ts` `escapeHtml`: likely dead in-repo.
- `apps/operate/panel/utils/mapsConfig.ts` exported type aliases: likely
  unnecessary public surface.
- `apps/operate/panel/cfg/live_wingman.cfg`: manual-only or dead; needs runtime
  or git-history verification.
- `apps/operate/panel/cfg/server-provided/live.cfg`: unclear deployment source;
  needs runtime or git-history verification.
- `apps/maintain/updater/scripts/ci-install-tools.sh` and
  `ci-tools-versions.env`: current CI does not call them; manual setup may.

## Recommended Next Audit Targets

1. Git history for cfg files, `validate.sh`, removed updater config keys, and
   updater CI tool installer.
2. Runtime server cfg smoke for `oitc.cfg`, `1v1arenas.cfg`, and `live.cfg`.
3. Panel test modernization for deprecated `mock.module` options.
4. Focused browser-flow audit of inline login/add-server/settings/admin-users
   scripts versus shared `common.ts`.
5. Migration fixture audit for old SQLite databases before any migration
   simplification.

## Coverage Gaps and Uncertainty

- Full repository verification was not run during this audit.
- Runtime CS2 server/RCON behavior was not exercised.
- Git history was not inspected, so compatibility windows are unknown.
- Current working tree contains untracked source files; findings involving those
  files reflect visible working-tree state, not necessarily committed history.
