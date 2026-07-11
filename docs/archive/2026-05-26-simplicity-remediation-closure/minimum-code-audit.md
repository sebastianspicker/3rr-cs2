# Minimum Code Audit

Date: 2026-05-26

This audit checks the current working tree for violations of the "minimum code
that solves the problem" principle. It is intentionally docs-only. No production
code was changed.

## Scope And Evidence Standard

Included source areas:

- `apps/operate/panel`: Express/TypeScript panel, browser TypeScript, EJS views,
  SQLite storage, RCON integration, tests, panel scripts, and panel config.
- `apps/maintain/updater`: Bash updater, support scripts, tests, Makefile, and
  example config.
- `apps/provision/bootstrap`: bootstrap scripts and examples.
- `configs/examples`, `scripts`, `.github/workflows`, `docs/reference`, and
  `docs/workflows`.

Excluded from source review: `node_modules`, `dist`, coverage output, generated
test output, and binary/screenshot assets. The worktree already contained many
modified and untracked files before this audit; findings reflect the current
local file contents, not a clean release tag.

Evidence rules used here:

- No simplification is recommended without a current source reference.
- If active operator usage, deployment usage, or migration intent is unclear,
  the action is `INVESTIGATE`.
- No new abstraction is suggested unless there are multiple real current call
  sites.
- Runtime-critical RCON, updater, SQLite migration, and security behavior is
  not marked for direct simplification without targeted tests.

## Meaningful Source Area Assessment

| Source area | Problem solved | Proportionality and minimum-code assessment | Issue IDs |
| --- | --- | --- | --- |
| Root verification and workflows | Provide a single broad repo verifier and CI entry point. | `scripts/verify.sh` is proportional because it coordinates root, panel, and updater checks. `scripts/validate.sh` is a wrapper around the verifier and may be obsolete compatibility. CI installs shell tools through `apt`, while the updater also ships a pinned downloader for manual use. | MC-013, MC-014 |
| Panel app startup, security, sessions, rate limiting | Start the authenticated web panel with sessions, CSRF, CSP, health checks, and Redis-backed production rate limiting. | The security and startup code is mostly proportional. Questionable complexity comes from multiple equivalent configuration paths: `DEFAULT_PORT`, `REDIS_HOST`/`REDIS_PORT`, and full CSP replacement through env. These increase state space and can hide unsafe deployment differences. | MC-007, MC-008, MC-010 |
| SQLite persistence and migrations | Store users, servers, sessions, workshop favorites, RCON history, and schema migrations. | Core storage is required. Optional feature tables for favorites/history add cross-layer behavior that should be justified by operator need. Old baseline migration compatibility may be necessary, but active upgrade requirements are UNCLEAR. | MC-002, MC-003, MC-015 |
| RCON manager | Serialize per-server commands, connect/authenticate to SRCDS RCON, enforce timeouts, heartbeat, and shutdown behavior. | The core state machine is proportional to a real runtime boundary. Simplification risk is high. Questionable areas are a production env timeout knob used by tests and a single-use password-provider/lazy-DB seam. | MC-009, MC-018 |
| Game control routes | Map UI controls to validated RCON commands and command sequences. | The route helper layer is mostly justified by repeated command patterns. `makeMultiPresetRoute` has only two current call sites and mostly hides simple endpoint-specific behavior. | MC-004 |
| Operator routes | Provide RCON autocomplete, workshop favorite CRUD, and RCON history APIs. | This is the densest speculative feature surface. Raw RCON command execution is clearly required; autocomplete, persisted history, and persisted favorites require active usage proof before retaining their full cross-layer implementation. | MC-001, MC-002, MC-003 |
| Browser manage UI and shared browser helpers | Run the operator controls, RCON console, player tools, workshop workflows, and toasts. | The large manage file reflects many real controls, so size alone is not a finding. Minimum-code concerns are duplicated request helpers, hidden mutable server context, and the UI half of speculative favorites/history/autocomplete features. | MC-001, MC-002, MC-003, MC-005, MC-006 |
| Panel tests | Verify route behavior, RCON manager behavior, parser behavior, migrations, scripts, and UI flows. | Many tests are behavior-focused. `scripts.test.ts` also asserts documentation/source strings, and `mock-module.ts` carries a Node 26 compatibility path while `package.json` pins engines to Node 22. These make changes harder without proving runtime behavior. | MC-017, MC-021 |
| Updater | Safely update CS2 server hosts with lock handling, service coordination, retries, logging, validation, and tests. | Core updater complexity is justified by host/runtime safety. Minimum-code concerns are custom config parsing/compatibility behavior and test-only knobs exposed as deployable config. | MC-011, MC-012, MC-020 |
| Provision bootstrap and startup examples | Provide small static scripts and example server startup contracts. | `bootstrap-admins.sh`, `bootstrap-plugins.sh`, and `configs/examples/startup/server-start.sh` are direct and should not be simplified without a concrete bug. | KEEP |
| Small utilities and route glue | Logging, response parsing/display, middleware, auth, maps config, route indexes. | No minimum-code issue was found from this pass. These files are small or directly tied to current behavior and should not be touched as part of broad simplification. | KEEP |

