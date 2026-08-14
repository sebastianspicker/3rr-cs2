# Simplicity, Test-Quality, And Certainty Audit

Date: 2026-05-26

This document consolidates four source audits:

- `docs/overengineering-index.md`
- `docs/minimum-code-audit.md`
- `docs/test-intent-audit.md`
- `docs/fail-loud-audit.md`

It is a docs-only consolidation. It does not introduce new code findings beyond
the source audits. When a source audit marked usage or intent as `UNCLEAR`, that
uncertainty is preserved here.

## Executive Summary

The strongest cross-audit themes are:

1. Optional operator conveniences have grown into schema, API, browser UI, and
   test surface without current usage proof: RCON autocomplete, persisted RCON
   history, and workshop favorites.
2. Several runtime surfaces report certainty that the code has not proven:
   RCON startup readiness, server list status, manage-page badges, game-control
   success messages, backup restore/list responses, service restart success,
   and cleanup completion.
3. Test coverage is uneven around intent. Many tests cover rejection paths or
   helper examples well, but important success paths often assert status/message
   instead of state, RCON commands, storage, isolation, or failure propagation.
4. A few low-risk simplifications are clear once behavior is protected:
   `makeMultiPresetRoute`, the browser server ID context module, duplicated
   browser request helpers, and brittle source-string tests.
5. The riskiest areas should not be simplified casually: RCON manager state,
   SQLite migrations, updater service coordination, security-related config, and
   route authorization helpers.

No source audit produced a P0. The highest-priority work is P1 fail-loud and
test-coverage work around RCON readiness/status, game-control truthfulness,
server deletion/cleanup, updater start verification, and credential error
classification.

## Source Audit Coverage

| Source audit | Coverage used here | Notes |
| --- | --- | --- |
| `docs/overengineering-index.md` | `OE-001` through `OE-019` | All findings are represented. Items marked `UNCLEAR` remain investigation-first. |
| `docs/minimum-code-audit.md` | `MC-001` through `MC-021` | All findings are represented. `KEEP` items are listed under remaining uncertainty and non-target areas. |
| `docs/test-intent-audit.md` | `TIA-001` through `TIA-021` | All findings are represented, including weak tests and missing tests. Valuable tests are preserved in the verification strategy. |
| `docs/fail-loud-audit.md` | `FLA-001` through `FLA-021` | All findings are represented. Source severities are retained unless grouped with adjacent lower-risk test gaps. |

Scope limitations inherited from the source audits:

- Findings reflect the current dirty working tree, not a clean release tag.
- No live CS2 server, SteamCMD host, systemd service, Redis service, or RCON
  endpoint was exercised.
- Generated assets, dependency trees, screenshots, runtime databases, and
  archived docs were excluded as source of runtime truth.
- External operator usage is unknown for several config and optional-feature
  paths.

## Consolidated Findings Index

| ID | Theme | Severity | Source IDs | Short title |
| --- | --- | --- | --- | --- |
| STC-MC-001 | MINIMUM_CODE | P2 | OE-001, MC-001 | RCON autocomplete is an unproven cross-layer feature |
| STC-MC-002 | MINIMUM_CODE | P2 | OE-002, MC-002 | Persisted RCON history adds schema/API/UI surface |
| STC-MC-003 | MINIMUM_CODE | P2 | OE-003, MC-003 | Workshop favorites turn one-shot launch into CRUD |
| STC-MC-004 | MINIMUM_CODE | P2 | OE-004, MC-004 | `makeMultiPresetRoute` abstracts two endpoints |
| STC-MC-005 | MINIMUM_CODE | P2 | OE-005, MC-005 | Browser server ID context hides one page value |
| STC-MC-006 | MINIMUM_CODE | P2 | OE-006, MC-006 | Browser JSON request helpers duplicate behavior |
| STC-MC-007 | MINIMUM_CODE | P2 | OE-007, MC-007 | `DEFAULT_PORT` is an unproven port alias |
| STC-MC-008 | MINIMUM_CODE | P2 | OE-008, MC-008 | Redis endpoint config has duplicate shapes |
| STC-MC-009 | MINIMUM_CODE | P2 | OE-009, MC-009 | `RCON_AUTH_TIMEOUT_MS` looks test-driven |
| STC-MC-010 | MINIMUM_CODE | P2 | OE-010, MC-010 | Full CSP override is an unproven extension point |
| STC-MC-011 | MINIMUM_CODE | P2 | OE-011, OE-012, MC-011, MC-012 | Updater config parser and removed-key compatibility are broad |
| STC-MC-012 | MINIMUM_CODE | P3 | OE-013, MC-013 | `scripts/validate.sh` is a verifier wrapper |
| STC-MC-013 | MINIMUM_CODE | P2 | OE-014, MC-014 | Manual pinned shell-tool downloader duplicates CI install path |
| STC-MC-014 | MINIMUM_CODE | P2 | OE-015, MC-015 | SQLite migration compatibility needs support-window proof |
| STC-MC-015 | MINIMUM_CODE | P2 | OE-016, MC-016 | CommonJS deprecation suppression preserves build-system debt |
| STC-MC-016 | MINIMUM_CODE | P2 | OE-018, MC-018 | RCON password provider/lazy DB seam hides dependency shape |
| STC-MC-017 | MINIMUM_CODE | P2 | OE-019, MC-019 | `parseServerId` mixes parsing, Express responses, and DB access |
| STC-MC-018 | MINIMUM_CODE | P1 | MC-020 | Updater test-only knobs are exposed as deployable config |
| STC-MC-019 | MINIMUM_CODE | P2 | MC-021 | Node 26 mock helper exceeds declared Node 22 contract |
| STC-TI-001 | TEST_INTENT | P2 | OE-017, MC-017, TIA-001, TIA-002 | Source-string tests mirror implementation and docs text |
| STC-TI-002 | TEST_INTENT | P1 | TIA-003 | Add-server success tests do not prove persistence/access/RCON |
| STC-TI-003 | TEST_INTENT | P1 | TIA-004, FLA-003 | Server-list tests do not prove scope or truthful status |
| STC-TI-004 | TEST_INTENT | P1 | TIA-005, FLA-021 | Delete-server success and cleanup failure behavior are untested |
| STC-TI-005 | TEST_INTENT | P1 | TIA-006, TIA-007, FLA-005, FLA-006 | Game/setup route success tests assert outcomes weakly |
| STC-TI-006 | TEST_INTENT | P1 | TIA-008 | Workshop favorite scoping test does not test cross-scope access |
| STC-TI-007 | TEST_INTENT | P2 | TIA-009, FLA-010 | RCON history tests do not prove failed commands are excluded |
| STC-TI-008 | TEST_INTENT | P1 | TIA-010 | Manage-page E2E checks visibility more than behavior |
| STC-TI-009 | TEST_INTENT | P2 | TIA-011 | CSRF route matrix is incomplete |
| STC-TI-010 | TEST_INTENT | P2 | TIA-012, TIA-021, FLA-020 | Forced test exit and version skip can hide coverage gaps |
| STC-TI-011 | TEST_INTENT | P1 | TIA-013 | RCON protocol-level integration coverage is missing |
| STC-TI-012 | TEST_INTENT | P1 | TIA-014, FLA-013, FLA-015 | RCON shutdown/remove/heartbeat transitions need tests |
| STC-TI-013 | TEST_INTENT | P1 | TIA-015, FLA-018 | Updater tests do not prove stop/update/start order or active service |
| STC-TI-014 | TEST_INTENT | P2 | TIA-016, FLA-019 | Updater config tests assert generic success/defaults |
| STC-TI-015 | TEST_INTENT | P1 | TIA-017, MC-015 | Migration tests miss constraints, indexes, and cascades |
| STC-TI-016 | TEST_INTENT | P1 | TIA-018, FLA-016 | RCON secret tests miss malformed/tampered/wrong-key failures |
| STC-TI-017 | TEST_INTENT | P3 | TIA-019, TIA-020 | Utility and bundled route tests obscure behavioral intent |
| STC-FL-001 | FAIL_LOUD | P1 | FLA-001, FLA-002 | RCON init and health/readiness hide failed RCON startup |
| STC-FL-002 | FAIL_LOUD | P1 | FLA-003, FLA-004 | Server list and manage page collapse unknown status |
| STC-FL-003 | FAIL_LOUD | P1 | FLA-005 | Game-control success messages overclaim RCON effects |
| STC-FL-004 | FAIL_LOUD | P1 | FLA-006 | Setup-game stores desired state as if runtime state is proven |
| STC-FL-005 | FAIL_LOUD | P1 | FLA-007, FLA-008 | Backup routes report none when response is malformed or empty |
| STC-FL-006 | FAIL_LOUD | P1 | FLA-009 | `/api/rcon` can hide command-sent/history-failed partial success |
| STC-FL-007 | FAIL_LOUD | P2 | FLA-010 | RCON history calls resolved commands successful |
| STC-FL-008 | FAIL_LOUD | P2 | FLA-011 | RCON history UI renders fetch failure as empty history |
| STC-FL-009 | FAIL_LOUD | P2 | FLA-012 | Server-card player-count fetch failures are silent |
| STC-FL-010 | FAIL_LOUD | P2 | FLA-013, FLA-014, FLA-015 | Cleanup/shutdown failures can be hidden behind success logs |
| STC-FL-011 | FAIL_LOUD | P1 | FLA-016 | RCON secret decrypt failures are reported as auth failures |
| STC-FL-012 | FAIL_LOUD | P2 | FLA-017 | Workshop favorite update maps all DB errors to conflict |
| STC-FL-013 | FAIL_LOUD | P1 | FLA-018 | Updater start/update success lacks post-start active proof |
| STC-FL-014 | FAIL_LOUD | P2 | FLA-019 | Updater config unknown keys and explicit empty values hide misconfig |
| STC-FL-015 | FAIL_LOUD | P2 | FLA-020 | Test command can claim pass while hiding open handles or skipped file coverage |

