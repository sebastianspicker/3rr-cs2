# Code Index

Inventory date: 2026-05-26.

Scope: source, test, script, config, template, and generated-code areas in the
current working tree. Existing uncommitted and untracked files were included
because they are part of the codebase visible during this pass.

Method: inspected repository file lists, package scripts, shell entry points,
route mounting, imports, tests, config references, docs contracts, and selected
source bodies. Usage is not guessed. When repository evidence does not prove use,
the status is `UNCLEAR` and the row states what would prove it.

Checks run during indexing:

- `npm run lint` in `apps/operate/panel`: passed.
- `npm run typecheck` in `apps/operate/panel`: passed.
- `make lint` in `apps/maintain/updater`: passed.

Not run: full unit suite, Playwright E2E, Docker validation, root
`./scripts/verify.sh`, or real CS2/RCON runtime checks.

## Coverage Summary

- Fully represented file-by-file: root CI/scripts/config, `apps/operate/panel`
  runtime code, panel browser code, panel views, panel tests, panel config,
  panel CFG assets, `apps/maintain/updater` scripts/tests/config, provision
  scripts/env, and deploy/startup examples.
- Represented as documentation/source-contract groups: README, SECURITY,
  module docs, workflow docs, architecture/reference docs, migration archive
  docs, and screenshot assets.
- Not deeply inspected: screenshot PNG image contents and every prose sentence in
  long historical docs. They are not runtime source, but their areas are listed.

## Root, CI, And Shared Scripts

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `.github/workflows/ci.yml` | GitHub Actions YAML | Runs repository CI on push, PR, and manual dispatch. Installs Node 22 plus shell tooling, then runs root verification. | `verify` job | config | `./scripts/verify.sh`, Node 22, shellcheck, shfmt, jq, ruby | Active | CI only covers `main`; publication docs should align with branch policy. |
| `.github/workflows/secret-scan.yml` | GitHub Actions YAML | Runs Gitleaks secret scan with full history. | `gitleaks` job | config | `gitleaks/gitleaks-action`, `GITHUB_TOKEN` | Active | History-sensitive scanner can fail on fixture-like values. |
| `.editorconfig` | EditorConfig | Defines root formatting defaults. | N/A | config | Editors and formatters | Active | None obvious. |
| `.gitignore` | Git ignore config | Excludes local env, generated outputs, caches, reports, and agent artifacts. | N/A | config | Git | Active | Ignores `AGENTS.md`; repo guidance is local unless explicitly forced into Git. |
| `scripts/verify.sh` | Bash | Root verification orchestrator for shell/config checks, panel lint/type/test/e2e/build, Docker validation, panel health smoke, updater CI, and provision smoke. | `log`, `run`, `require_cmd`, `install_playwright_chromium`, `cleanup`, `panel_surface_probe`, `startup_secret_probe` | script | Docker, Node/npm/npx, Playwright, shellcheck, shfmt, jq, ruby, curl, `apps/operate/panel`, `apps/maintain/updater`, provision scripts | Active | Large gate script with Docker side effects and dynamic temp resources; high blast radius if changed. |
| `scripts/validate.sh` | Bash | Compatibility entrypoint that delegates to `verify.sh`. | top-level `exec` | script | `scripts/verify.sh` | Active | Thin wrapper may confuse users expecting narrower validation. |

## Repository Documentation And Contracts

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `README.md` | Markdown | Top-level module overview, requirements, quick starts, shared contracts, and root verification command. | N/A | config | `docs/reference/*`, `docs/workflows/*`, module README files | Active | Branching text says publication target is `main`; `docs/architecture.md` says `dev`, so publication intent conflicts. |
| `CONTRIBUTING.md` | Markdown | Repo contribution scope, coding standards, verification, and commit grouping. | N/A | config | `./scripts/verify.sh` | Active | None obvious. |
| `CHANGELOG.md` | Markdown | Repository-level change history. | N/A | config | Release process | Active | Historical source only. |
| `SECURITY.md` | Markdown | Security reporting and in-scope defensive review areas. | N/A | config | Panel, updater, provision, shared examples | Active | None obvious. |
| `AGENTS.md` | Markdown | Local agent guidance for cautious repo work. | N/A | config | Agent tooling | Active locally; ignored by Git | Ignored by `.gitignore`, so durable only in this checkout unless explicitly committed. |
| `docs/architecture.md` | Markdown | Module boundaries and runtime flow. | N/A | config | `operate`, `maintain`, `provision` contracts | Active | Publication intent conflicts with `README.md`. |
| `docs/reference/env.md` | Markdown | Shared environment and secret naming contract. | N/A | config | Compose examples, panel env, startup wrapper | Active | None obvious. |
| `docs/reference/topology.md` | Markdown | Recommended deployment topology. | N/A | config | Panel, Redis, SQLite, updater, SteamCMD | Active | None obvious. |
| `docs/workflows/*.md` | Markdown | Operator workflows for provision, update, operate, migrate, and disaster recovery. | N/A | config | Module docs and reference contracts | Active | Directory represented, not prose-audited line by line. |
| `docs/archive/**` | Markdown | Historical migration provenance and source notes. | N/A | config | Migration history | Active historical docs | Deprecated source context by design; should not drive current runtime behavior without fresh evidence. |