## Findings

### MC-001

- File: `apps/operate/panel/routes/operator.ts`, `apps/operate/panel/utils/rconParsers.ts`, `apps/operate/panel/public/ts/manage.ts`, `apps/operate/panel/views/manage.ejs`
- Symbol / function / class / module: RCON autocomplete endpoint, cache, parser, and UI
- Suggested action: INVESTIGATE
- Current behavior: `operator.ts` keeps an `autocompleteCache` map (`operator.ts:35`), loads suggestions by issuing RCON discovery commands in `loadAutocomplete` (`operator.ts:131`), serves `/api/rcon/autocomplete/:server_id` (`operator.ts:218`), parses outputs through `parseAutocompleteOutput` (`rconParsers.ts:141`), and wires browser suggestion UI (`manage.ts:656`, `views/manage.ejs:221`).
- Required behavior, if inferable: Operators need to submit raw RCON commands and see command responses. Dynamic autocomplete is optional unless current users depend on it.
- Complexity problem: A narrow console input now has a cache, parser, route, RCON discovery calls, refresh state, client UI, and error logging. This adds network traffic and failure modes around an optional aid.
- Minimal alternative: If operator usage evidence is absent, remove dynamic autocomplete and keep raw RCON command entry. If usage exists, keep only a static or server-provided list with explicit failure behavior.
- Risk of simplification: Operators may lose command discovery, and tests that cover parser/autocomplete behavior would need removal or replacement.
- Tests needed before simplification: RCON console command submit/response tests; browser smoke for the console input; parser/autocomplete tests only if the feature remains.
- Verification command or strategy: `cd apps/operate/panel && npm test`; browser/e2e check for RCON console command entry; manual RCON smoke against a test server if available.
- Confidence: medium

### MC-002

- File: `apps/operate/panel/db.ts`, `apps/operate/panel/utils/rconHistory.ts`, `apps/operate/panel/routes/operator.ts`, `apps/operate/panel/public/ts/manage.ts`, `apps/operate/panel/views/manage.ejs`
- Symbol / function / class / module: persisted RCON command history
- Suggested action: INVESTIGATE
- Current behavior: The DB creates `rcon_command_history` (`db.ts:207`), `rconHistory.ts` upserts/prunes/lists/clears command history (`rconHistory.ts:13`, `rconHistory.ts:21`, `rconHistory.ts:59`), operator routes expose history APIs (`operator.ts:307`), and the browser loads/clears/renders history (`manage.ts:705`, `manage.ts:779`, `views/manage.ejs:239`).
- Required behavior, if inferable: The required behavior is command execution. Persisted, per-user, per-server history is not required unless operators actively rely on it.
- Complexity problem: A convenience feature spans schema, migration compatibility, API routes, UI state, pruning rules, and tests. It increases storage behavior and privacy surface for a console feature.
- Minimal alternative: If no usage evidence exists, delete persistence and keep only browser input history or no history. If usage exists, cap and document retention explicitly.
- Risk of simplification: Operators may lose saved command recall; migration tests and API tests would need updates; stored history cleanup may need a migration plan.
- Tests needed before simplification: Console command execution tests, history API tests if retained, migration tests proving table removal or retention behavior.
- Verification command or strategy: `cd apps/operate/panel && npm test`; explicit migration test for existing DBs; browser smoke for command entry.
- Confidence: medium

### MC-003

- File: `apps/operate/panel/db.ts`, `apps/operate/panel/routes/operator.ts`, `apps/operate/panel/public/ts/manage.ts`, `apps/operate/panel/views/manage.ejs`
- Symbol / function / class / module: workshop favorites CRUD
- Suggested action: INVESTIGATE
- Current behavior: The DB creates `workshop_favorites` (`db.ts:194`), `operator.ts` prepares CRUD statements (`operator.ts:64`, `operator.ts:71`, `operator.ts:95`, `operator.ts:105`), routes expose list/create/update/delete (`operator.ts:242`, `operator.ts:250`, `operator.ts:267`, `operator.ts:296`), and the browser renders and mutates favorites (`manage.ts:842`, `manage.ts:855`, `manage.ts:929`, `manage.ts:960`, `views/manage.ejs:84`).
- Required behavior, if inferable: Operators need to launch a workshop map/collection by ID. Persisted named favorites are optional unless current operator workflows require them.
- Complexity problem: A simple map launch workflow became a full CRUD feature with schema, unique constraints, UI edit state, and conflict handling.
- Minimal alternative: If usage evidence is absent, keep direct workshop ID entry and remove persisted favorites. If usage exists, keep CRUD but document it as an operator requirement.
- Risk of simplification: Operators may lose saved favorite maps; DB schema and migration tests would need updates; UI screenshots/e2e tests may change.
- Tests needed before simplification: Workshop launch by raw ID; favorite CRUD tests if retained; migration tests for existing favorite rows if removed.
- Verification command or strategy: `cd apps/operate/panel && npm test && npm run test:e2e`; manual workshop launch smoke if RCON is available.
- Confidence: medium

### MC-004