## Minimum-Code Findings

### STC-MC-001

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-001`, `MC-001`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/routes/operator.ts`; `apps/operate/panel/utils/rconParsers.ts`; `apps/operate/panel/public/ts/manage.ts`; `apps/operate/panel/views/manage.ejs`
- Symbol or line range: RCON autocomplete endpoint, cache, parser, and UI
- Evidence: Source audits cite server-side autocomplete cache and TTLs, `cmdlist`/`cvarlist` discovery, `parseAutocompleteOutput`, `/api/rcon/autocomplete/:server_id`, and manage-page Suggest UI. Active operator need is `UNCLEAR`.
- Why it matters: A raw RCON console requires command submission and output. Dynamic discovery adds RCON calls, parser logic, cache invalidation, UI state, and failure handling around an optional convenience.
- Suggested remediation: First prove usage. If absent, remove dynamic autocomplete and keep raw command entry. If retained, make failure states explicit and keep the parser surface narrow.
- Test or verification needed: RCON console submit/response tests, browser smoke for command entry, and autocomplete/parser tests only if the feature remains.
- Risk of change: Medium. Operators could lose command discovery and existing autocomplete tests would need removal or rewrite.
- Confidence: medium

### STC-MC-002

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-002`, `MC-002`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/db.ts`; `apps/operate/panel/utils/rconHistory.ts`; `apps/operate/panel/routes/operator.ts`; `apps/operate/panel/public/ts/manage.ts`; `apps/operate/panel/views/manage.ejs`
- Symbol or line range: persisted RCON command history
- Evidence: Source audits cite `rcon_command_history`, upsert/prune/list/clear operations, list/clear endpoints, `/api/rcon` history recording, and manage-page history UI.
- Why it matters: The minimum console behavior is send command plus show response. Persisted history adds schema, migration, pruning, route, UI, privacy, and test surface.
- Suggested remediation: Decide whether persisted history is required. If not, remove persistence and keep browser-local recall or no recall. If retained, document retention and fix the fail-loud semantics in `STC-FL-006` through `STC-FL-008`.
- Test or verification needed: Console command tests, migration behavior for retained/removed tables, history isolation tests if kept.
- Risk of change: Medium. Operators may lose cross-session recall and existing databases may keep unused tables unless a schema policy is defined.
- Confidence: medium

### STC-MC-003

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-003`, `MC-003`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/db.ts`; `apps/operate/panel/routes/operator.ts`; `apps/operate/panel/public/ts/manage.ts`; `apps/operate/panel/views/manage.ejs`
- Symbol or line range: workshop favorites CRUD
- Evidence: Source audits cite the `workshop_favorites` table, CRUD statements and routes, manage-page render/edit/delete/launch code, and favorites UI. API docs document one-shot workshop map/collection routes but not favorites; active operator need is `UNCLEAR`.
- Why it matters: Loading a workshop map only needs a workshop ID and one RCON command. Favorites add persistent CRUD, unique constraints, UI edit state, and conflict handling.
- Suggested remediation: Prove operator usage before retaining server-side favorites. If no usage proof exists, keep direct workshop ID launch only.
- Test or verification needed: Workshop launch by raw ID; favorite CRUD, scoping, and migration tests only if retained.
- Risk of change: Medium. Users could lose saved favorites and stored rows may become unused without a cleanup plan.
- Confidence: medium

### STC-MC-004

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-004`, `MC-004`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/routes/game/helpers.ts`; `apps/operate/panel/routes/game/controls.ts`
- Symbol or line range: `makeMultiPresetRoute`
- Evidence: Source audits cite a generic route factory used only by `/api/set-startmoney` and `/api/set-roundtime`.
- Why it matters: Two concrete endpoints are routed through a callback-based mini-framework that hides the command sequence while saving little code.
- Suggested remediation: Inline the two handlers, preserving validation, status codes, logging, and partial sequence failure behavior.
- Test or verification needed: Existing route tests for both endpoints, including malformed values and partial RCON command failure.
- Risk of change: Low to medium. Response shapes and partial-failure behavior must remain identical.
- Confidence: high

### STC-MC-005

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-005`, `MC-005`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/public/ts/context.ts`; `apps/operate/panel/public/ts/console.ts`; `apps/operate/panel/public/ts/manage.ts`
- Symbol or line range: module-scoped browser server ID context
- Evidence: Source audits cite `context.ts` storing a mutable module-level server ID, `console.ts` setting it once, and `manage.ts` reading it indirectly for API calls.
- Why it matters: The manage page has one server ID available from the DOM. A mutable context module hides initialization order and makes tests less explicit.
- Suggested remediation: Pass the server ID into the manage-page initializer or read it once locally.
- Test or verification needed: Client build and manage-page E2E for at least one server-scoped action.
- Risk of change: Medium. Initialization mistakes could send empty or stale `server_id`.
- Confidence: medium

### STC-MC-006

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-006`, `MC-006`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/public/ts/common.ts`; `apps/operate/panel/public/ts/manage.ts`; `apps/operate/panel/public/ts/servers.ts`
- Symbol or line range: `sendPostRequest`, `fetchJson`, `sendJson`
- Evidence: Source audits cite duplicated CSRF headers, 401 redirect behavior, JSON parsing, error parsing, and request dispatch across browser helpers.
- Why it matters: Two request stacks can drift on session expiry, CSRF, error messages, and empty/non-JSON responses.
- Suggested remediation: Use one existing shared request helper with method/body options for current real call sites; avoid adding a broader framework.
- Test or verification needed: Client build plus route/browser tests for POST commands, GET players/autocomplete/history/favorites, PATCH favorite, and DELETE favorite/history.
- Risk of change: Medium. Subtle response parsing or toast behavior can change.
- Confidence: high

### STC-MC-007

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-007`, `MC-007`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/app.ts`
- Symbol or line range: `DEFAULT_PORT` fallback
- Evidence: Source audits cite `PORT || DEFAULT_PORT || 3000`, while current checked env/docs references document `PORT`; `DEFAULT_PORT` usage outside the fallback was not found in live code/docs by the source audits.
- Why it matters: Two env names configure one bind port and widen deployment state without a visible current contract.
- Suggested remediation: Use only `PORT` plus default `3000` after proving no deployment path uses `DEFAULT_PORT`.
- Test or verification needed: `rg -n "DEFAULT_PORT" .`, bind-port tests for `PORT` and default behavior, and startup/Docker smoke.
- Risk of change: Medium because hidden deployments may still set only `DEFAULT_PORT`.
- Confidence: medium

### STC-MC-008

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-008`, `MC-008`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/app.ts`; `apps/operate/panel/utils/redis.ts`; `apps/operate/panel/.env.example`
- Symbol or line range: `REDIS_URL` versus `REDIS_HOST`/`REDIS_PORT`
- Evidence: Source audits cite production startup allowing either config shape and `redis.ts` building a URL from host/port. README docs found in the audit emphasize `REDIS_URL`; `.env.example` lists all three.
- Why it matters: Duplicate config shapes complicate validation and can hide deployment differences.
- Suggested remediation: Standardize on `REDIS_URL` only if compose/systemd/operator evidence does not require host/port aliases.
- Test or verification needed: `rg -n "REDIS_HOST|REDIS_PORT|REDIS_URL" .`, production Redis startup tests, and Redis-enabled smoke or mocked startup coverage.
- Risk of change: Medium because existing deployments may rely on host/port variables.
- Confidence: medium

### STC-MC-009

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-009`, `MC-009`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/modules/rcon.ts`; `apps/operate/panel/test/rcon-manager.test.ts`
- Symbol or line range: `RCON_AUTH_TIMEOUT_MS`
- Evidence: Source audits cite production env parsing for auth timeout and tests setting it to `50`; current docs show `RCON_COMMAND_TIMEOUT_MS` but not `RCON_AUTH_TIMEOUT_MS`.
- Why it matters: A test-speed knob appears to be production-facing, increasing runtime configuration state.
- Suggested remediation: Keep a fixed production auth timeout unless operator usage is proven; make tests deterministic without exposing a production env knob.
- Test or verification needed: RCON auth timeout, successful auth, command timeout, reconnect, and shutdown tests.
- Risk of change: Medium. Hidden deployments with slow auth may use the knob.
- Confidence: medium