## Operate Panel: Runtime Server

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/app.ts` | TypeScript | Express app setup: security headers, sessions, CSRF, rate limits, static assets, route mounting, health check, startup, and shutdown. | default `app`; `isStrongSessionSecret`, `parsePort`, middleware closures | entrypoint | Express, session, Redis, SQLite db, RCON manager, route modules | Active | Large mixed entrypoint; includes test-only route gated by env; several cleanup `catch` blocks intentionally ignore cleanup errors. |
| `apps/operate/panel/db.ts` | TypeScript | Opens SQLite, applies versioned migrations, enforces foreign keys, encrypts plaintext RCON passwords when a key exists, and optionally bootstraps first admin. | `better_sqlite_client`; `openDb`, `runMigrations` internal | migration, storage adapter | better-sqlite3, bcrypt, `utils/rconSecret`, logger | Active | Legacy/pre-migration compatibility columns are intentionally preserved; schema changes are high-risk. |
| `apps/operate/panel/modules/rcon.ts` | TypeScript | Owns live RCON sockets, password lookup, connect/probe/reconnect, per-server command queues, heartbeats, timeout handling, and shutdown. | `RconManager`, default singleton | adapter, domain logic | `rcon-srcds`, SQLite lazy import, `rconSecret`, `networkValidation`, logger | Active | High-risk concurrency/state file; notes insecure RNG in dependency; many cleanup catch blocks; single singleton complicates tests. |
| `apps/operate/panel/modules/middleware.ts` | TypeScript | Auth guard for protected routes. | default `isAuthenticated` | adapter | Express session typing | Active | None obvious. |
| `apps/operate/panel/routes/auth.ts` | TypeScript | Login/logout API with bcrypt verification, dummy hash timing protection, session regeneration, CSRF token generation, and cookie clearing. | default router; `LoginBodySchema` internal | adapter | Express, bcrypt, crypto, zod, SQLite, logger | Active | None obvious. |
| `apps/operate/panel/routes/server.ts` | TypeScript | Server inventory pages and APIs: add/list/manage/reconnect/delete plus game mode/map lookup. Validates hostnames and verifies RCON credentials. | default router; prepared statements; `AddServerBodySchema` internal | adapter, domain logic | SQLite, RCON manager, rate limiter, Redis store, maps config, hostname parser, RCON secret encryption, network validation | Active | Broad route file with DB, RCON, validation, and rendering mixed together; manage page silently degrades hostname lookup. |
| `apps/operate/panel/routes/game/index.ts` | TypeScript | Combines match and controls routers. | default router | adapter | `match`, `controls` routers | Active | None obvious. |
| `apps/operate/panel/routes/game/helpers.ts` | TypeScript | Shared RCON command validation, string/CFG/backup sanitizers, error mapping, and route factory helpers for common game-control patterns. | constants `MAX_*`, `RCON_*`; `parseConVarValue`, `sanitizeString`, `isRconCommandAllowed`, `sanitizeCfgName`, `sanitizeBackupFileName`, `sendGameRouteError`, `parseIntBody`, `requireAllowlisted`, `runGameCmd`, `execCfg`, `make*Route` | domain logic | RCON manager, authz helper, logger | Active | Route factories are useful but can hide per-endpoint behavior; RCON allowlist is a high-risk security boundary. |
| `apps/operate/panel/routes/game/match.ts` | TypeScript | RCON-backed setup, match phase, backup restore, MatchZy, player management, workshop, map group, raw RCON, and admin chat APIs. | default router; zod body schemas; prepared `updateServerStmt` | adapter, domain logic | RCON manager, SQLite, maps config, RCON history, game helpers, logger | Active | Very large file with many endpoint-specific branches; high risk for partial RCON sequences and hidden compatibility assumptions. |
| `apps/operate/panel/routes/game/controls.ts` | TypeScript | Practice, bot, scrim, game modifier, random rounds, and RTD endpoints. | default router; `VALID_GIVE_WEAPONS`, `VALID_OT_ROUNDS` internal | adapter, domain logic | game helpers, auth middleware, logger | Active | Many endpoints are thin wrappers; some multi-command `Promise.all` calls can partially apply settings if one RCON command fails. |
| `apps/operate/panel/routes/status.ts` | TypeScript | Live status API that queries RCON status, hostname, and visible max players, then returns explicit observation/error fields. | default router; prepared `selectStatusStmt` | adapter | SQLite, RCON manager, RCON parsers, hostname parser, logger | Active | It maps any fulfilled RCON command to `connected/authenticated: true`; good target for runtime semantics review. |
| `apps/operate/panel/routes/operator.ts` | TypeScript | Player list, RCON autocomplete/cache, workshop favorites CRUD, and RCON history APIs. | default router; favorite schemas; `loadAutocomplete` internal | adapter, domain logic | SQLite, RCON manager, authz helpers, RCON parsers, RCON history, game command policy | Active in working tree; untracked at index time | Mixed persistence plus RCON observation plus cache state; autocomplete cache is in-memory only. |
| `apps/operate/panel/routes/users.ts` | TypeScript | Settings/admin user pages and user password/create/delete/list APIs. | default router; `isAdmin` internal | adapter | Express, zod, bcrypt, SQLite, logger | Active | Admin authorization is local helper; could drift from other authz patterns. |

## Operate Panel: Utilities And Types

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/utils/logger.ts` | TypeScript | Shared Pino logger. | default `logger` | adapter | pino | Active | None obvious. |
| `apps/operate/panel/utils/mapsConfig.ts` | TypeScript | Validates and exposes `cfg/maps.json`, plus map lookup by game type/mode. | `mapsConfig`, `getMapsForMode`, types | config, domain logic | zod, JSON import | Active | Allows mode exec references that are not checked against actual CFG files. |
| `apps/operate/panel/utils/networkValidation.ts` | TypeScript | Validates server host/IP strings and rejects loopback, link-local, metadata, unspecified, and blocked resolved IPs. | `isBlockedIP`, `isValidServerHost`, `isValidServerHostResolved` | domain logic | Node `dns`, `net`, WHATWG URL | Active | Block list allows private LAN by design; needs tests for any network boundary change. |
| `apps/operate/panel/utils/parseServerId.ts` | TypeScript | Parses positive server IDs and enforces server access by lazy-prepared SQLite statement. | `parseServerId`, `requireServerId`, `requireAuthorizedServerId`, `requireAuthorizedServerIdParam` | domain logic, adapter | Express, lazy SQLite require | Active | Lazy `require` is a test/mocking compatibility shim; duplicated status codes can drift across routes. |
| `apps/operate/panel/utils/rconHistory.ts` | TypeScript | Records, lists, prunes, and clears per-user/per-server successful RCON command history. | `RconHistoryRow`, `recordRconCommand`, `listRconHistory`, `clearRconHistory` | domain logic, storage adapter | SQLite | Active in working tree; untracked at index time | Hard-coded history limit; no obvious dead code. |
| `apps/operate/panel/utils/rconParsers.ts` | TypeScript | Parses RCON status/users/autocomplete output and sanitizes display fields. | `ParsedStatus`, `ParsedPlayer`, `steamAccountIdToSteamId64`, `parseStatusResponse`, `parseVisibleMaxPlayers`, `parseUsersResponse`, `parseAutocompleteOutput` | domain logic | BigInt, regex parsers | Active in working tree; untracked at index time | Regex parsers are brittle by nature; use fixture-heavy tests before changing. |
| `apps/operate/panel/utils/rconResponse.ts` | TypeScript | Parses and sanitizes hostname responses for UI display. | `parseHostnameResponse` | domain logic | Unicode/control-character regex | Active | Narrow helper partly overlaps RCON parser cleanup concerns. |
| `apps/operate/panel/utils/rconSecret.ts` | TypeScript | AES-256-GCM encryption/decryption for stored RCON passwords using hex/base64 32-byte key. | `decryptRconSecret`, `encryptRconSecret`, `hasRconSecretKey`, `isEncryptedRconSecret`, `_resetCachedKey` | domain logic, storage adapter | Node crypto, `RCON_SECRET_KEY` | Active | `_resetCachedKey` is test-only export; plaintext fallback without key is development behavior. |
| `apps/operate/panel/utils/redis.ts` | TypeScript | Builds optional Redis client and rate-limit store from env vars. | `redisUrl`, `redisClient`, `makeRateLimitStore` | adapter | redis, rate-limit-redis, logger | Active | Production startup requires Redis in `app.ts`; this module itself returns null silently. |
| `apps/operate/panel/types/express-session.d.ts` | TypeScript declaration | Augments Express session with user and CSRF fields. | module augmentation for `express-session` | config | express-session types | Active | None obvious. |
| `apps/operate/panel/types/rcon-srcds.d.ts` | TypeScript declaration | Provides local typings for `rcon-srcds`. | module declaration `rcon-srcds`, `RCONOptions` | config | `rcon-srcds` | Active | Local type shim can drift from library behavior. |