- File: `apps/operate/panel/routes/game/helpers.ts`, `apps/operate/panel/routes/game/controls.ts`
- Symbol / function / class / module: `makeMultiPresetRoute`
- Suggested action: INLINE
- Current behavior: `makeMultiPresetRoute` is exported from `helpers.ts:275` and used only for `/api/set-startmoney` and `/api/set-roundtime` (`controls.ts:87`, `controls.ts:109`).
- Required behavior, if inferable: Validate an allowed numeric value and run two RCON commands for each of two endpoints.
- Complexity problem: The factory hides endpoint-specific behavior for only two real call sites. The abstraction is close in size to direct route handlers and adds another helper shape alongside other route factories.
- Minimal alternative: Inline the two route handlers using the existing validation and `runGameCmdSequence` behavior. Do not introduce a new helper unless more multi-command preset routes appear.
- Risk of simplification: Low, but error response shapes and partial command failure behavior must remain identical.
- Tests needed before simplification: Existing game route tests for `/api/set-startmoney` and `/api/set-roundtime`, including malformed values and partial command failure.
- Verification command or strategy: `cd apps/operate/panel && npm test -- --test-name-pattern preset` if supported, otherwise `npm test`.
- Confidence: high

### MC-005

- File: `apps/operate/panel/public/ts/context.ts`, `apps/operate/panel/public/ts/console.ts`, `apps/operate/panel/public/ts/manage.ts`
- Symbol / function / class / module: browser server ID context module
- Suggested action: INLINE
- Current behavior: `context.ts` stores a mutable module-level `currentServerId` with `setCurrentServerId`/`getCurrentServerId`; `console.ts` sets it during initialization and `manage.ts` reads it indirectly for most API calls.
- Required behavior, if inferable: Browser code needs the current server ID for API requests on a single manage page.
- Complexity problem: A one-page value is hidden behind mutable module state, which makes initialization order and tests less explicit.
- Minimal alternative: Read the server ID from the page dataset where it is needed, or pass it into the page initializer directly. No new context layer is justified by the current single-page usage.
- Risk of simplification: API calls could send an empty server ID if initialization ordering changes; browser tests must catch this.
- Tests needed before simplification: Browser/unit tests for manage page initialization and at least one command call that includes the server ID.
- Verification command or strategy: `cd apps/operate/panel && npm run build:client && npm run test:e2e`.
- Confidence: medium

### MC-006

- File: `apps/operate/panel/public/ts/common.ts`, `apps/operate/panel/public/ts/manage.ts`, `apps/operate/panel/public/ts/servers.ts`
- Symbol / function / class / module: browser JSON request helpers
- Suggested action: DEDUPLICATE
- Current behavior: `common.ts` exports `sendPostRequest` (`common.ts:6`) and `manage.ts` defines local `fetchJson` and `sendJson` (`manage.ts:108`, `manage.ts:127`). `manage.ts` uses both styles across many call sites, while `servers.ts` imports `sendPostRequest`.
- Required behavior, if inferable: Browser code needs CSRF-aware JSON requests for POST/PATCH/DELETE/GET and consistent error handling.
- Complexity problem: Two request stacks duplicate JSON parsing, CSRF headers, error handling, and response assumptions. That makes it easy for new routes to use inconsistent behavior.
- Minimal alternative: Use one existing shared request helper with method/body support for the current real call sites in `manage.ts` and `servers.ts`.
- Risk of simplification: Medium; subtle differences in response parsing, toast behavior, or empty response handling could break UI flows.
- Tests needed before simplification: Client build; route/browser tests for POST command, GET players/autocomplete/history/favorites, PATCH favorite, and DELETE favorite/history.
- Verification command or strategy: `cd apps/operate/panel && npm run build:client && npm test && npm run test:e2e`.
- Confidence: high

### MC-007

- File: `apps/operate/panel/app.ts`
- Symbol / function / class / module: `DEFAULT_PORT` fallback
- Suggested action: INVESTIGATE
- Current behavior: The app reads `PORT || DEFAULT_PORT || 3000` (`app.ts:246`).
- Required behavior, if inferable: The panel needs a bind port. `PORT` and a hardcoded default are enough unless deployments explicitly use `DEFAULT_PORT`.
- Complexity problem: Two env names represent one setting. `DEFAULT_PORT` broadens deploy-time state without visible docs in the checked env/docs references.
- Minimal alternative: Use `PORT` with default `3000`; remove `DEFAULT_PORT` only after proving no deployment path uses it.
- Risk of simplification: Existing deployments that set only `DEFAULT_PORT` would bind to `3000`.
- Tests needed before simplification: Entrypoint/bind-port tests for `PORT` and default behavior; deployment documentation grep for `DEFAULT_PORT`.
- Verification command or strategy: `rg -n "DEFAULT_PORT" .`; `cd apps/operate/panel && npm test`.
- Confidence: medium

### MC-008