### STC-MC-010

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-010`, `MC-010`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/app.ts`; `apps/operate/panel/.env.example`
- Symbol or line range: `CONTENT_SECURITY_POLICY` override
- Evidence: Source audits cite a full CSP override env var replacing generated nonce-based CSP. Real deployment need is `UNCLEAR`.
- Why it matters: Full policy replacement is a broad security configuration surface that can weaken defaults and must be tested separately.
- Suggested remediation: Remove the override if no deployment uses it, or constrain customization to documented additions that preserve nonce-based script policy.
- Test or verification needed: CSP header tests, browser asset smoke, and `rg -n "CONTENT_SECURITY_POLICY" .`.
- Risk of change: Medium. Reverse-proxy, CDN, or custom asset deployments may rely on custom CSP.
- Confidence: medium

### STC-MC-011

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-011`, `OE-012`, `MC-011`, `MC-012`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/maintain/updater/update_cs2.sh`; `apps/maintain/updater/tests/run.sh`; `apps/maintain/updater/cs2-auto-update.conf.example`
- Symbol or line range: updater config parser, normalization, and removed-key warning path
- Evidence: Source audits cite a hand-rolled config parser with whitelists, comment/quote handling, trimming, removed-key detection, validation, and tests. Active config forms and removed-key support window are `UNCLEAR`.
- Why it matters: A host updater needs safe config, but the current parser is larger than the documented simple `KEY=value` example and preserves obsolete-key compatibility.
- Suggested remediation: Inventory supported config forms first. If only documented `KEY=value` is required, remove unsupported aliases/normalization paths and close the removed-key warning window with a migration note.
- Test or verification needed: Full updater config tests for every supported key, removed/unknown key behavior, dry-run, lock/service/user validation, and `make ci`.
- Risk of change: High. Updater config mistakes can stop services or mutate wrong paths.
- Confidence: low for parser simplification; medium for removed-key cleanup after a support-window decision

### STC-MC-012

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-013`, `MC-013`
- Theme: MINIMUM_CODE
- Severity: P3
- File: `scripts/validate.sh`; `scripts/verify.sh`; `.github/workflows/ci.yml`; `apps/operate/panel/test/scripts.test.ts`
- Symbol or line range: root validation wrapper
- Evidence: Source audits cite `scripts/validate.sh` as an `exec` wrapper around `scripts/verify.sh`; CI runs `./scripts/verify.sh`; tests and verifier still include the wrapper.
- Why it matters: Two public command names imply two paths while one simply delegates.
- Suggested remediation: Keep only `scripts/verify.sh` if `validate.sh` is not an external contract. Otherwise document it as a compatibility alias.
- Test or verification needed: `rg -n "scripts/validate.sh|validate.sh --require-docker" .`, root verifier smoke, scripts tests, and docs update.
- Risk of change: Medium external compatibility risk; low code risk.
- Confidence: medium

### STC-MC-013

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-014`, `MC-014`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/maintain/updater/scripts/ci-install-tools.sh`; `apps/maintain/updater/scripts/ci-tools-versions.env`; `.github/workflows/ci.yml`; `apps/maintain/updater/CONTRIBUTING.md`
- Symbol or line range: pinned shellcheck/shfmt installer
- Evidence: Source audits cite a downloader plus hash manifest for manual setup while GitHub Actions installs shellcheck/shfmt through `apt`.
- Why it matters: The repo maintains a supply-chain downloader that is not the active CI path. It may be useful, but the reason is not proven by current CI evidence.
- Suggested remediation: Decide whether manual reproducibility requires this path. If not, document package-manager installation and delete the custom installer. If yes, wire CI to it or explain manual-only pinning.
- Test or verification needed: Updater lint/fmt/security checks on a clean environment and docs check for install instructions.
- Risk of change: Medium. Contributors may rely on the one-command setup path.
- Confidence: medium

### STC-MC-014

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`, `docs/test-intent-audit.md`
- Original finding ID(s): `OE-015`, `MC-015`, `TIA-017`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/db.ts`; `apps/operate/panel/test/migrations.test.ts`
- Symbol or line range: SQLite baseline migration compatibility
- Evidence: Source audits cite old schema validation, baseline compatibility, legacy-column backfills, and tests that create older schemas. The supported oldest schema version is `UNCLEAR`.
- Why it matters: Old compatibility increases migration complexity, but removing it without a support policy risks operator data.
- Suggested remediation: Define the supported oldest DB version. Keep compatibility until that policy exists; then replace obsolete upgrade paths with documented unsupported-version failure or export/import guidance.
- Test or verification needed: Migration tests for every supported historical schema, fresh install, unsupported-version failure, constraints, indexes, and cascades.
- Risk of change: High. Existing operator databases could fail to start or lose data.
- Confidence: low for simplification readiness; high that more migration proof is needed

### STC-MC-015

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-016`, `MC-016`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/tsconfig.json`; `apps/operate/panel/package.json`; `apps/operate/panel/test/mock-module.ts`
- Symbol or line range: CommonJS build with `ignoreDeprecations`
- Evidence: Source audits cite CommonJS module output, `ignoreDeprecations: "6.0"`, Node 22 engine pinning, and mock/import compatibility concerns.
- Why it matters: Compiler deprecation suppression preserves build-system debt and can hide future migration risk.
- Suggested remediation: Make a dedicated module-system decision. Do not combine it with unrelated cleanup.
- Test or verification needed: Full panel build, client build, unit tests, e2e, Docker/startup smoke, and mock-module tests.
- Risk of change: High. Module-format changes can break imports, mocks, compiled output, Docker startup, and e2e boot.
- Confidence: medium

### STC-MC-016

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-018`, `MC-018`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/modules/rcon.ts`; `apps/operate/panel/test/rcon-manager.test.ts`
- Symbol or line range: `PasswordProvider`, constructor injection, lazy DB import
- Evidence: Source audits cite an optional password provider, lazy `require("../db")`, production singleton usage, and tests instantiating `RconManager` with fake providers.
- Why it matters: A runtime-critical class carries a dependency seam mostly for testability and import-order compatibility. The seam may be justified, but production usage proof is absent.
- Suggested remediation: Do not change the RCON state machine until tests are stronger. If there is only one production password source, make the dependency explicit through a factory or route boundary.
- Test or verification needed: Full `RconManager` suite, route RCON tests, auth failure, shutdown, timeout, reconnect/password rotation, and compiled startup smoke.
- Risk of change: High because RCON connection/auth flows are runtime-critical.
- Confidence: medium

### STC-MC-017

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `OE-019`, `MC-019`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/utils/parseServerId.ts`; `apps/operate/panel/routes/server.ts`; `apps/operate/panel/routes/status.ts`; `apps/operate/panel/routes/operator.ts`
- Symbol or line range: parser plus route access helpers
- Evidence: Source audits cite a pure parser living with Express response helpers, session inspection, lazy DB statement setup, and authorization checks.
- Why it matters: A module named like a parser owns route side effects and DB access, hiding authorization behavior behind parsing.
- Suggested remediation: Keep pure parsing small. Move access checks to route/auth-owned code only after preserving current response shapes and access behavior.
- Test or verification needed: Parser unit tests and server/status/operator route authorization tests for missing, invalid, unauthorized, and authorized IDs.
- Risk of change: Medium. Access-control response drift is high-impact.
- Confidence: medium

### STC-MC-018

- Source audit(s): `docs/minimum-code-audit.md`
- Original finding ID(s): `MC-020`
- Theme: MINIMUM_CODE
- Severity: P1
- File: `apps/maintain/updater/update_cs2.sh`; `apps/maintain/updater/tests/run.sh`; `apps/maintain/updater/cs2-auto-update.conf.example`
- Symbol or line range: `ALLOW_NONROOT` and `NO_SLEEP`
- Evidence: Source audit cites test helper controls in script variables, validation, runtime branches, deployable config example, and heavy test usage.
- Why it matters: Test harness controls are exposed as operator config and can alter host privilege and retry timing behavior.
- Suggested remediation: Keep test determinism but stop presenting test-only controls as normal deployable config unless operator need is documented.
- Test or verification needed: Full updater tests and explicit test harness setup that does not depend on deployable config examples.
- Risk of change: High for tests, medium for operators using local dry-run/non-root workflows.
- Confidence: medium

### STC-MC-019

- Source audit(s): `docs/minimum-code-audit.md`
- Original finding ID(s): `MC-021`
- Theme: MINIMUM_CODE
- Severity: P2
- File: `apps/operate/panel/test/mock-module.ts`; `apps/operate/panel/package.json`; `apps/operate/panel/test/*.test.ts`
- Symbol or line range: Node 26 `mock.module` compatibility helper
- Evidence: Source audit cites package engine `>=22 <23` while `mock-module.ts` carries a Node major `>=26` branch used by tests.
- Why it matters: A future unsupported Node compatibility branch increases test helper complexity without matching the declared runtime contract.
- Suggested remediation: Decide supported Node range first. If Node 22 only, remove the Node 26 branch. If newer Node is intended, update engine and CI contract.
- Test or verification needed: `node -v`, full panel tests under supported Node, and CI matrix review.
- Risk of change: Medium. Developers outside the declared engine range may lose local compatibility.
- Confidence: medium

## Test-Intent Findings

### STC-TI-001