## Operate Panel: Browser UI And Assets

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/public/ts/console.ts` | TypeScript browser entry | Initializes the servers page or manage page based on current path and stores the current server ID. | top-level DOMContentLoaded handler | UI entrypoint | `context`, `servers`, `manage` | Active, source for bundle | Path-based bootstrap is simple but tightly coupled to route names. |
| `apps/operate/panel/public/ts/common.ts` | TypeScript browser utility | Shared POST/CSRF fetch helper, toast system, loading state helper, and custom confirm modal. | `ApiResponse`, `sendPostRequest`, `initToast`, `toastError`, `withLoading`, `showToast`, `showConfirm` | UI, adapter | Browser fetch/DOM | Active | None obvious after unused export removal. |
| `apps/operate/panel/public/ts/context.ts` | TypeScript browser utility | Module-scoped current server ID storage for manage-page actions. | `setServerId`, `getServerId` | UI state | `console.ts`, `manage.ts` | Active | Global module state is simple but implicit. |
| `apps/operate/panel/public/ts/servers.ts` | TypeScript browser module | Renders server cards, skeletons, reconnect/delete actions, and live player counts on `/servers`. | `initServersPage`; internal `fetchServers`, `createSkeletonCard` | UI | `common.ts`, `/api/servers`, `/api/status`, reconnect/delete APIs | Active | Some status fetch failures are swallowed to keep page usable. |
| `apps/operate/panel/public/ts/manage.ts` | TypeScript browser module | Wires manage-page controls for game setup, status, players, RCON console/history/autocomplete, workshop favorites, backups, MatchZy, bots, and toggles. | `initManagePage`; many internal `init*` functions | UI | `common.ts`, `context.ts`, many `/api/*` endpoints | Active | Very large UI state/event file; duplicated endpoint knowledge with server routes and EJS IDs. |
| `apps/operate/panel/public/js/console.js` | Generated JavaScript | Browser bundle generated from `public/ts/console.ts` by esbuild. | bundled IIFE | generated, UI | `npm run build:client`, ignored by Git | Generated and active at runtime when present | Do not edit directly; can go stale if not rebuilt. |
| `apps/operate/panel/public/js/toast-inline.js` | JavaScript browser helper | Minimal toast implementation for login and add-server pages that do not load the main bundle. | IIFE defining `window.showToast` | UI | `panel.css`, login/add-server inline scripts | Active | Duplicate toast logic with `public/ts/common.ts`; likely acceptable but worth consolidating only with UI plan. |
| `apps/operate/panel/public/css/panel.css` | CSS | Full panel styling, layout, responsive behavior, status visuals, modals, RCON console, and component classes. | CSS selectors/classes | UI | EJS views, generated browser JS, copied fonts | Active | Large single stylesheet; hard to prove dead selectors without browser coverage. |

## Operate Panel: Views

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/views/login.ejs` | EJS/HTML | Login page with inline POST to `/auth/login`, CSRF meta tag, and toast feedback. | EJS template | UI | `auth.ts`, `toast-inline.js`, `panel.css` | Active | Inline script duplicates fetch patterns outside main TS bundle. |
| `apps/operate/panel/views/add-server.ejs` | EJS/HTML | Add-server form posting to `/api/add-server`. | EJS template | UI | `server.ts`, `toast-inline.js`, `panel.css` | Active | Inline script duplicates TS fetch/error behavior. |
| `apps/operate/panel/views/servers.ejs` | EJS/HTML | Server dashboard shell and main bundle include. | EJS template | UI | `public/js/console.js`, `servers.ts`, navbar/footer partials | Active | Thin shell; behavior lives in TS bundle. |
| `apps/operate/panel/views/manage.ejs` | EJS/HTML | Main server manage interface with IDs/data attributes for status, game setup, RCON, backups, MatchZy, players, favorites, and controls. | EJS template | UI | `public/js/console.js`, `manage.ts`, routes under `/api/*` | Active | Large template tightly coupled to `manage.ts` IDs; high risk for dead/unwired controls. |
| `apps/operate/panel/views/settings.ejs` | EJS/HTML | Change-password page with inline script calling `/api/users/change-password`. | EJS template | UI | `users.ts`, CSRF meta, navbar/footer | Active | Inline script duplicates request handling. |
| `apps/operate/panel/views/admin-users.ejs` | EJS/HTML | Admin user-management page and inline user add/delete/list behavior. | EJS template | UI | `users.ts`, server access data, CSRF | Active | Inline DOM code outside TS bundle; should be included in UI audit if changed. |
| `apps/operate/panel/views/partials/navbar.ejs` | EJS partial | Shared navigation and logout form. | EJS partial | UI | session locals `csrfToken`, `isAdmin`; auth logout route | Active | None obvious. |
| `apps/operate/panel/views/partials/footer.ejs` | EJS partial | Shared footer markup. | EJS partial | UI | views | Active | None obvious. |

## Operate Panel: CFG And Runtime Data Assets

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/cfg/maps.json` | JSON | Defines game types, modes, exec CFG names, map groups, and workshop map pools. | N/A | config | `utils/mapsConfig.ts`, `routes/server.ts`, `routes/game/match.ts`, tests | Active | References `oitc.cfg` and `1v1arenas.cfg`, but those files are absent from `cfg/`; setup can pass validation then fail at RCON exec unless server has them. |
| `apps/operate/panel/cfg/warmup.cfg` | CS2 CFG | Warmup ruleset. | N/A | config | `maps.json`, `match.ts`, server setup docs | Active | Runtime use requires operator copying file to CS2 server cfg dir. |
| `apps/operate/panel/cfg/wingman.cfg` | CS2 CFG | Wingman ruleset. | N/A | config | `maps.json`, server setup docs | Active | Runtime use depends on manual deploy to server. |
| `apps/operate/panel/cfg/deathmatch.cfg` | CS2 CFG | Deathmatch ruleset. | N/A | config | `maps.json`, tests | Active | Runtime use depends on manual deploy to server. |
| `apps/operate/panel/cfg/gungame.cfg` | CS2 CFG | GunGame ruleset. | N/A | config | `maps.json`, tests | Active | Runtime use depends on matching server plugins/maps. |
| `apps/operate/panel/cfg/bhop.cfg` | CS2 CFG | Bunnyhop ruleset. | N/A | config | `maps.json`, tests | Active | Contains repeated `say` lines; may be intentional in-game announcement. |
| `apps/operate/panel/cfg/ctf.cfg` | CS2 CFG | Capture-the-flag ruleset. | N/A | config | `maps.json`, tests | Active | Runtime use depends on plugin availability. |
| `apps/operate/panel/cfg/scoutzknivez.cfg` | CS2 CFG | ScoutzKnivez ruleset. | N/A | config | `maps.json`, tests | Active | Contains repeated `say` lines; may be intentional. |
| `apps/operate/panel/cfg/surf.cfg` | CS2 CFG | Surf ruleset. | N/A | config | `maps.json` | Active | Runtime use depends on server-side support. |
| `apps/operate/panel/cfg/deathrun.cfg` | CS2 CFG | Deathrun ruleset. | N/A | config | `maps.json` | Active | Runtime use depends on server-side support. |
| `apps/operate/panel/cfg/knife.cfg` | CS2 CFG | Knife-round ruleset. | N/A | config | `match.ts` start-knife route, server setup docs | Active | Runtime use depends on manual deploy. |
| `apps/operate/panel/cfg/random_rounds_on.cfg` | CS2 CFG | Enables random rounds plugin/config. | N/A | config | `controls.ts` random-rounds toggle | Active | Plugin dependency not enforced by panel. |
| `apps/operate/panel/cfg/random_rounds_off.cfg` | CS2 CFG | Disables random rounds plugin/config. | N/A | config | `controls.ts` random-rounds toggle | Active | Plugin dependency not enforced by panel. |
| `apps/operate/panel/cfg/rtd_on.cfg` | CS2 CFG | Enables RTD plugin/config. | N/A | config | `controls.ts` RTD toggle | Active | Plugin dependency not enforced by panel. |
| `apps/operate/panel/cfg/rtd_off.cfg` | CS2 CFG | Disables RTD plugin/config. | N/A | config | `controls.ts` RTD toggle | Active | Plugin dependency not enforced by panel. |
| `apps/operate/panel/cfg/live_wingman.cfg` | CS2 CFG | Live wingman ruleset example. | N/A | config | Listed in server setup docs | UNCLEAR | No code or `maps.json` reference found. Prove active with deploy docs, route reference, or server-side smoke; otherwise likely manual-only or dead. |
| `apps/operate/panel/cfg/server-provided/live.cfg` | CS2 CFG | Server-provided live MatchZy config source. | N/A | config | `match.ts` executes `live.cfg`; docs do not explicitly map this nested file to runtime cfg root | UNCLEAR | Possible path mismatch: route expects `live.cfg`, but repo file is nested under `server-provided/`. Prove with copy/deploy workflow. |

## Operate Panel: Package, Build, And Tool Config

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/package.json` | JSON | Panel metadata, Node engine, scripts, dependencies, dev dependencies, and npm overrides. | N/A | config | npm, Node 22, TypeScript, Express, Redis, SQLite, Playwright, esbuild | Active | Build scripts generate ignored assets; dependency usage looked represented by imports/scripts. |
| `apps/operate/panel/package-lock.json` | JSON lockfile | Locks npm dependency graph. | N/A | generated, config | npm ci, CI cache | Active generated | Do not hand edit. |
| `apps/operate/panel/.npmrc` | npm config | Enforces package engine range. | N/A | config | npm | Active | None obvious. |
| `apps/operate/panel/.nvmrc` | text config | Pins local Node major version to 22. | N/A | config | nvm or compatible tool | Active | None obvious. |
| `apps/operate/panel/.prettierrc.json` | JSON | Prettier style config. | N/A | config | Prettier | Active | None obvious. |
| `apps/operate/panel/.prettierignore` | ignore config | Excludes generated/heavy files from Prettier. | N/A | config | Prettier | Active | None obvious. |
| `apps/operate/panel/.gitignore` | Git ignore config | Excludes panel build, local DB/env, caches, generated JS/fonts, and local audit artifacts. | N/A | config | Git | Active | Ignores generated runtime bundle; stale local bundle is possible. |
| `apps/operate/panel/.dockerignore` | Docker ignore config | Reduces Docker build context. | N/A | config | Docker build | Active | Ignores `public`, `views`, and `cfg/maps.json`; Dockerfile copies after build context, so verify before changing. |
| `apps/operate/panel/.gitleaks.toml` | TOML | Allows known local/test fixture stopword for Gitleaks. | N/A | config | gitleaks | Active | Secret-scan exceptions are sensitive; review with scanner evidence. |
| `apps/operate/panel/eslint.config.js` | JavaScript config | ESLint flat config for server TS, client TS, and JS. | `module.exports` config | config | typescript-eslint, globals | Active | Explicitly ignores views, cfg, dist, generated JS. |
| `apps/operate/panel/tsconfig.json` | JSONC | Server/test TypeScript compiler config. | N/A | config | TypeScript | Active | Contains TODO and `ignoreDeprecations` for CommonJS/module-system migration. |
| `apps/operate/panel/tsconfig.client.json` | JSON | Browser TypeScript no-emit config. | N/A | config | TypeScript DOM libs | Active | None obvious. |
| `apps/operate/panel/playwright.config.ts` | TypeScript config | E2E config, isolated state dir, test DB env, and web server startup. | default Playwright config | config, test | Playwright, built `dist/app.js`, `.e2e` state | Active | Mutates env at config load; deletes `.e2e` outside worker context. |
| `apps/operate/panel/Dockerfile` | Dockerfile | Multi-stage production image: builds TS/client bundle, prunes dev deps, runs `dist/app.js`, and exposes healthcheck. | Docker stages | config | Node 22, npm, esbuild, TypeScript, app files | Active | Docker build path depends on included context; validate with `npm run validate -- --require-docker`. |
| `apps/operate/panel/docker-compose.yaml` | Compose YAML | Local panel deployment example with mounted data dir and hardened container options. | service `cs2rcon` | config | Docker Compose, `.env`, panel Dockerfile | Active | Service name differs from shared example (`cs2rcon` vs `panel`); verify docs consistency before changing. |
| `apps/operate/panel/.env.example` | env example | Documents panel env vars and placeholder defaults. | N/A | config | app/db/Redis/RCON secret env handling | Active | Contains placeholder default credentials by design; do not use in production. |

## Operate Panel: Panel Scripts

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/scripts/copy-fonts.js` | Node script | Copies Syne and JetBrains Mono font files from `node_modules` into `public/fonts`. | top-level script | script, generated asset prep | fs, path, `@fontsource-variable/*` | Active | Hard-coded font file paths; build fails if package layout changes. |
| `apps/operate/panel/scripts/format.sh` | Bash | Runs shfmt in write mode for panel scripts. | top-level script | script | `scripts/lib/common.sh`, shfmt | Active | Writes files; do not run during audit-only tasks. |
| `apps/operate/panel/scripts/lib/common.sh` | Bash | Shared shell helpers for panel scripts: logging, command discovery, Docker availability, repo root. | helper functions | script | bash, docker optional | Active | None obvious. |
| `apps/operate/panel/scripts/validate.sh` | Bash | Validates panel shell scripts, JSON, YAML, repo hygiene, and optionally Docker build/compose. | top-level validation | script | shellcheck, shfmt, jq, ruby, Docker, compose | Active | Creates temporary `.env` during Docker validation and must clean it; covered by tests. |

## Operate Panel: Tests

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/operate/panel/test/http-helpers.ts` | TypeScript test helper | Login and CSRF helper functions for HTTP integration tests. | `getPageCsrfToken`, `getLoginPageCsrfAndCookie`, `loginAndGetSession` | test | node assert, fetch | Active | None obvious. |
| `apps/operate/panel/test/app.test.ts` | TypeScript node:test | Broad route/security/map-mode tests for auth, CSRF, health, setup-game, MatchZy, workshop, random rounds, RTD, logout, and map pools. | many `test(...)` cases | test | compiled app, SQLite temp DB, mocked RCON | Active | Very large mixed test file; includes tests for `oitc` and `1v1arenas` map pools while matching CFG files are absent. |
| `apps/operate/panel/test/entrypoint.test.ts` | TypeScript node:test | Starts `tsx app.ts` or `dist/app.js` as subprocess and verifies startup/fail-fast production behavior. | `get` helper, startup tests | test | child_process, HTTP, temp DB/env | Active | Subprocess tests are slower and environment-sensitive. |
| `apps/operate/panel/test/game-helpers.test.ts` | TypeScript node:test | Unit tests for game helper parsing/sanitization/RCON policy. | describes for helper functions | test | node:test mock, `routes/game/helpers` | Active | Skips on older Node for `mock.module`; repo requires Node 22. |
| `apps/operate/panel/test/game-routes.test.ts` | TypeScript node:test | Integration tests for setup-game, workshop map, raw RCON, players, autocomplete, favorites, history, and say-admin. | many `test(...)` cases | test | app, temp SQLite, mocked RCON, HTTP helpers | Active | Large route test file mirrors broad route surface. |
| `apps/operate/panel/test/network-validation.test.ts` | TypeScript node:test | Unit tests for blocked IP/host validation and DNS resolution checks. | describes for network validation | test | dns mock, `networkValidation` | Active | None obvious. |
| `apps/operate/panel/test/parse-server-id.test.ts` | TypeScript node:test | Unit tests for positive server ID parsing. | describe `parseServerId` | test | `parseServerId` | Active | None obvious. |
| `apps/operate/panel/test/rcon-manager.test.ts` | TypeScript node:test | Unit tests for RCON host revalidation and per-server command serialization. | fake socket/RCON classes, tests | test | node:test mock, `RconManager` | Active | Fakes cover key invariants but not real `rcon-srcds` packet behavior. |
| `apps/operate/panel/test/rcon-parsers.test.ts` | TypeScript node:test | Unit tests for status, users, SteamID, visible-max, and autocomplete parsers. | describe `RCON parsers` | test | `utils/rconParsers` | Active in working tree; untracked at index time | Parser fixture coverage is important; expand before parser changes. |
| `apps/operate/panel/test/rcon-response.test.ts` | TypeScript node:test | Unit tests for hostname response parser. | describe `parseHostnameResponse` | test | `utils/rconResponse` | Active | Uses one `any` cast with lint disable for invalid input test. |
| `apps/operate/panel/test/rcon-secret.test.ts` | TypeScript node:test | Unit tests for RCON secret encryption/decryption and no-key behavior. | three tests | test | `utils/rconSecret` | Active | Test-only `_resetCachedKey` export supports this. |
| `apps/operate/panel/test/scripts.test.ts` | TypeScript node:test | Tests validation script cleanup, docs/auth contract text, template behavior, tracked tests, and Redis-capable limiter wiring. | tests using temp workspace and text assertions | test | fs, child_process, shell stubs | Active | Some assertions inspect docs/templates by text; can become brittle. |
| `apps/operate/panel/test/server-crud.test.ts` | TypeScript node:test | Integration tests for add/list/delete server behavior, validation, private LAN allowance, and RCON auth failure. | many CRUD tests | test | app, temp SQLite, mocked RCON, HTTP helpers | Active | None obvious. |
| `apps/operate/panel/test/status.test.ts` | TypeScript node:test | Integration tests for status endpoint auth, missing server, RCON success, and explicit RCON error fields. | status tests | test | app, temp SQLite, mocked RCON | Active | None obvious. |
| `apps/operate/panel/test/user-management.test.ts` | TypeScript node:test | Integration tests for password change, admin user CRUD, list, and admin page server access choices. | user-management tests | test | app, temp SQLite, bcrypt, mocked RCON | Active | Large test file but behavior-oriented. |
| `apps/operate/panel/test/e2e/panel.spec.ts` | Playwright TypeScript | Browser E2E for health, login/dashboard/logout, add-server validation, manage page states, and failed login. | Playwright tests; `login`, `seedManageServer` helpers | test | Playwright, built app, E2E seed route | Active | Uses test-only app route; not a real RCON smoke. |

## Maintain Updater

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/maintain/updater/Makefile` | Makefile | Defines updater lint, format, test, security, ci, clean, and help targets. | `lint`, `fmt`, `test`, `security`, `ci`, `clean`, `help` | config | updater scripts and tests | Active | None obvious. |
| `apps/maintain/updater/update_cs2.sh` | Bash | CS2 auto-updater: config parsing, validation, locking, disk checks, SteamCMD build comparison/update, systemd stop/start, logging, dry-run/status modes. | many functions including `load_config_file`, `validate_config`, `init_lock`, `check_space`, `run_update`, `read_buildid`, `get_remote_buildid`, `determine_update_state`, `start_service`, `ensure_service_running` | entrypoint, domain logic, script | bash, SteamCMD, systemd, df, ps, awk, runuser/su/sudo, config file | Active | Very large shell state machine; removed config key compatibility path is intentional; high-risk startup/shutdown behavior. |
| `apps/maintain/updater/cs2-auto-update.conf.example` | env-style config | Example config for updater paths, service, SteamCMD, retries, log level, and test overrides. | N/A | config | `update_cs2.sh` | Active | Comments-only defaults; runtime config is operator-local. |
| `apps/maintain/updater/scripts/lint.sh` | Bash | Runs bash syntax check, shellcheck, and shfmt diff over updater script list. | top-level script | script | `shell-files.env`, shellcheck, shfmt | Active | None obvious. |
| `apps/maintain/updater/scripts/fmt.sh` | Bash | Runs shfmt in write mode for updater shell files. | top-level script | script | `shell-files.env`, shfmt | Active | Writes files; do not run during audit-only tasks. |
| `apps/maintain/updater/scripts/security.sh` | Bash | Secret regex scan plus dependency-manifest guard for updater module. | `cleanup` plus top-level scanner | script | git grep or grep, awk, mktemp | Active | SCA check exits 2 if manifests are found; deliberately primitive scanner. |
| `apps/maintain/updater/scripts/shell-files.env` | Bash env | Single source of files linted/formatted by updater shell tooling. | `FILES` array | config | lint/fmt scripts | Active | Includes test stubs as shell files. |
| `apps/maintain/updater/scripts/ci-install-tools.sh` | Bash | Downloads pinned shellcheck and shfmt releases with SHA256 verification for CI/manual environments. | `add_path`, `require_cmd`, `sha256_file`, `install_shellcheck`, `install_shfmt` | script | curl, tar, checksum tools, `ci-tools-versions.env` | Active manual helper | Current root CI installs tools via apt; prove active CI use before relying on this path. |
| `apps/maintain/updater/scripts/ci-tools-versions.env` | Bash env | Pinned shellcheck/shfmt versions and SHA256 values for `ci-install-tools.sh`. | version/hash variables | config | `ci-install-tools.sh` | Active manual helper | Same manual/CI uncertainty as `ci-install-tools.sh`. |
| `apps/maintain/updater/tests/run.sh` | Bash test harness | Stub-driven updater test suite for no-update/update/error/status/dry-run/lock/config/security cases. | `fail`, `assert_contains`, `run_validation_test`, `setup_cs2_dir`, `run_case`, `run_with_args_case`, `run_lock_case`, stale-lock helpers | test | updater script, test stubs, temp files/env | Active | Large shell test harness; many global env mutations. |
| `apps/maintain/updater/tests/bin/runuser` | Bash test stub | Test stub that ignores user switching and execs command. | top-level script | test | updater tests | Active | Stub only; not production. |
| `apps/maintain/updater/tests/bin/systemctl` | Bash test stub | Simulates systemctl stop/start/is-active and records calls. | top-level case statement | test | updater tests env vars | Active | Stub only; not production. |
| `apps/maintain/updater/tests/bin/steamcmd` | Bash test stub | Simulates SteamCMD app info and update behavior, including manifest writes. | top-level script | test | updater tests env vars | Active | Stub only; not production. |
| `apps/maintain/updater/.editorconfig` | EditorConfig | Module-specific formatting defaults. | N/A | config | editors | Active | Different shell indent from root config; intentional module heritage but can confuse. |
| `apps/maintain/updater/.gitattributes` | Git attributes | Enforces LF for updater text files. | N/A | config | Git | Active | None obvious. |
| `apps/maintain/updater/.gitignore` | Git ignore config | Excludes updater logs/temp/cache/env/secret files. | N/A | config | Git | Active | None obvious. |
| `apps/maintain/updater/README.md` | Markdown | Updater module overview, flow, requirements, quick start, validation, and boundary. | N/A | config | updater script, systemd examples | Active | None obvious. |
| `apps/maintain/updater/CONTRIBUTING.md` | Markdown | Updater-specific setup, style, tests, security, and review notes. | N/A | config | `make ci`, `ci-install-tools.sh` | Active | Mentions helper not used by root CI. |
| `apps/maintain/updater/SECURITY.md` | Markdown | Updater security notes. | N/A | config | updater module | Active | None obvious. |
| `apps/maintain/updater/CHANGELOG.md` | Markdown | Updater change history. | N/A | config | release history | Active historical docs | Mentions removed compatibility paths; historical only. |
| `apps/maintain/updater/LICENSE` | Text | Updater license text. | N/A | config | package/legal | Active | None obvious. |

## Provision Bootstrap And Shared Runtime Examples

| File path | Language/type | Primary responsibility | Main exports/classes/functions | Runtime role | Direct dependencies worth knowing | Status | Obvious smells |
|---|---|---|---|---|---|---|---|
| `apps/provision/bootstrap/scripts/bootstrap-admins.sh` | Bash | Generates CounterStrikeSharp admin and admin group JSON seed files. | top-level script | script | bash, output directory | Active | Writes placeholder SteamID/admin identity; operator must replace. |
| `apps/provision/bootstrap/scripts/bootstrap-plugins.sh` | Bash | Generates plugin list examples. | top-level script | script | bash, output directory | Active | Static placeholder asset generator. |
| `apps/provision/bootstrap/env/server.env.example` | env example | Example CS2 runtime/startup env contract. | N/A | config | `server-start.sh`, compose example | Active | Placeholder secrets must not be used as real runtime values. |
| `apps/provision/bootstrap/README.md` | Markdown | Provision module scope and recommended flow. | N/A | config | provision scripts, shared examples | Active | None obvious. |
| `configs/examples/startup/server-start.sh` | Bash | CS2 container/host startup wrapper that validates port/player count, links admin files, writes secrets CFG, and execs `cs2.sh`. | `cfg_quote`, `require_integer_in_range`, `link_if_present` | script, entrypoint | CS2 runtime env, filesystem, generated admin files | Active | Writes secret CFG to runtime; high-risk secret handling and argv leakage boundary. |
| `configs/examples/compose/panel.compose.yaml` | Compose YAML | Shared panel compose example using operator-provided env and persistent volume. | service `panel` | config | panel Dockerfile, env vars | Active | Service name differs from module-local compose. |
| `configs/examples/compose/server-runtime.compose.yaml` | Compose YAML | Shared CS2 runtime compose example using startup wrapper and bootstrap assets. | service `cs2-runtime` | config | `server-start.sh`, bootstrap output, cm2network/cs2 image | Active | Uses placeholder/default env values; requires local env for real deployment. |
| `configs/examples/systemd/cs2-auto-update.service` | systemd unit | Oneshot service for updater. | unit/service stanzas | config | `update_cs2.sh` installed under `/opt/cs2-server-ops` | Active | Hard-coded install path must match operator deployment. |
| `configs/examples/systemd/cs2-auto-update.timer` | systemd timer | Daily updater timer. | timer/install stanzas | config | systemd service above | Active | None obvious. |

## Highest-Risk Files

1. `apps/operate/panel/modules/rcon.ts`: live RCON sockets, command queueing,
   timeouts, heartbeats, reconnect, and shutdown state.
2. `apps/operate/panel/routes/game/match.ts` and
   `apps/operate/panel/routes/game/controls.ts`: many state-changing RCON
   commands, multi-step sequences, and plugin/CFG assumptions.
3. `apps/operate/panel/routes/game/helpers.ts`: RCON command security boundary,
   ASCII-only policy, blocked command list, and shared route factories.
4. `apps/operate/panel/db.ts`: SQLite schema migrations, first-admin bootstrap,
   plaintext-to-encrypted RCON secret upgrade, and production fail-fast rules.
5. `apps/operate/panel/app.ts`: auth/session/CSRF/rate limit/security header
   behavior and production startup/shutdown.
6. `apps/maintain/updater/update_cs2.sh`: host-level updater state machine that
   can stop/start production CS2 services.
7. `configs/examples/startup/server-start.sh`: secret material generation and
   CS2 process argv/env handling.
8. `apps/operate/panel/cfg/maps.json`: validates UI choices but references CFG
   files that are not all present in the repo.

## Likely Dead Files

- `apps/operate/panel/public/js/console.js`: generated and ignored. It is needed
  as runtime output after build, but it is not source and should not be edited.
- `apps/operate/panel/cfg/live_wingman.cfg`: no direct route or `maps.json`
  reference found; docs list it as a server-side expected file. Marked `UNCLEAR`
  until a deploy workflow or runtime smoke proves use.
- `apps/operate/panel/cfg/server-provided/live.cfg`: likely intended as source
  for runtime `live.cfg`, but no copy script or docs mapping proves it. Marked
  `UNCLEAR`, not dead.
- `apps/maintain/updater/scripts/ci-install-tools.sh` and
  `apps/maintain/updater/scripts/ci-tools-versions.env`: manual helper path is
  documented and linted, but current root CI installs shell tools via apt. Marked
  active manual helper, not dead.

No production TypeScript file was confidently classified as unused. Deletion
needs import/reference checks plus targeted tests.

## Likely Overcomplicated Files

1. `apps/operate/panel/public/ts/manage.ts`: 1067 lines of UI event wiring and
   endpoint knowledge for many independent workflows.
2. `apps/operate/panel/routes/game/match.ts`: 634 lines and many RCON command
   families in one router.
3. `apps/maintain/updater/update_cs2.sh`: 980-line shell state machine with
   config parsing, locking, SteamCMD, and systemd concerns.
4. `apps/operate/panel/app.ts`: combines security, session, route mounting,
   health, test hooks, static assets, and process lifecycle.
5. `apps/operate/panel/test/app.test.ts`,
   `apps/operate/panel/test/game-routes.test.ts`,
   `apps/operate/panel/test/user-management.test.ts`, and
   `apps/maintain/updater/tests/run.sh`: broad test files that may be hard to
   maintain but currently provide important behavior coverage.

## Likely Deprecated Compatibility Paths

- `apps/maintain/updater/update_cs2.sh`: `REMOVED_CONFIG_VARS` and
  `warn_removed_config_keys` preserve warnings for removed webhook/RCON
  notification config.
- `apps/operate/panel/db.ts`: migration 1 handles pre-migration inline schema
  and legacy columns/backfills.
- `apps/operate/panel/tsconfig.json`: CommonJS module mode plus
  `ignoreDeprecations` is explicitly marked as a future module migration TODO.
- `apps/operate/panel/utils/parseServerId.ts`: lazy CommonJS `require` exists to
  avoid db import timing and support tests.
- `apps/operate/panel/app.ts` and `playwright.config.ts`: E2E seed route is a
  test-only compatibility path behind env flags.

## Recommended Next Audit Targets

1. CFG/map integrity audit: compare `maps.json` exec values against files in
   `cfg/`, docs, and actual server deployment workflow. Confirm `live.cfg`,
   `oitc.cfg`, and `1v1arenas.cfg` behavior.
2. RCON safety audit: validate command allowlist/blocklist, ASCII-only behavior,
   command serialization, timeout cleanup, heartbeat reconnect semantics, and
   false connected/authenticated states.
3. UI wiring audit: map every `manage.ejs` ID/data attribute to `manage.ts`
   handlers and server routes; verify all user-visible states in browser.
4. Storage/migration audit: inspect SQLite migrations, bootstrap paths,
   plaintext secret upgrade, and rollback behavior for existing DBs.
5. Updater runtime audit: focus on lock recovery, systemd start/stop ordering,
   unknown remote status, dry-run/status behavior, and config parsing.
6. Verification audit: prove root `./scripts/verify.sh` still covers all active
   source areas and does not hide false success behind generated or manual assets.

## Coverage Gaps And Uncertainty

- Real CS2 server behavior was not exercised; all RCON/runtime conclusions are
  source-level only.
- Docker validation, Playwright E2E, full unit tests, updater full `make ci`, and
  root `./scripts/verify.sh` were not run in this indexing pass.
- Panel generated assets and fonts were identified from scripts and ignore rules;
  generated output freshness was not verified.
- CFG file use cannot be fully proven from the repo because docs say operators
  must copy files into the CS2 server runtime. Proof requires a deploy/copy
  workflow or a runtime smoke on a server with those files installed.
- Existing uncommitted and untracked files were indexed as current codebase
  state. If those files are later reverted or committed differently, this index
  should be refreshed.