- File: `apps/operate/panel/app.ts`, `apps/operate/panel/utils/redis.ts`, `apps/operate/panel/.env.example`
- Symbol / function / class / module: Redis configuration aliases
- Suggested action: INVESTIGATE
- Current behavior: Production startup allows `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` (`app.ts:125`), `redis.ts` builds a URL from `REDIS_HOST`/`REDIS_PORT` (`redis.ts:10`, `redis.ts:13`), and `.env.example` documents host/port aliases.
- Required behavior, if inferable: Production needs an explicit Redis endpoint for rate limiting/session safety.
- Complexity problem: Multiple config shapes represent the same endpoint and make deployment validation and docs more complex.
- Minimal alternative: Standardize on `REDIS_URL` only if current compose/systemd/operator docs and deployments do not require host/port aliases.
- Risk of simplification: Existing deployments using `REDIS_HOST`/`REDIS_PORT` would fail production startup.
- Tests needed before simplification: Startup tests for production Redis validation; docs/config grep; manual compose validation if examples use aliases.
- Verification command or strategy: `rg -n "REDIS_HOST|REDIS_PORT|REDIS_URL" .`; `cd apps/operate/panel && npm test`.
- Confidence: medium

### MC-009

- File: `apps/operate/panel/modules/rcon.ts`, `apps/operate/panel/test/rcon-manager.test.ts`
- Symbol / function / class / module: `RCON_AUTH_TIMEOUT_MS`
- Suggested action: SIMPLIFY
- Current behavior: `rcon.ts` reads `RCON_AUTH_TIMEOUT_MS` from env with a 10 second default (`rcon.ts:20`) and uses it for authentication timeout (`rcon.ts:211`). The test suite sets it to `50` (`rcon-manager.test.ts:5`).
- Required behavior, if inferable: RCON auth needs a deterministic timeout. There is no checked documentation showing operators configure this value.
- Complexity problem: A production env knob appears to exist mainly to make tests fast. That broadens runtime configuration and can make timeout behavior differ between environments.
- Minimal alternative: Keep a fixed production auth timeout unless an operator requirement exists. Make tests deterministic without a production-facing env knob.
- Risk of simplification: Operators with slow RCON auth paths could lose a tuning escape hatch if they use the env var out of tree.
- Tests needed before simplification: RCON auth timeout test, successful auth test, command timeout test, reconnect/shutdown tests.
- Verification command or strategy: `cd apps/operate/panel && npm test -- --test-name-pattern RconManager` if supported, otherwise `npm test`.
- Confidence: medium

### MC-010

- File: `apps/operate/panel/app.ts`, `apps/operate/panel/.env.example`
- Symbol / function / class / module: `CONTENT_SECURITY_POLICY` override
- Suggested action: INVESTIGATE
- Current behavior: The app accepts a full CSP string from `CONTENT_SECURITY_POLICY` (`app.ts:163`) and `.env.example` shows the variable.
- Required behavior, if inferable: The panel needs a secure default CSP that supports its own assets. Arbitrary CSP replacement is only required if deployments must integrate nonstandard assets.
- Complexity problem: Full policy replacement is a broad extension point in a security boundary. It can weaken protections and creates another configuration path to test.
- Minimal alternative: Keep the hardcoded secure default and remove full override only after confirming no deployment uses custom assets. If customization is required, constrain it to documented current needs rather than accepting a whole policy string.
- Risk of simplification: Operators with reverse-proxy, CDN, or custom asset requirements may need the override.
- Tests needed before simplification: Helmet/CSP header tests; browser smoke for panel asset loading; deployment docs grep for custom CSP.
- Verification command or strategy: `rg -n "CONTENT_SECURITY_POLICY" .`; `cd apps/operate/panel && npm test && npm run test:e2e`.
- Confidence: medium

### MC-011

- File: `apps/maintain/updater/update_cs2.sh`, `apps/maintain/updater/tests/run.sh`
- Symbol / function / class / module: updater config parser and CLI/config normalization
- Suggested action: INVESTIGATE
- Current behavior: The updater maintains a config/trim variable list (`update_cs2.sh:154`), parses config files through `load_config_file` (`update_cs2.sh:227`), handles CLI config file loading (`update_cs2.sh:277`), and validates many shell config values. The tests exercise many combinations through `tests/run.sh`.
- Required behavior, if inferable: The updater needs safe, deterministic config for host update operations.
- Complexity problem: A host updater has a mini config framework with whitelists, trimming, aliases, validation, and compatibility behavior. Some of this may be justified by root/systemd safety; some may be accumulated flexibility.
- Minimal alternative: Do not simplify until active config forms are inventoried. If only documented `KEY=value` config is required, remove unsupported aliases/normalization paths and keep explicit validation.
- Risk of simplification: High. The updater controls host services and SteamCMD updates; config mistakes can stop updates or mutate wrong paths.
- Tests needed before simplification: Full updater `make test`, config parser tests for every documented key, dry-run tests, lock/service/user validation tests.
- Verification command or strategy: `cd apps/maintain/updater && make test && make lint && make security && make ci`.
- Confidence: low

### MC-012