- Source audit(s): `docs/overengineering-index.md`, `docs/minimum-code-audit.md`, `docs/test-intent-audit.md`
- Original finding ID(s): `OE-017`, `MC-017`, `TIA-001`, `TIA-002`
- Theme: TEST_INTENT
- Severity: P2
- File: `apps/operate/panel/test/scripts.test.ts`
- Symbol or line range: docs/source-string assertions; `server route keeps add-server limiter Redis-capable`
- Evidence: Source audits cite tests that grep docs, `.gitignore`, templates, Redis limiter source strings, and implementation names such as `RateLimitRedisStore`.
- Why it matters: These tests can pass while runtime auth, XSS, tracking, or limiter behavior is broken, and can fail during harmless wording/refactor changes.
- Suggested remediation: Replace source-string tests with behavior tests where runtime behavior matters; move public docs wording checks to a lightweight docs contract if required.
- Test or verification needed: HTTP auth/CSRF tests, DOM rendering test for malicious usernames, and production-like rate limiter behavior/fail-closed tests.
- Risk of change: Low to medium. Some docs drift guards may be lost unless moved deliberately.
- Confidence: high

### STC-TI-002

- Source audit(s): `docs/test-intent-audit.md`
- Original finding ID(s): `TIA-003`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/server-crud.test.ts`
- Symbol or line range: add-server success tests
- Evidence: Source audit cites tests asserting only HTTP `201` and a success message while production also resolves/validates host, probes RCON, encrypts password, inserts server/access rows, connects RCON, and scopes visibility.
- Why it matters: The route could return success while skipping persistence, access grants, encryption, or connect behavior.
- Suggested remediation: Add integration-level assertions for persisted rows, access scope, encrypted password when key is configured, `probeServer`, `connectServer`, and visible `/api/servers` output.
- Test or verification needed: Add-server success, duplicate, server-limit, DNS rejection, encrypted password, failed probe, and failed post-save connect cases.
- Risk of change: Medium. Stronger tests may expose behavior changes needed in production code.
- Confidence: high

### STC-TI-003

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-004`, `FLA-003`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/server-crud.test.ts`; `apps/operate/panel/routes/server.ts`; `apps/operate/panel/public/ts/servers.ts`
- Symbol or line range: `GET /api/servers` tests and status aggregation
- Evidence: Source audits cite a test that only checks `body.servers` is an array while the endpoint filters per user and maps RCON observation into `connected`/`authenticated` booleans.
- Why it matters: The test would pass if another user's server leaked, the list was always empty, or unknown RCON state was shown as disconnected.
- Suggested remediation: Add tests for access scoping, server identity, hostname/status source, slow probe timeout, and unknown status rendering.
- Test or verification needed: Server list route tests plus Playwright dashboard checks for connected, disconnected, timed out, and unknown states.
- Risk of change: Medium. API shape may need an explicit unknown state.
- Confidence: high

### STC-TI-004

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-005`, `FLA-021`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/server-crud.test.ts`; `apps/operate/panel/routes/server.ts`
- Symbol or line range: successful delete-server and cleanup uncertainty coverage
- Evidence: Source audits cite existing 404/unauthenticated delete tests but no successful delete path covering shared access, orphan cleanup, or `rcon.removeServer` failure/uncertainty.
- Why it matters: Deletion could stop removing access, delete shared servers incorrectly, or hide RCON cleanup failure without a test failing.
- Suggested remediation: Add delete tests before behavior changes: shared server, final access removal, orphan cleanup, inaccessible server, malformed ID, and `removeServer` failure/timeout.
- Test or verification needed: Targeted delete-server tests and RCON cleanup result tests.
- Risk of change: Medium. Stronger tests may require route response changes for partial cleanup.
- Confidence: high

### STC-TI-005

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-006`, `TIA-007`, `FLA-005`, `FLA-006`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/game-routes.test.ts`; `apps/operate/panel/test/app.test.ts`; `apps/operate/panel/routes/game/match.ts`; `apps/operate/panel/routes/game/controls.ts`
- Symbol or line range: setup-game, workshop-map, say-admin, and map matrix success tests
- Evidence: Source audits cite success tests that mostly assert status/message while production sends ordered RCON commands and writes setup state.
- Why it matters: Routes can claim game state changes while sending the wrong command, omitting a command, or persisting desired state before runtime proof.
- Suggested remediation: Assert exact safe RCON command sequence, ordering, no command on validation failure, and state persistence only after all required commands succeed.
- Test or verification needed: Representative setup modes, cfg failure before map change, command failure after partial sequence, workshop ID validation, say command safety, and saved-selection checks.
- Risk of change: Medium to high because current responses may need weaker wording or explicit verification state.
- Confidence: high

### STC-TI-006

- Source audit(s): `docs/test-intent-audit.md`
- Original finding ID(s): `TIA-008`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/game-routes.test.ts`; `apps/operate/panel/routes/operator.ts`
- Symbol or line range: `workshop favorites CRUD is scoped to the authenticated user and server`
- Evidence: Source audit cites a test that creates/list/updates/deletes a favorite for one user and one server but does not create a second user or server despite the test name claiming scope.
- Why it matters: Cross-user or cross-server leaks could pass this test.
- Suggested remediation: Test isolation with two users and two servers, including update/delete attempts outside the owning scope.
- Test or verification needed: Duplicate workshop ID conflict, invalid favorite ID, invalid workshop ID/name, inaccessible server, CSRF on PATCH/DELETE.
- Risk of change: Medium. Stronger tests may expose authorization or query bugs.
- Confidence: high

### STC-TI-007

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-009`, `FLA-010`
- Theme: TEST_INTENT
- Severity: P2
- File: `apps/operate/panel/test/game-routes.test.ts`; `apps/operate/panel/routes/game/match.ts`; `apps/operate/panel/public/ts/manage.ts`
- Symbol or line range: RCON history "successful commands only" coverage
- Evidence: Source audits cite tests that prove pruning and non-raw command exclusion, but do not simulate failed `/api/rcon`; UI/test wording calls entries successful when only resolved command sends are proven.
- Why it matters: Failed or rejected RCON commands could be stored as successful history.
- Suggested remediation: Test failed raw RCON, blocked commands, duplicate counts, user/server isolation, clear history, and wording that says "sent" unless success is verified.
- Test or verification needed: RCON route/history tests and one manage-page UI assertion.
- Risk of change: Low to medium. Wording/API semantics may need adjustment.
- Confidence: high

### STC-TI-008

- Source audit(s): `docs/test-intent-audit.md`
- Original finding ID(s): `TIA-010`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/e2e/panel.spec.ts`; `apps/operate/panel/public/ts/manage.ts`
- Symbol or line range: manage-page E2E operator-control coverage
- Evidence: Source audit cites an E2E test that checks headings, visible buttons, saved favorite display, empty history text, and collapsed sections without exercising most click handlers.
- Why it matters: Buttons can be visible but unwired or pointed at the wrong endpoint while the test passes.
- Suggested remediation: Add E2E actions for autocomplete selection, history use/clear, favorite edit/delete/launch, workshop collection validation, loading/empty/error states, and disabled buttons.
- Test or verification needed: Playwright route mocks plus visible state assertions after each user action.
- Risk of change: Medium. E2E setup may need better fixtures to avoid brittle state.
- Confidence: high

### STC-TI-009

- Source audit(s): `docs/test-intent-audit.md`
- Original finding ID(s): `TIA-011`
- Theme: TEST_INTENT
- Severity: P2
- File: `apps/operate/panel/test/app.test.ts`; `apps/operate/panel/test/game-routes.test.ts`; `apps/operate/panel/test/user-management.test.ts`; `apps/operate/panel/test/server-crud.test.ts`
- Symbol or line range: broad CSRF contract matrix
- Evidence: Source audit cites global CSRF enforcement and explicit missing/wrong-token tests only for add-server, while many state-changing routes rely on token helpers.
- Why it matters: A newly mounted or specially handled state-changing route could bypass CSRF without a representative test failing.
- Suggested remediation: Add a table of representative POST/PATCH/DELETE routes across server, game, user, and operator modules.
- Test or verification needed: Missing/wrong token, form `_csrf`, JSON `x-csrf-token`, logout, login exemption, unauthenticated requests, and routes mounted after middleware.
- Risk of change: Low to medium.
- Confidence: medium

### STC-TI-010

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-012`, `TIA-021`, `FLA-020`
- Theme: TEST_INTENT
- Severity: P2
- File: `apps/operate/panel/package.json`; `apps/operate/panel/test/game-helpers.test.ts`
- Symbol or line range: `npm test` forced exit and Node version skip guard
- Evidence: Source audits cite `--test-force-exit` and a helper test file that exits `0` on old Node major versions.
- Why it matters: Open handles, leaked sockets/timers/DB handles, or skipped coverage can hide behind a passing test command.
- Suggested remediation: Remove `--test-force-exit` after fixing leaks or document an explicit exception. Replace process-level skip with test-runner skip/fail metadata and enforce the exact supported Node version.
- Test or verification needed: Test suite exits cleanly without forced shutdown, or leak-prone suites report explicit resource cleanup exceptions.
- Risk of change: Medium. Removing forced exit may reveal existing teardown bugs.
- Confidence: high for forced-exit risk; medium for Node minor-version guard risk

### STC-TI-011

- Source audit(s): `docs/test-intent-audit.md`
- Original finding ID(s): `TIA-013`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/rcon-manager.test.ts`; route/status/server tests using RCON mocks
- Symbol or line range: RCON protocol-level integration gap
- Evidence: Source audit cites route tests that mock RCON and `rcon-manager.test.ts` using `FakeRcon`, with no local protocol-level peer validating socket/auth/command semantics.
- Why it matters: Regressions in event ordering, socket closure, timeout, reconnect, or `rcon-srcds` interaction may not fail tests.
- Suggested remediation: Add a local protocol-level fake or integration fixture that exercises authentication failure, delayed auth, command response, close, timeout, reconnect, and queued commands.
- Test or verification needed: RCON protocol fixture tests plus existing manager tests.
- Risk of change: Medium to high. Better tests may expose runtime-state issues.
- Confidence: medium