- File: `apps/maintain/updater/update_cs2.sh`
- Symbol / function / class / module: removed config key compatibility warning
- Suggested action: INVESTIGATE
- Current behavior: The script tracks `REMOVED_CONFIG_KEYS` (`update_cs2.sh:158`), records removed keys during config parsing (`update_cs2.sh:212`), and warns about them later (`update_cs2.sh:341`).
- Required behavior, if inferable: Current config should reject unsupported keys or guide operators through a known migration window.
- Complexity problem: Compatibility state remains in the runtime script with no current evidence in this pass that removed keys are still active in supported configs.
- Minimal alternative: If the migration window is closed, delete the removed-key tracking and let unknown key validation fail directly. If still needed, document the deadline and exact removed keys.
- Risk of simplification: Operators with old config files may lose a helpful warning and get a harder failure.
- Tests needed before simplification: Config compatibility tests for old files; unknown-key failure tests; docs checks for migration guidance.
- Verification command or strategy: `rg -n "REMOVED_CONFIG_KEYS|removed" apps/maintain/updater`; `cd apps/maintain/updater && make test`.
- Confidence: medium

### MC-013

- File: `scripts/validate.sh`, `scripts/verify.sh`, `.github/workflows/ci.yml`, `apps/operate/panel/test/scripts.test.ts`
- Symbol / function / class / module: root validation wrapper
- Suggested action: INVESTIGATE
- Current behavior: `scripts/validate.sh` only execs `scripts/verify.sh` (`validate.sh:5`). `scripts/verify.sh` shellchecks and shfmt-checks both scripts (`verify.sh:139`, `verify.sh:145`) and then calls `scripts/validate.sh --require-docker` (`verify.sh:207`). CI runs `./scripts/verify.sh` (`.github/workflows/ci.yml:31`). Tests spawn `scripts/validate.sh` (`scripts.test.ts:70`).
- Required behavior, if inferable: The repo needs one broad verification entry point. `validate.sh` may be a compatibility entry point for older docs or operators.
- Complexity problem: A wrapper that delegates to the verifier creates a circular-looking verification path and duplicate public commands.
- Minimal alternative: Keep only `scripts/verify.sh` if no external docs/CI/operators invoke `validate.sh`; otherwise document `validate.sh` as a compatibility alias and stop treating it as an independent verifier.
- Risk of simplification: External workflows may still call `scripts/validate.sh`; tests/docs would need coordinated updates.
- Tests needed before simplification: Root verifier smoke; scripts test update; docs grep for validate command.
- Verification command or strategy: `rg -n "scripts/validate.sh|validate.sh --require-docker" .`; `./scripts/verify.sh`.
- Confidence: medium

### MC-014

- File: `apps/maintain/updater/scripts/ci-install-tools.sh`, `apps/maintain/updater/scripts/ci-tools-versions.env`, `.github/workflows/ci.yml`, `apps/maintain/updater/CONTRIBUTING.md`
- Symbol / function / class / module: pinned shell tool downloader
- Suggested action: INVESTIGATE
- Current behavior: `ci-install-tools.sh` downloads and verifies shellcheck/shfmt (`ci-install-tools.sh:107`, `ci-install-tools.sh:164`) using pinned versions/hashes. GitHub Actions installs shellcheck/shfmt through `apt` (`.github/workflows/ci.yml:28`). CONTRIBUTING documents the downloader for manual use.
- Required behavior, if inferable: Developers and CI need shellcheck and shfmt available.
- Complexity problem: A 200-line installer and hash manifest exist for a manual path while the primary CI path uses OS packages. This may be supply-chain hardening, but it is not the active CI mechanism.
- Minimal alternative: If local reproducibility does not require the downloader, document package-manager installation and delete the custom installer. If it is required, wire CI to it or explain why manual-only pinning is intentional.
- Risk of simplification: Developers without package-manager access may lose a reproducible bootstrap path; supply-chain hardening expectations may change.
- Tests needed before simplification: Updater lint/fmt/security checks on a clean environment; docs check for install instructions.
- Verification command or strategy: `cd apps/maintain/updater && make lint && make security`; CI workflow review.
- Confidence: medium

### MC-015

- File: `apps/operate/panel/db.ts`, `apps/operate/panel/test/migrations.test.ts`
- Symbol / function / class / module: SQLite baseline migration compatibility
- Suggested action: INVESTIGATE
- Current behavior: `db.ts` validates existing schema by version (`db.ts:97`), includes compatibility validation around version 1 migrations (`db.ts:161`, `db.ts:179`), creates later optional tables (`db.ts:194`, `db.ts:207`), and validates current schema (`db.ts:236`). Migration tests create and upgrade older schemas (`migrations.test.ts:97`, `migrations.test.ts:228`).
- Required behavior, if inferable: Existing panel databases must upgrade safely for supported releases. The supported oldest DB version is UNCLEAR from source references alone.
- Complexity problem: Backward compatibility paths increase migration complexity and can constrain simpler schema changes. However, deleting them without a support policy would risk data loss.
- Minimal alternative: Keep compatibility until a written support window identifies obsolete versions. Then replace old upgrade paths with a documented unsupported-version failure or a one-time export/import path.
- Risk of simplification: High. Existing operator databases could fail to start or lose data.
- Tests needed before simplification: Migration tests for every supported historical schema, current fresh install, and unsupported-version failure behavior.
- Verification command or strategy: `cd apps/operate/panel && npm test -- --test-name-pattern migration` if supported, otherwise `npm test`.
- Confidence: low

### MC-016

- File: `apps/operate/panel/tsconfig.json`, `apps/operate/panel/package.json`, `apps/operate/panel/test/mock-module.ts`
- Symbol / function / class / module: CommonJS TypeScript build with deprecation suppression
- Suggested action: REPLACE_DEPRECATED
- Current behavior: `tsconfig.json` compiles with `"module": "commonjs"` (`tsconfig.json:4`) and suppresses TypeScript deprecations through `"ignoreDeprecations": "6.0"` (`tsconfig.json:20`). The package engine pins Node `>=22 <23` (`package.json:61`).
- Required behavior, if inferable: The panel needs a build/test/runtime module format that works on supported Node 22.
- Complexity problem: Suppressing deprecations preserves an older module configuration and can hide build-system debt. This is not immediate runtime complexity, but it makes future changes riskier.
- Minimal alternative: Do not switch module systems casually. Plan a focused NodeNext/ESM or supported-CommonJS decision, then remove `ignoreDeprecations` only when tests/build prove the selected path.
- Risk of simplification: High. Module-format changes can break imports, tests, mocking, package exports, and runtime startup.
- Tests needed before simplification: Full panel build, client build, all tests, e2e, Docker/startup smoke.
- Verification command or strategy: `cd apps/operate/panel && npm run build && npm run build:client && npm test && npm run test:e2e`.
- Confidence: medium

### MC-017

- File: `apps/operate/panel/test/scripts.test.ts`
- Symbol / function / class / module: source/doc string assertions
- Suggested action: SIMPLIFY
- Current behavior: `scripts.test.ts` includes behavior coverage for `scripts/validate.sh` (`scripts.test.ts:10`) but also reads docs/templates/source files (`scripts.test.ts:98`, `scripts.test.ts:121`, `scripts.test.ts:134`) and asserts strings such as README/module wording and Redis source patterns.
- Required behavior, if inferable: Tests should fail when verification scripts, security contracts, or runtime behavior breaks.
- Complexity problem: Source-string and docs-string assertions make tests fragile and force implementation details into the test suite. They raise maintenance cost without directly proving behavior.
- Minimal alternative: Keep behavior tests for scripts and security contracts. Move docs consistency to docs lint only if needed, and avoid testing implementation strings where runtime behavior can be tested.
- Risk of simplification: Some documentation drift may no longer be caught by unit tests.
- Tests needed before simplification: Replacement behavior tests for any real contract currently guarded by string assertions.
- Verification command or strategy: `cd apps/operate/panel && npm test`; targeted review of `scripts.test.ts` assertions before removal.
- Confidence: high

### MC-018

- File: `apps/operate/panel/modules/rcon.ts`, `apps/operate/panel/test/rcon-manager.test.ts`
- Symbol / function / class / module: `PasswordProvider` and lazy DB import in `RconManager`
- Suggested action: INVESTIGATE
- Current behavior: `RconManager` accepts an optional `PasswordProvider` (`rcon.ts:47`, `rcon.ts:71`) and otherwise lazily imports the DB in its constructor path (`rcon.ts:71`). Tests instantiate `RconManager` directly (`rcon-manager.test.ts:110`, `rcon-manager.test.ts:129`, `rcon-manager.test.ts:148`, `rcon-manager.test.ts:189`).
- Required behavior, if inferable: Production needs to read the RCON password for a server and keep command execution serialized and authenticated.
- Complexity problem: The optional provider is a single production seam that exists mostly to make the class testable, and lazy DB import hides a real dependency. It makes the runtime dependency graph less explicit.
- Minimal alternative: Do not change the RCON state machine without proof. If tests can mock DB without a production-facing seam, remove the optional provider. If multiple production password sources are real, document them and keep the seam.
- Risk of simplification: High. RCON connection/auth flows are runtime-critical; removing the seam could make tests slower or require native DB setup.
- Tests needed before simplification: Full `RconManager` suite, route tests that execute RCON, repeated auth failure tests, shutdown tests, timeout tests.
- Verification command or strategy: `cd apps/operate/panel && npm test`; manual RCON smoke if available.
- Confidence: medium

### MC-019

- File: `apps/operate/panel/utils/parseServerId.ts`, `apps/operate/panel/routes/server.ts`, `apps/operate/panel/routes/status.ts`, `apps/operate/panel/routes/operator.ts`
- Symbol / function / class / module: server ID parser plus route access helpers
- Suggested action: SIMPLIFY
- Current behavior: `parseServerId.ts` contains a pure parser (`parseServerId.ts:3`), request/response helpers (`parseServerId.ts:16`, `parseServerId.ts:47`, `parseServerId.ts:72`), and lazy DB statement setup for server access checks (`parseServerId.ts:29`). The pure parser is used in multiple routes and tests, while access helpers are route-specific.
- Required behavior, if inferable: Routes need strict positive server ID parsing and authenticated access checks.
- Complexity problem: A module named like a pure parser owns Express response handling and DB access. That hides side effects and makes tests/imports less obvious.
- Minimal alternative: Keep the pure parser small. Move access checks to an explicitly route/auth-owned location only if multiple current route call sites need shared behavior; otherwise inline the checks where they are used.
- Risk of simplification: Medium. Error response shape and access-control behavior must remain identical.
- Tests needed before simplification: Parser unit tests, server route access tests, status/operator route authorization tests.
- Verification command or strategy: `cd apps/operate/panel && npm test`.
- Confidence: medium