### STC-TI-012

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-014`, `FLA-013`, `FLA-015`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/rcon-manager.test.ts`; `apps/operate/panel/modules/rcon.ts`
- Symbol or line range: shutdown/remove/heartbeat state transitions
- Evidence: Source audits cite existing manager tests for auth failure, auth timeout, host revalidation, and serialization, but not heartbeat backoff, interval cleanup, `removeServer`, or `shutdownAll` failure summaries.
- Why it matters: Stale sockets, timers, queued commands, or false connected states can survive without test failures.
- Suggested remediation: Add state-transition tests for remove while in-flight, shutdown with queued command, heartbeat failure, reconnect failure, multi-server isolation, and repeated shutdown/remove.
- Test or verification needed: RCON manager tests and route tests that consume cleanup results.
- Risk of change: Medium. Tests may require explicit cleanup result types.
- Confidence: high

### STC-TI-013

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-015`, `FLA-018`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/maintain/updater/tests/run.sh`; `apps/maintain/updater/tests/bin/systemctl`; `apps/maintain/updater/tests/bin/steamcmd`; `apps/maintain/updater/update_cs2.sh`
- Symbol or line range: updater update/start ordering and post-start proof
- Evidence: Source audits cite stubs recording `systemctl` and `steamcmd` in separate files, so tests prove calls happened but not global order; they also do not simulate `systemctl start` returning 0 while `is-active` is false.
- Why it matters: The updater could start before verification, report success after a crash, or reorder service/update steps without test failure.
- Suggested remediation: Use a single ordered event log in stubs and add post-start active-check failure cases.
- Test or verification needed: update success, update failure, unchanged build ID, start failure, initially inactive service, dry-run, and unknown remote build ID.
- Risk of change: Medium for tests; production remediation may affect service timing.
- Confidence: high for ordering test gap; medium for start-readiness behavior

### STC-TI-014

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-016`, `FLA-019`
- Theme: TEST_INTENT
- Severity: P2
- File: `apps/maintain/updater/tests/run.sh`; `apps/maintain/updater/update_cs2.sh`
- Symbol or line range: updater config tests
- Evidence: Source audits cite config tests using default-equivalent values, generic success output, and `BOGUS_KEY=evil` without asserting warn/fail semantics.
- Why it matters: Config loading could be ignored or typos could be hidden by defaults while tests still pass.
- Suggested remediation: Use non-default config values with observable side effects and assert explicit unknown-key/empty-value policy.
- Test or verification needed: Quoted values, whitespace, comments, duplicate keys, unknown keys, removed keys, config path validation, CLI precedence, and empty default normalization.
- Risk of change: Medium because intended unknown-key behavior is `UNCLEAR`.
- Confidence: high

### STC-TI-015

- Source audit(s): `docs/test-intent-audit.md`, `docs/minimum-code-audit.md`
- Original finding ID(s): `TIA-017`, `MC-015`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/migrations.test.ts`; `apps/operate/panel/db.ts`
- Symbol or line range: migration tests for fresh/current schemas
- Evidence: Source audits cite tests checking `user_version` and a few columns but not foreign keys, unique constraints, indexes, or cascade behavior.
- Why it matters: Missing constraints or cascades can corrupt access, favorites, and history behavior without a migration test failing.
- Suggested remediation: Add constraint, index, foreign-key, and cascade tests for the current schema and supported historical schemas.
- Test or verification needed: Duplicate server IP/port, duplicate favorite constraints, deleting users/servers, invalid references, and index existence for query paths.
- Risk of change: Medium to high. Tests may reveal schema bugs or require migration changes.
- Confidence: high

### STC-TI-016

- Source audit(s): `docs/test-intent-audit.md`, `docs/fail-loud-audit.md`
- Original finding ID(s): `TIA-018`, `FLA-016`
- Theme: TEST_INTENT
- Severity: P1
- File: `apps/operate/panel/test/rcon-secret.test.ts`; `apps/operate/panel/utils/rconSecret.ts`; `apps/operate/panel/modules/rcon.ts`
- Symbol or line range: RCON secret encryption/decryption tests
- Evidence: Source audits cite roundtrip/plaintext/missing-key tests but no malformed encrypted payload, wrong key, tampered tag/ciphertext, invalid key format, or cache reset coverage.
- Why it matters: Fail-open or misclassified local credential corruption can be mistaken for server auth failure.
- Suggested remediation: Test malformed `enc:v1:` payloads, wrong keys, tampered data, invalid keys, and explicit key-cache behavior.
- Test or verification needed: `rcon-secret` tests and RCON manager connect tests that distinguish decrypt failure from auth failure.
- Risk of change: Medium.
- Confidence: high

### STC-TI-017

- Source audit(s): `docs/test-intent-audit.md`
- Original finding ID(s): `TIA-019`, `TIA-020`
- Theme: TEST_INTENT
- Severity: P3
- File: `apps/operate/panel/test/game-helpers.test.ts`; `apps/operate/panel/test/parse-server-id.test.ts`; `apps/operate/panel/test/rcon-response.test.ts`; `apps/operate/panel/test/game-routes.test.ts`
- Symbol or line range: utility one-liner output tests and bundled route tests
- Evidence: Source audit cites tests with names like input/output examples and bundled route tests that combine unrelated contracts.
- Why it matters: Some examples are useful, but weak names and bundled behaviors obscure the operator/security reason and make failures harder to diagnose.
- Suggested remediation: Group tests by policy and split unrelated route contracts into tests whose names state the behavior that matters.
- Test or verification needed: Preserve existing edge examples while adding policy names for server ID canonicalization, RCON command safety, display sanitization, backup parsing, and player actions.
- Risk of change: Low.
- Confidence: medium

## Fail-Loud Findings

### STC-FL-001

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-001`, `FLA-002`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/operate/panel/modules/rcon.ts`; `apps/operate/panel/app.ts`; `apps/operate/panel/Dockerfile`; `apps/operate/panel/test/e2e/panel.spec.ts`
- Symbol or line range: `RconManager.init()`, startup readiness, `/api/health`
- Evidence: Source audit cites `RconManager.init()` using `Promise.allSettled` without inspecting failures, startup listening without checking RCON init results, `/api/health` proving DB/Redis only, and Docker health gating on that endpoint.
- Why it matters: The panel can appear started and healthy while all saved RCON connections failed.
- Suggested remediation: Store explicit RCON init summary counts and expose liveness/readiness separately with `http`, `db`, `redis`, and `rcon_init` fields.
- Test or verification needed: Seed multiple servers, force RCON init failure, assert failure counts and degraded readiness; then run panel tests and e2e health checks.
- Risk of change: Medium. Health contract and orchestration expectations may need updates.
- Confidence: high

### STC-FL-002

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-003`, `FLA-004`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/operate/panel/routes/server.ts`; `apps/operate/panel/public/ts/servers.ts`; `apps/operate/panel/views/manage.ejs`
- Symbol or line range: server list status aggregation and initial manage page render
- Evidence: Source audit cites `/api/servers` defaulting to `connected: false`, `authenticated: false`, and `hostname: "-"`, probing only cached connections, racing probes against timeout without returning timeout state, and manage route swallowing initial hostname failure.
- Why it matters: Unobserved, slow, or failed status probes are displayed as definitive `Disconnected`/`Connected` states.
- Suggested remediation: Return explicit states such as `connected`, `disconnected`, `unknown`, and `partial`, with `observed_at`, `status_source`, `timed_out`, and `error` fields. Render initial manage status uncertainty.
- Test or verification needed: Route and Playwright tests for hung hostname probe, failed initial hostname lookup, and unknown/timed-out UI state.
- Risk of change: Medium. API consumers and UI text need contract updates.
- Confidence: high

### STC-FL-003

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-005`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/operate/panel/routes/game/helpers.ts`; `apps/operate/panel/routes/game/match.ts`; `apps/operate/panel/routes/game/controls.ts`
- Symbol or line range: RCON-backed game control success messages
- Evidence: Source audit cites success messages such as `Game restarted`, `Warmup started!`, player kicked/muted, and `Message sent!` after `rcon.executeCommand` resolves.
- Why it matters: A resolved RCON client call does not prove the server applied the setting, plugin action, map change, or player action.
- Suggested remediation: Use "Command sent" wording for unverified actions and add readback verification where CS2/RCON exposes reliable state.
- Test or verification needed: Simulate resolved RCON responses that indicate unknown/failed commands and assert the API does not return definitive success.
- Risk of change: Medium. User-facing messages and tests will change.
- Confidence: medium