### MC-020

- File: `apps/maintain/updater/update_cs2.sh`, `apps/maintain/updater/tests/run.sh`, `apps/maintain/updater/cs2-auto-update.conf.example`
- Symbol / function / class / module: test-only updater knobs `ALLOW_NONROOT` and `NO_SLEEP`
- Suggested action: SIMPLIFY
- Current behavior: The updater documents test helpers in the script header (`update_cs2.sh:14`), includes `ALLOW_NONROOT` and `NO_SLEEP` in config variables (`update_cs2.sh:149`, `update_cs2.sh:150`, `update_cs2.sh:154`), validates them (`update_cs2.sh:409`, `update_cs2.sh:412`), changes root/user behavior (`update_cs2.sh:462`, `update_cs2.sh:692`, `update_cs2.sh:716`), skips retry sleep (`update_cs2.sh:477`), and exposes them in the deployable config example (`cs2-auto-update.conf.example:26`, `cs2-auto-update.conf.example:27`). Tests use them heavily.
- Required behavior, if inferable: Production updater should run with the correct host privileges and retry timing. Tests need deterministic non-root/no-sleep execution.
- Complexity problem: Test harness controls are exposed as operator config, increasing the chance of production misconfiguration and making runtime behavior less direct.
- Minimal alternative: Keep test determinism, but stop presenting test-only controls as normal deployable config unless operators have a documented non-root/dry-run need.
- Risk of simplification: High for tests, medium for operators. Existing local test and dry-run workflows may rely on these variables.
- Tests needed before simplification: Full updater tests; explicit test harness setup that does not depend on deployable config examples; production/root validation tests.
- Verification command or strategy: `cd apps/maintain/updater && make test && make ci`.
- Confidence: medium

### MC-021

- File: `apps/operate/panel/test/mock-module.ts`, `apps/operate/panel/package.json`, `apps/operate/panel/test/*.test.ts`
- Symbol / function / class / module: Node 26 mock.module compatibility helper
- Suggested action: INVESTIGATE
- Current behavior: `package.json` pins Node `>=22 <23` (`package.json:61`), while `mock-module.ts` checks for Node major `>=26` and adapts `mock.module` options (`mock-module.ts:7`, `mock-module.ts:30`). Multiple tests import `mockModule`.
- Required behavior, if inferable: Tests need module mocking on supported Node 22.
- Complexity problem: The helper preserves compatibility with an unsupported future Node major. That may be useful for local drift, but it is not required by the declared runtime contract.
- Minimal alternative: If the project really supports only Node 22, remove the Node 26 branch and use the Node 22 mock shape directly. If developers are expected to test on newer Node, update the engine and CI contract instead.
- Risk of simplification: Developers running tests outside the declared engine range may lose compatibility; test mocks may break when Node changes APIs.
- Tests needed before simplification: Full panel test suite under the supported Node version; optional smoke under the newest local Node only if support is intended.
- Verification command or strategy: `cd apps/operate/panel && node -v && npm test`; CI matrix review.
- Confidence: medium

## KEEP: Simple Enough Or Risky Without More Proof

- `apps/provision/bootstrap/scripts/bootstrap-admins.sh`: direct file copy/bootstrap behavior; no abstraction problem found.
- `apps/provision/bootstrap/scripts/bootstrap-plugins.sh`: direct plugin bootstrap behavior; no abstraction problem found.
- `configs/examples/startup/server-start.sh`: longer than the bootstrap scripts, but the length is tied to runtime safety, path validation, and secret/argv handling. Do not shrink without a concrete bug.
- `apps/operate/panel/modules/rcon.ts` core queue/connection/shutdown logic: stateful and runtime-critical. Only the seam/config findings above are simplification candidates.
- `apps/maintain/updater/update_cs2.sh` core lock, service, SteamCMD, disk-space, and retry behavior: runtime-critical. Do not simplify merely because it is long.
- `apps/operate/panel/utils/logger.ts`, `utils/rconResponse.ts`, `utils/rconDisplay.ts`, `utils/mapsConfig.ts`, `modules/middleware.ts`, `routes/auth.ts`, and `routes/game/index.ts`: no evidence-backed minimum-code issue from this pass.
- Browser custom confirmation UI in `common.ts`: not flagged. Replacing it with native `confirm()` would simplify code but could reduce styling/accessibility consistency; no evidence supports that tradeoff.

## Remaining Uncertainty

- Active operator usage of RCON autocomplete, persisted command history, and workshop favorites is UNCLEAR.
- Active deployments using `DEFAULT_PORT`, `REDIS_HOST`/`REDIS_PORT`, custom CSP, or `RCON_AUTH_TIMEOUT_MS` are UNCLEAR.
- The supported oldest SQLite schema version is UNCLEAR.
- Whether `scripts/validate.sh` is an external public contract is UNCLEAR.
- Whether the updater's pinned local tool installer is a required supply-chain control or a stale bootstrap helper is UNCLEAR.
- Whether Node 26 test compatibility is intentional despite the Node 22 engine contract is UNCLEAR.

## Prioritized Remediation Table

| Priority | ID | Suggested action | Why this priority | Minimal next step | Main verification |
| --- | --- | --- | --- | --- | --- |
| 1 | MC-006 | DEDUPLICATE | Duplicate request helpers can create inconsistent CSRF/error behavior across UI paths. | Inventory current browser request call sites and replace with one shared helper only if response semantics match. | `cd apps/operate/panel && npm run build:client && npm test && npm run test:e2e` |
| 2 | MC-010 | INVESTIGATE | Full CSP override can hide weakened security state. | Prove whether any deployment uses custom CSP; if not, remove override in a focused security PR. | CSP header tests plus `npm run test:e2e` |
| 3 | MC-018 | INVESTIGATE | RCON dependency seams hide state in a runtime-critical path. | Prove whether the password provider has any production call site; preserve RCON behavior before simplifying. | Full `RconManager` and route tests; manual RCON smoke if available |
| 4 | MC-009 | SIMPLIFY | Test-driven timeout config can change production auth behavior. | Determine whether operators use `RCON_AUTH_TIMEOUT_MS`; remove or keep as documented runtime config. | RCON auth timeout/success tests |
| 5 | MC-020 | SIMPLIFY | Test-only updater knobs are exposed as deployable config and can alter host safety behavior. | Separate test harness controls from operator config docs if no production need exists. | `cd apps/maintain/updater && make test && make ci` |
| 6 | MC-001 | INVESTIGATE | Autocomplete adds cache/RCON discovery failure modes around optional console help. | Gather operator usage; remove dynamic autocomplete if raw command entry is sufficient. | Panel tests, e2e console smoke, manual RCON smoke |
| 7 | MC-002 | INVESTIGATE | Persisted history increases schema/API/UI/privacy surface for a convenience feature. | Decide if persisted history is required; otherwise plan schema/UI removal with migration proof. | Panel tests plus migration tests |
| 8 | MC-003 | INVESTIGATE | Workshop favorites turn simple ID launch into full CRUD/storage behavior. | Prove favorites are actively used; otherwise keep direct ID launch only. | Panel tests, e2e, workshop launch smoke |
| 9 | MC-019 | SIMPLIFY | Parser utility hides Express and DB side effects. | Keep pure parsing separate from route access only where current call sites justify shared code. | Parser and route authorization tests |
| 10 | MC-004 | INLINE | Low-risk single-use-ish route factory hides two simple handlers. | Inline only after preserving exact responses and partial-failure behavior. | Game route preset tests |
| 11 | MC-005 | INLINE | Mutable browser context hides one page value. | Pass/read server ID directly in manage page code. | Client build and e2e manage smoke |
| 12 | MC-017 | SIMPLIFY | Brittle source/doc string tests make changes harder than necessary. | Replace source-string assertions with behavior checks or docs lint where needed. | Panel test suite |
| 13 | MC-007 | INVESTIGATE | Duplicate port env names widen deployment state. | Grep docs/deployments for `DEFAULT_PORT`; remove only if unused. | Entrypoint tests and docs grep |
| 14 | MC-008 | INVESTIGATE | Duplicate Redis config shapes complicate production validation. | Prove whether host/port aliases are used; standardize only after migration notes. | Startup tests and config/docs grep |
| 15 | MC-013 | INVESTIGATE | Verification wrapper creates duplicate public commands. | Determine whether `validate.sh` is a public compatibility contract. | `./scripts/verify.sh` and scripts tests |
| 16 | MC-014 | INVESTIGATE | Manual pinned downloader duplicates CI package installation. | Decide whether manual reproducibility is required; align docs and CI with that decision. | Updater lint/security checks |
| 17 | MC-012 | INVESTIGATE | Removed-key tracking may preserve obsolete config behavior. | Identify removed keys and migration deadline before deletion. | Updater config tests |
| 18 | MC-011 | INVESTIGATE | Updater config framework may be bigger than needed, but is high-risk host code. | Inventory supported config forms before any parser change. | `make test && make lint && make security && make ci` |
| 19 | MC-015 | INVESTIGATE | Migration compatibility may be obsolete, but unsafe to simplify without support policy. | Define oldest supported DB version and add unsupported-version tests. | Migration tests and full panel tests |
| 20 | MC-016 | REPLACE_DEPRECATED | Module-system debt is real but broad and high-blast-radius. | Plan a focused build-system migration separately from feature cleanup. | Build, client build, tests, e2e, startup smoke |
| 21 | MC-021 | INVESTIGATE | Unsupported Node compatibility may be stale, but test mocks use it widely. | Decide supported Node range first; then simplify helper or update engine/CI. | `node -v` plus full panel tests |