### STC-FL-004

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-006`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/operate/panel/routes/game/match.ts`; `apps/operate/panel/test/game-routes.test.ts`
- Symbol or line range: `POST /api/setup-game`
- Evidence: Source audit cites setup executing cfg/team/map commands, storing `last_map`, `last_game_type`, and `last_game_mode`, and returning `Game Created!` while the success test asserts only status/message.
- Why it matters: The DB may store desired state as if it is observed runtime state.
- Suggested remediation: Store fields as last requested, or verify current map/rules before labeling them applied.
- Test or verification needed: Simulate command output where `changelevel` did not apply and assert response/status remains uncertain; manage-page saved-selection E2E.
- Risk of change: Medium to high because UI and API semantics may need naming changes.
- Confidence: high

### STC-FL-005

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-007`, `FLA-008`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/operate/panel/routes/game/match.ts`; `apps/operate/panel/test/game-routes.test.ts`
- Symbol or line range: `POST /api/restore-latest-backup`; `POST /api/list-backups`
- Evidence: Source audit cites restore returning `No latest backup found!` when parsing/sanitization yields no filename, including malformed/unsafe output in tests, and list-backups returning `text || "No backups found"`.
- Why it matters: Backup availability can be misreported during recovery when output is malformed, empty, unsupported, or changed.
- Suggested remediation: Distinguish `none`, `unknown`, `malformed_response`, and explicit no-backup markers. Use non-2xx or explicit unknown for unparseable non-empty output.
- Test or verification needed: Empty, malformed, unsafe, plugin-unsupported, and explicit no-backup responses.
- Risk of change: Medium. Existing tests expect false-certainty responses and must change.
- Confidence: high for restore; medium for list-backups

### STC-FL-006

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-009`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/operate/panel/routes/game/match.ts`; `apps/operate/panel/utils/rconHistory.ts`; `apps/operate/panel/routes/game/helpers.ts`
- Symbol or line range: `POST /api/rcon` command plus history write
- Evidence: Source audit cites the route sending the RCON command, then recording history in SQLite, then returning success; any history exception falls into a generic catch after the command may already have run.
- Why it matters: Operators may retry a command after seeing failure even though the command already executed.
- Suggested remediation: Isolate history write failure from command execution and return explicit partial success, for example `command_sent: true, history_recorded: false`.
- Test or verification needed: Mock history/SQLite failure after successful RCON and assert partial-success response.
- Risk of change: Medium. API response shape and UI handling must change.
- Confidence: high

### STC-FL-007

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-010`
- Theme: FAIL_LOUD
- Severity: P2
- File: `apps/operate/panel/routes/game/match.ts`; `apps/operate/panel/public/ts/manage.ts`; `apps/operate/panel/test/game-routes.test.ts`
- Symbol or line range: RCON command history semantics
- Evidence: Source audit cites history recording when `executeCommand` resolves, UI empty text saying `No successful commands yet`, and test naming history as successful commands.
- Why it matters: Resolved RCON responses do not necessarily prove server-side command success.
- Suggested remediation: Rename the concept to "sent commands" unless response parsing can prove success.
- Test or verification needed: Simulate a resolved error-like RCON response and assert history/status wording stays non-definitive.
- Risk of change: Low to medium. Mostly wording and expectation changes unless status fields are added.
- Confidence: medium

### STC-FL-008

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-011`
- Theme: FAIL_LOUD
- Severity: P2
- File: `apps/operate/panel/public/ts/manage.ts`
- Symbol or line range: `loadHistory()`
- Evidence: Source audit cites `loadHistory()` catching failures from `/api/rcon/history` and rendering the empty history state.
- Why it matters: A broken endpoint or DB failure looks like no history exists.
- Suggested remediation: Render a distinct history unavailable/error state on fetch failure.
- Test or verification needed: Playwright route `/api/rcon/history` to 500 and assert the UI shows unavailable instead of empty.
- Risk of change: Low to medium.
- Confidence: high

### STC-FL-009

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-012`
- Theme: FAIL_LOUD
- Severity: P2
- File: `apps/operate/panel/public/ts/servers.ts`
- Symbol or line range: background player-count fetch on server cards
- Evidence: Source audit cites online cards initializing player count as unknown, fetching `/api/status/:id`, and silently ignoring failures.
- Why it matters: A degraded status endpoint can be invisible on the primary dashboard.
- Suggested remediation: Show a compact status-unavailable marker when secondary status fetch fails.
- Test or verification needed: Playwright test where `/api/servers` returns connected and `/api/status/:id` returns 500.
- Risk of change: Low to medium.
- Confidence: high

### STC-FL-010

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-013`, `FLA-014`, `FLA-015`
- Theme: FAIL_LOUD
- Severity: P2
- File: `apps/operate/panel/modules/rcon.ts`; `apps/operate/panel/routes/server.ts`; `apps/operate/panel/app.ts`
- Symbol or line range: server deletion cleanup, graceful shutdown, `RconManager.shutdownAll()`
- Evidence: Source audit cites disconnect resolving on close/error/timeout and deleting state, delete route returning success after `removeServer`, shutdown ignoring Redis/SQLite close errors before exit 0, and `shutdownAll()` ignoring `allSettled` failures before logging `All connections closed.`
- Why it matters: Cleanup failure can be hidden from operators and tests, leaving lingering sockets/timers or missing diagnostics.
- Suggested remediation: Return/log cleanup result summaries with closed/failed/timed-out counts and component names. Consider nonzero exit when critical cleanup fails.
- Test or verification needed: RCON manager cleanup tests, server delete cleanup uncertainty test, and app shutdown tests with mocked Redis/DB failures.
- Risk of change: Medium. Shutdown/delete response semantics may change.
- Confidence: high for app cleanup catch; medium for RCON cleanup result design

### STC-FL-011

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-016`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/operate/panel/utils/rconSecret.ts`; `apps/operate/panel/modules/rcon.ts`; `apps/operate/panel/test/rcon-secret.test.ts`
- Symbol or line range: encrypted RCON password decrypt failure
- Evidence: Source audit cites decrypt errors for missing key/invalid encrypted payload being caught with authentication errors and logged as `Authentication failed`.
- Why it matters: Operators may troubleshoot the game server or password when the local panel secret, key, or stored data is corrupt.
- Suggested remediation: Classify decrypt/key/payload failures separately from server auth failures and expose a clear credential-storage error.
- Test or verification needed: Malformed `enc:v1:` payload and wrong-key payload should produce storage/decrypt errors, not generic auth failure.
- Risk of change: Medium. Error surfaces and logs change around a sensitive boundary.
- Confidence: high

### STC-FL-012

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-017`
- Theme: FAIL_LOUD
- Severity: P2
- File: `apps/operate/panel/routes/operator.ts`
- Symbol or line range: workshop favorite update
- Evidence: Source audit cites `PATCH /api/workshop-favorites/:server_id/:favorite_id` mapping any DB error from `updateFavoriteStmt.run(...)` to HTTP 409 duplicate conflict.
- Why it matters: Database unavailable, schema mismatch, and other persistence failures are downgraded to a user-fixable duplicate favorite.
- Suggested remediation: Inspect SQLite error code/message and return 409 only for unique constraint; return/log 500 for unknown persistence errors.
- Test or verification needed: Separate tests for unique conflict and generic DB failure.
- Risk of change: Low to medium.
- Confidence: high

### STC-FL-013

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-018`
- Theme: FAIL_LOUD
- Severity: P1
- File: `apps/maintain/updater/update_cs2.sh`; `apps/maintain/updater/tests/run.sh`
- Symbol or line range: `start_service()` and post-update success
- Evidence: Source audit cites `start_service()` logging started after `systemctl start` returns success and final update success after build ID convergence, with tests not simulating start returns 0 but `is-active` false.
- Why it matters: A service that starts and immediately crashes can still produce an update-success log.
- Suggested remediation: After start, run bounded `systemctl is-active --quiet` retries and fail or mark uncertain if inactive.
- Test or verification needed: Stub `systemctl start` success but `is-active` inactive and assert nonzero or uncertain result.
- Risk of change: Medium. Unit type and service startup timing may require careful bounds.
- Confidence: medium

### STC-FL-014

- Source audit(s): `docs/fail-loud-audit.md`
- Original finding ID(s): `FLA-019`
- Theme: FAIL_LOUD
- Severity: P2
- File: `apps/maintain/updater/update_cs2.sh`; `apps/maintain/updater/tests/run.sh`
- Symbol or line range: config file unknown keys and empty defaults
- Evidence: Source audit cites unknown config keys being ignored unless in removed-key warnings, empty `SERVICE_NAME` defaulting to `cs2.service`, and tests asserting empty service name and `BOGUS_KEY` success.
- Why it matters: Typos or explicit empty critical values can silently fall back to defaults and operate on the wrong service/path/behavior.
- Suggested remediation: Warn or fail on unknown keys, and distinguish missing from explicitly empty critical values. Preserve compatibility only with a documented deadline.
- Test or verification needed: Unknown key and explicit empty critical key tests with explicit expected warning or failure.
- Risk of change: Medium because intended compatibility policy is `UNCLEAR`.
- Confidence: high

### STC-FL-015

- Source audit(s): `docs/fail-loud-audit.md`, `docs/test-intent-audit.md`
- Original finding ID(s): `FLA-020`, `TIA-012`, `TIA-021`
- Theme: FAIL_LOUD
- Severity: P2
- File: `apps/operate/panel/package.json`; `apps/operate/panel/test/game-helpers.test.ts`
- Symbol or line range: test command forced exit and runtime skip
- Evidence: Source audits cite `npm test` using `--test-force-exit` and one test file exiting 0 on old Node major versions.
- Why it matters: A test command can claim pass while open handles or skipped helper coverage remain hidden.
- Suggested remediation: Same as `STC-TI-010`: remove or document forced exit and make version-gated tests report skip/fail explicitly.
- Test or verification needed: Verification script check for forced-exit exception and a test-suite run that exits cleanly.
- Risk of change: Medium.
- Confidence: high

## Duplicates Merged

Clear duplicates merged into single consolidated findings:

- RCON autocomplete: `OE-001` plus `MC-001` -> `STC-MC-001`.
- Persisted RCON history as optional cross-layer feature: `OE-002` plus `MC-002` -> `STC-MC-002`.
- Workshop favorites as optional CRUD feature: `OE-003` plus `MC-003` -> `STC-MC-003`.
- `makeMultiPresetRoute`: `OE-004` plus `MC-004` -> `STC-MC-004`.
- Browser server ID context: `OE-005` plus `MC-005` -> `STC-MC-005`.
- Browser request helper duplication: `OE-006` plus `MC-006` -> `STC-MC-006`.
- Config aliases and knobs were kept separate by concrete setting because they
  have different compatibility and security risks: `STC-MC-007` through
  `STC-MC-010`.
- Updater config parser and removed-key compatibility were merged where the
  same runtime parser/config surface was described: `OE-011`, `OE-012`,
  `MC-011`, and `MC-012` -> `STC-MC-011`.
- `scripts/validate.sh`: `OE-013` plus `MC-013` -> `STC-MC-012`.
- Pinned shell-tool downloader: `OE-014` plus `MC-014` -> `STC-MC-013`.
- SQLite migration compatibility and migration test gaps remain separate by
  theme but cross-reference each other: `STC-MC-014` and `STC-TI-015`.
- Source-string tests: `OE-017`, `MC-017`, `TIA-001`, and `TIA-002` ->
  `STC-TI-001`.
- RCON secret decrypt classification and missing malformed-secret tests are
  separate by theme but paired: `STC-TI-016` and `STC-FL-011`.
- Forced test exit/runtime skip appears in both test-quality and fail-loud
  sections because it is both weak verification and a false-certainty claim:
  `STC-TI-010` and `STC-FL-015`.

No source finding was intentionally dropped. Some source findings are referenced
in more than one consolidated issue when they describe both a weak test and a
runtime certainty problem.

## Conflicts Or Inconsistencies Between Source Audits

- Optional operator features have competing remediation paths. The simplicity
  audits suggest investigating or removing autocomplete, persisted history, and
  workshop favorites if usage is absent. The test/fail-loud audits identify
  hardening needed if those features remain. Do not invest heavily in feature
  hardening until the keep/remove decision is made, except for security or data
  exposure tests that protect current behavior.
- RCON manager seams are flagged as possible overengineering (`OE-018`,
  `MC-018`), while the test audit says RCON protocol/state coverage is not yet
  strong enough (`TIA-013`, `TIA-014`). Simplification should wait until the
  runtime boundary has better tests.
- SQLite compatibility is flagged as complexity (`OE-015`, `MC-015`), but the
  same audits warn that the supported oldest schema is `UNCLEAR` and
  simplification is high risk. Treat this as an investigation target, not a
  deletion candidate.
- Updater config is flagged both as too broad (`OE-011`, `MC-011`) and as
  fail-loud deficient for unknown keys/defaults (`FLA-019`). The source audits
  agree the parser needs proof before simplification; they do not prove which
  config syntax is required.
- Some tests are explicitly valuable in the test audit, including status partial
  responses, multi-command partial failures, network validation, user/session
  invalidation, updater failure modes, and unsupported schema failures. Do not
  remove those tests while rewriting weak adjacent tests.

## Highest-Risk Issues

1. `STC-FL-001`: health/readiness can be healthy while RCON startup failed.
2. `STC-FL-002`: dashboard/manage status can display unknown RCON state as
   connected/disconnected.
3. `STC-FL-003` and `STC-FL-004`: game-control/setup routes use definitive
   success and persisted state without runtime proof.
4. `STC-FL-006`: `/api/rcon` can send a command and then report generic failure
   if history persistence fails.
5. `STC-FL-011`: encrypted credential corruption/key mismatch is hidden as RCON
   auth failure.
6. `STC-FL-013`: updater can report update/start success without post-start
   active proof.
7. `STC-TI-002` through `STC-TI-005`: important server and game success paths
   assert status/message rather than behavior.
8. `STC-TI-011` and `STC-TI-012`: RCON protocol and state-transition coverage is
   missing around a runtime-critical boundary.

## Low-Risk Simplification Candidates

These are not deletion instructions. They are candidates once current behavior
is covered and compatibility checks pass.

1. `STC-MC-004`: inline `makeMultiPresetRoute` into its two current endpoints.
2. `STC-MC-005`: pass/read the manage page server ID directly instead of using a
   mutable context module.
3. `STC-MC-006`: deduplicate browser JSON request helpers after preserving
   response semantics.
4. `STC-TI-001`: replace implementation/source-string tests with behavior tests
   or docs lint.
5. `STC-MC-007`: remove `DEFAULT_PORT` if repo/history/deployment grep proves
   it is not used.
6. `STC-MC-012`: remove or explicitly document `scripts/validate.sh` as a
   compatibility alias after external reference checks.

## Suggested Remediation Slices

### Slice STC-R01

- Slice ID: STC-R01
- Title: Make RCON readiness and health explicit
- Findings addressed: `STC-FL-001`, `STC-TI-011`, `STC-TI-012`
- Minimal remediation strategy: Add RCON init summary state with counts and
  expose degraded readiness separately from liveness. Start with tests around
  failed init before changing health response shape.
- Files likely affected: `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/app.ts`, health/e2e tests.
- Tests needed: RCON init failure counts, degraded health/readiness, and
  protocol/state-transition coverage for init failures.
- Verification needed: `cd apps/operate/panel && npm test && npm run test:e2e`
  after targeted tests pass.
- Risk level: high
- Definition of Done: health/readiness can distinguish DB/Redis/RCON states, and
  tests fail if all RCON init failures are hidden.

### Slice STC-R02

- Slice ID: STC-R02
- Title: Stop collapsing unknown server status
- Findings addressed: `STC-FL-002`, `STC-TI-003`, `STC-FL-009`
- Minimal remediation strategy: Add explicit API/UI states for unknown, timed
  out, partial, and observed status. Surface player-count fetch failures on
  server cards.
- Files likely affected: `apps/operate/panel/routes/server.ts`,
  `apps/operate/panel/public/ts/servers.ts`, `apps/operate/panel/views/manage.ejs`,
  server/e2e tests.
- Tests needed: slow hostname probe, failed hostname probe, inaccessible server,
  connected status, status endpoint 500, and UI rendering for unknown/error.
- Verification needed: Panel unit tests, client build, and dashboard/manage
  Playwright tests.
- Risk level: high
- Definition of Done: neither dashboard nor manage page reports definitive
  connected/disconnected status when observation failed or timed out.

### Slice STC-R03

- Slice ID: STC-R03
- Title: Make game-control success wording truthful
- Findings addressed: `STC-FL-003`, `STC-FL-004`, `STC-TI-005`
- Minimal remediation strategy: Convert unverified RCON actions to "command
  sent/requested" semantics, add verification readback only where reliable, and
  rename persisted setup state if it is only desired state.
- Files likely affected: `apps/operate/panel/routes/game/helpers.ts`,
  `apps/operate/panel/routes/game/match.ts`,
  `apps/operate/panel/routes/game/controls.ts`, game route tests, manage e2e.
- Tests needed: command order, partial failures, RCON error-like output,
  no-persist on failed sequence, setup saved state, and representative mode/map
  success.
- Verification needed: `cd apps/operate/panel && npm test && npm run test:e2e`.
- Risk level: high
- Definition of Done: API responses distinguish requested/sent from verified
  game state, and tests fail if state is persisted before required commands
  succeed.

### Slice STC-R04

- Slice ID: STC-R04
- Title: Separate RCON command execution from history bookkeeping
- Findings addressed: `STC-MC-002`, `STC-FL-006`, `STC-FL-007`, `STC-FL-008`,
  `STC-TI-007`
- Minimal remediation strategy: Decide whether persisted history remains. If it
  remains, return separate `command_sent` and `history_recorded` states, rename
  history to sent commands unless verified, and render history fetch errors.
- Files likely affected: `apps/operate/panel/routes/game/match.ts`,
  `apps/operate/panel/utils/rconHistory.ts`,
  `apps/operate/panel/routes/operator.ts`,
  `apps/operate/panel/public/ts/manage.ts`, history tests/e2e.
- Tests needed: history DB failure after command send, failed raw RCON command,
  blocked command, user/server isolation, clear history, and fetch 500 UI.
- Verification needed: Panel unit tests, client build, and manage Playwright
  history checks.
- Risk level: medium
- Definition of Done: users are never told a command failed when it was sent but
  history write failed, and history UI distinguishes empty from unavailable.

### Slice STC-R05

- Slice ID: STC-R05
- Title: Expose cleanup and shutdown uncertainty
- Findings addressed: `STC-FL-010`, `STC-TI-004`, `STC-TI-012`
- Minimal remediation strategy: Add cleanup result summaries for RCON
  disconnect/remove/shutdown and log Redis/SQLite close failures with component
  names.
- Files likely affected: `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/routes/server.ts`, `apps/operate/panel/app.ts`, RCON and
  server CRUD tests.
- Tests needed: delete final/shared server, remove failure/timeout, shutdown
  disconnect reject, Redis quit failure, SQLite close failure.
- Verification needed: Panel unit tests plus shutdown-focused test command if
  split from the suite.
- Risk level: medium
- Definition of Done: cleanup logs/responses include closed/failed/timed-out
  counts and tests fail if cleanup failure is silently reported as clean success.

### Slice STC-R06

- Slice ID: STC-R06
- Title: Make updater config and service success fail loud
- Findings addressed: `STC-MC-011`, `STC-MC-018`, `STC-FL-013`, `STC-FL-014`,
  `STC-TI-013`, `STC-TI-014`
- Minimal remediation strategy: First define config compatibility policy. Then
  assert unknown/empty critical key behavior, separate test-only knobs from
  deployable config if possible, add ordered event logging in stubs, and add a
  post-start active check.
- Files likely affected: `apps/maintain/updater/update_cs2.sh`,
  `apps/maintain/updater/tests/run.sh`,
  `apps/maintain/updater/tests/bin/systemctl`,
  `apps/maintain/updater/tests/bin/steamcmd`,
  `apps/maintain/updater/cs2-auto-update.conf.example`.
- Tests needed: config non-default side effects, unknown/removed/empty keys,
  CLI precedence, stop/update/start ordering, start returns 0 but inactive, dry
  run, unchanged build ID.
- Verification needed: `cd apps/maintain/updater && make test && make lint &&
  make security && make ci`.
- Risk level: high
- Definition of Done: updater tests prove operation order and post-start active
  status, and config typos/defaulting cannot be hidden as clean success.

### Slice STC-R07

- Slice ID: STC-R07
- Title: Classify RCON credential storage failures
- Findings addressed: `STC-FL-011`, `STC-TI-016`
- Minimal remediation strategy: Add malformed/tampered/wrong-key tests first,
  then distinguish local decrypt/key/payload errors from server auth failures in
  logs and connection status.
- Files likely affected: `apps/operate/panel/utils/rconSecret.ts`,
  `apps/operate/panel/modules/rcon.ts`,
  `apps/operate/panel/test/rcon-secret.test.ts`,
  `apps/operate/panel/test/rcon-manager.test.ts`.
- Tests needed: malformed `enc:v1:` payload, missing segments, non-hex data,
  wrong key, modified tag/ciphertext, invalid key, and manager connection error
  classification.
- Verification needed: Targeted RCON secret/manager tests, then full panel unit
  tests.
- Risk level: medium
- Definition of Done: credential storage/key failures are observable as local
  errors and no test can pass if they are collapsed into generic auth failure.

### Slice STC-R08

- Slice ID: STC-R08
- Title: Decide optional operator feature scope
- Findings addressed: `STC-MC-001`, `STC-MC-002`, `STC-MC-003`, `STC-TI-006`,
  `STC-FL-012`
- Minimal remediation strategy: Gather operator usage evidence for autocomplete,
  persisted history, and workshop favorites. Remove unneeded features; harden
  scoping/error handling only for features that remain.
- Files likely affected: `apps/operate/panel/routes/operator.ts`,
  `apps/operate/panel/db.ts`, `apps/operate/panel/public/ts/manage.ts`,
  `apps/operate/panel/views/manage.ejs`, operator/game route tests, migrations.
- Tests needed: If retained, autocomplete failure states, favorite two-user/two-
  server isolation, unique conflict versus generic DB error, migration behavior,
  and e2e controls. If removed, raw command and raw workshop launch regressions.
- Verification needed: Panel unit tests, migrations, client build, and e2e.
- Risk level: medium to high depending on removal versus hardening.
- Definition of Done: each optional feature is either removed with behavior
  preserved for required workflows, or kept with tests that prove scope and
  failure behavior.

### Slice STC-R09

- Slice ID: STC-R09
- Title: Low-risk browser and route simplification
- Findings addressed: `STC-MC-004`, `STC-MC-005`, `STC-MC-006`, `STC-TI-017`
- Minimal remediation strategy: Inline the two preset handlers, pass/read server
  ID directly, unify request helpers, and rename/split weak utility tests without
  changing behavior.
- Files likely affected: `apps/operate/panel/routes/game/helpers.ts`,
  `apps/operate/panel/routes/game/controls.ts`,
  `apps/operate/panel/public/ts/context.ts`,
  `apps/operate/panel/public/ts/console.ts`,
  `apps/operate/panel/public/ts/manage.ts`,
  `apps/operate/panel/public/ts/common.ts`, focused tests.
- Tests needed: Preset route tests, client build, manage e2e server-scoped
  action, request error/401/CSRF behavior, and renamed utility tests.
- Verification needed: `cd apps/operate/panel && npm run build:client && npm
  test && npm run test:e2e`.
- Risk level: medium
- Definition of Done: behavior is unchanged, helper count is reduced, and tests
  still cover the user/security reason rather than helper structure.

### Slice STC-R10

- Slice ID: STC-R10
- Title: Remove verification false certainty
- Findings addressed: `STC-TI-010`, `STC-FL-015`, `STC-MC-019`, `STC-TI-001`
- Minimal remediation strategy: Fix or document open handles before removing
  forced exit, enforce supported Node behavior clearly, and replace implementation
  string checks with behavior tests or docs lint.
- Files likely affected: `apps/operate/panel/package.json`,
  `apps/operate/panel/test/game-helpers.test.ts`,
  `apps/operate/panel/test/mock-module.ts`,
  `apps/operate/panel/test/scripts.test.ts`.
- Tests needed: Clean test-suite exit, explicit Node version support/failure,
  behavior-level Redis limiter/auth/XSS tests.
- Verification needed: `cd apps/operate/panel && node -v && npm test`.
- Risk level: medium
- Definition of Done: the test command no longer hides open handles or skipped
  coverage, and source-string assertions no longer stand in for behavior.

## Verification Strategy

For this docs-only consolidation, verification should focus on document
traceability and scope:

- Confirm all required source IDs are represented: `OE-001..OE-019`,
  `MC-001..MC-021`, `TIA-001..TIA-021`, and `FLA-001..FLA-021`.
- Confirm every consolidated finding includes source audit(s), original ID(s),
  theme, severity, file, symbol/line range, evidence, why it matters,
  remediation, test/verification, risk, and confidence.
- Confirm only `docs/simplicity-test-certainty-audit.md` changed in this task.

Future implementation verification should use the narrowest relevant check first:

- Root broad verifier: `./scripts/verify.sh`
- Panel format: `cd apps/operate/panel && npm run format:check`
- Panel lint: `cd apps/operate/panel && npm run lint`
- Panel typecheck: `cd apps/operate/panel && npm run typecheck`
- Panel tests: `cd apps/operate/panel && npm test`
- Panel E2E: `cd apps/operate/panel && npm run test:e2e`
- Panel validation: `cd apps/operate/panel && npm run validate -- --require-docker`
- Updater lint: `cd apps/maintain/updater && make lint`
- Updater tests: `cd apps/maintain/updater && make test`
- Updater security: `cd apps/maintain/updater && make security`
- Updater CI: `cd apps/maintain/updater && make ci`

Valuable tests called out by the source test audit should be preserved while
weak tests are rewritten: status partial responses, RCON manager auth/timeout
serialization, network validation, malicious username E2E rendering, cfg
integrity, multi-command partial failures, user/session invalidation, updater
unknown remote/unchanged build/start failure/stale lock/disk-space/redaction
tests, and unsupported historical schema failure tests.

## Remaining Uncertainty

- This consolidation depends on the four source audits and does not independently
  re-audit production code.
- The working tree was already dirty when the source audits were created; the
  consolidated findings reflect that local state.
- Active usage is `UNCLEAR` for autocomplete, persisted RCON history, workshop
  favorites, `DEFAULT_PORT`, Redis host/port aliases, custom CSP,
  `RCON_AUTH_TIMEOUT_MS`, removed updater config keys, `scripts/validate.sh`,
  pinned manual shell-tool installation, and Node 26 test compatibility.
- The oldest supported SQLite schema version and exact migration support window
  remain `UNCLEAR`.
- Live CS2/RCON/MatchZy/plugin semantics were not verified. Some commands may
  have reliable success text or state readback, but the audits did not prove it.
- The intended updater config policy for unknown keys and explicit empty values
  remains `UNCLEAR`.
- Whether `--test-force-exit` masks known handles or only guards CI timeouts is
  `UNCLEAR`.
- The source audits recommend keeping several areas untouched unless a concrete
  bug or policy decision exists: bootstrap scripts, startup example safety logic,
  logger/response/display/maps utilities, middleware/auth route glue, RCON core
  state machine, updater core lock/service/SteamCMD safety, network validation,
  and RCON command validation.
