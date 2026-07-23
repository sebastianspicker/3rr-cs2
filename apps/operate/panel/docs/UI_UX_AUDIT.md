# UI/UX audit and remediation plan

Status: the confirmed P1 frontend defects are remediated locally. Production-like
RCON, assistive-technology smoke testing, and multi-browser release evidence
remain open.

## Product, audience, and constraints

3RR is a modular self-hosted CS2 operations stack. The operate panel is an
authenticated server-rendered control plane, not a consumer dashboard. It uses
Node 22, Express 5, EJS, TypeScript, SQLite, Redis in production, and RCON.
Public access is limited to login and health; administrators manage accounts and
per-user server grants.

| Audience              | Goals and information                                      | Interaction needs and likely errors                                       | Accessibility considerations                           |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Server operator       | Endpoint, connection, freshness, players, safe next action | Frequent use; may confuse unknown with offline or requested with observed | Dense legibility, live feedback, non-color state       |
| Match/scrim admin     | Configure maps/modes, run controls, inspect RCON           | Time pressure; wrong target or stale state is costly                      | Persistent identity, predictable order, keyboard focus |
| Account admin         | Add users/grants and remove accounts                       | Infrequent work; weak password or wrong target                            | Native validation, table semantics, explicit dialogs   |
| Occasional maintainer | Add/reconnect endpoints and recover errors                 | May forget prerequisites or vocabulary                                    | Specific recovery without hiding technical detail      |

The primary device is a desktop/laptop behind an operator-managed TLS reverse
proxy. Narrow windows, zoom, and touch must not hide controls or state. The
frontend is a multi-page EJS application: Express renders authenticated views,
one esbuild browser bundle performs same-origin JSON/CSRF mutations, SQLite
stores users, grants, endpoints, and requested setup, and RCON supplies volatile
observations. The repo is public alpha: deterministic proof is strong, while
Docker and live RCON are separate release gates.

## Journeys

1. **Sign in:** `/` → credentials → inline failure or `/servers`.
2. **Find a server:** `/servers` → loading → inventory/empty/error → manage,
   reconnect, or remove. Unknown never means offline; load error offers Retry.
3. **Add a server:** `/add-server` → endpoint/password → validation and RCON
   probe → inline error or inventory.
4. **Operate:** `/manage/:id` → verify target/state → requested setup, observed
   status/players, RCON, match/practice controls → explicit/partial outcome.
5. **Manage access:** `/admin/users` → table → create with optional grant or
   delete a named account.
6. **Change password:** `/settings` → current/new/confirmation → persistent
   result.

Target/state recognition is highest priority, followed by safe action, recovery,
and administration. Passive statistics and decorative navigation have no role.

## Audit findings and implemented response

| Area            | Finding and evidence                                                                                | Resolution                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Navigation/IA   | Manage had no active parent; mobile Escape recovery absent (`navbar.ejs`)                           | Manage maps to Servers; controlled toggle and Escape close                                |
| Hierarchy       | Poster headings displaced work; two CSS directions and reveal choreography competed                 | Compact hierarchy, persistent identity slate, no staged reveal or page transition         |
| Type/color      | Technical character fit, but uppercase mono/status color were over-applied                          | Sans for content, mono for data, semantic colors paired with text                         |
| Forms           | Login/add repeated submits; settings/users bypassed native validation; setup submit led inputs      | Progress labels, native constraints, setup action after required selectors                |
| Inventory/table | Column headings were hidden to AT and rows did not have a table owner                               | Named `role=table` with owned row groups, headers, cells, and stable fallback identity    |
| Feedback        | List failure and request errors disappeared; network requests could wait indefinitely               | Persistent Retry/error surfaces, dismissible error alerts, 15-second request timeout      |
| Async safety    | Repeated controls stayed enabled and late mode/map/status responses could overwrite newer state     | Disable only the initiator; generation guards make latest selection/request authoritative |
| Safety          | Server removal omitted endpoint/cascade; dialog focused Confirm                                     | Target/consequence copy, action label, Cancel-first focus                                 |
| State truth     | Header status could diverge from refreshed RCON; toggle styling implied an unobserved On            | One live-status formatter updates all surfaces; neutral unknown controls                  |
| Unknown/error   | Missing player observations appeared blank or status-color-only                                     | Explicit Not observed/Timed out/Unavailable text and accessible error descriptions        |
| Responsive      | Desktop composition consumed excess vertical space                                                  | 900/680/480 px rules, 44 px narrow targets, mobile non-sticky identity                    |
| Performance     | Mutation/Intersection observers, cross-page transitions, and immutable stable asset URLs added risk | Removed ornamental observers/transitions; stable assets revalidate; one bundle retained   |
| AI slop         | Heart footer, faux telemetry, numbered decoration, staged reveals                                   | Factual copy and task-driven hierarchy                                                    |
| Maintainability | Product overrides still sit above a broad legacy component layer                                    | Tokens and behavior are documented; obsolete motion removed; CSS consolidation remains P3 |

No confirmed P0 was found. The confirmed P1 issues covered state truth,
inventory semantics, setup keyboard order, request recovery, RCON
announcements, destructive context, and form errors. They are addressed in the
current implementation. Automated screen-reader evidence is not inferred from
semantic markup or Chromium tests.

## Design goal and target structure

Create a precise, high-density control plane for self-hosting CS2 operators and
small tournament administrators. Optimize for server recognition, explicit
observed-versus-requested state, keyboard repetition, safe consequential action,
and recoverable failure. It should feel like a disciplined match-control desk.

Principles: function before decoration; target/state before action; unknown is a
real state; dense where useful; explicit feedback; native semantics; keyboard
parity; consequence-proportionate interruption; expert terminology; reuse before
abstraction.

Visual direction: a cold-white operational canvas under a graphite product bar,
with ultramarine for action and selection, mint-green for verified connection
and observation, coral for destructive actions, and amber for warnings or
unresolved state. The core palette is Canvas `#f4f6f9`, Surface `#ffffff`, Ink
`#12171f`, Action `#0b57e9`, Observed `#087f63`, and Destructive `#c93632`.
Syne provides restrained identity headings, system sans supports reading and
controls, and JetBrains Mono identifies endpoints, commands, timestamps, and
observations. The signature is the horizontal truth rail connecting server
context, observed state, requested setup, and sent RCON commands.

The design avoids the generic dashboard response of dark cards, decorative
metrics, and ambient effects. Open data tables, ruled sections, compact
controls, and truthful state labels carry the hierarchy. No gradient,
glassmorphism, decorative chart, or marketing surface is part of the system.

```text
global navigation
└─ active server: identity · endpoint · observed state · freshness
   ├─ requested setup  → send explicit setup commands
   ├─ observed status  → refresh / inspect players / inspect transcript
   └─ guarded controls → match · practice · server administration
```

Routes remain `/` → `/servers` → `/manage/:id`, with `/add-server`, `/settings`,
and admin-only `/admin/users` as peer utilities. Standardize tokens, buttons,
controls, alerts, compact panels, data rows, status labels, loading, feedback,
and dialogs. Keep RCON transcript, game selectors, workshop rows, and specialized
control grids local. Retain EJS, native controls, `details`, fonts, and esbuild.
Do not add a component library, state manager, icon set, or CSS runtime.

## Prioritized remediation plan

| Priority | User problem / proposed solution                                                                                                       | Workflow and affected files                                         | Dependency, risk, verification, acceptance                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P1 done  | Unknown toggles looked active; keep both neutral until observed and synchronize `aria-pressed` after accepted mutation                 | Manage controls; `manage.ejs`, `manageControls.ts`, `panel.css`     | None; medium; E2E; no selected side before observation                               |
| P1 done  | Inventory lacked an accessible table owner; add named table/rowgroup/header/cell ownership and stable identity                         | Find server; `servers.ejs`, `serverCards.ts`, `serverCardHeader.ts` | None; low; role assertions; every row has field names                                |
| P1 done  | Header and panels disagreed after RCON refresh; format once and update every status surface                                            | Operate; `manageLiveStatus*.ts`, `manage.ejs`                       | None; medium; E2E state sequence; all status badges agree                            |
| P1 done  | Setup action preceded its required inputs and transient loaders were silent; place action after selectors and expose persistent status | Setup; `manage.ejs`, `manageGameSetup.ts`                           | None; medium; keyboard/E2E; action follows required map and errors explain retry     |
| P1 done  | Requests could hang or be repeated; time out at 15 seconds, disable only the initiator, keep failures dismissible                      | All mutations; `common.ts`, route clients, `panel.css`              | None; medium; unit/E2E failure and pending checks; no indefinite wait                |
| P1 done  | Destructive removal lacked endpoint/cascade context and preferred Confirm; identify consequence and focus Cancel                       | Inventory; `servers.ts`, `common.ts`                                | None; medium; dialog keyboard E2E; deletion is never implicit                        |
| P1 done  | Forms bypassed constraints or allowed repeat submission; use native constraints, inline status, and pending labels                     | Login/add/settings/users views                                      | None; low; invalid/error E2E; invalid input never mutates                            |
| P1 done  | Ornamental motion delayed/clipped content; remove reveals, pulses, and cross-page transitions                                          | All routes; `panel.css`, screenshot script                          | None; medium; screenshot/overflow/reduced-motion; content stable at capture          |
| P2 done  | Older async mode/map/workshop responses could replace newer choices; use request generations                                           | Setup/workshop; `manageGameSetup.ts`, `manageWorkshopStatus.ts`     | None; medium; typecheck/E2E; latest choice wins                                      |
| P2 done  | Player/status failures were visually ambiguous; render explicit non-color unknown/error labels and accessible descriptions             | Inventory/manage; `serverPlayerCount.ts`, `manageLiveStatus*.ts`    | None; low; accessible-description E2E; blank never means offline                     |
| P2 done  | Session expiry and admin mutations lacked durable recovery/pending state; explain expiry and disable initiating account action         | Login/admin; `app.ts`, `login.ejs`, `admin-users.ejs`               | None; low; unit/E2E; retry path is visible                                           |
| P2 open  | Admin page duplicates request/dialog code; move behavior into the existing browser bundle without changing CSP/contracts               | Account administration; `admin-users.ejs`, client entry             | None; medium; build/E2E; no inline behavior remains                                  |
| P2 open  | Chromium-only checks leave engine/accessibility uncertainty; add Firefox/WebKit and an approved accessibility lane                     | Test config/CI                                                      | Browser binaries or approved dev tool; low; all projects pass with no serious issues |
| P3 done  | Competing legacy and product CSS layers obscured ownership; replace both with one tokenized route and component system                 | `panel.css`, all EJS views, `manage.ejs`                            | None; medium; six-route rendered review and full E2E                                 |

## Reviewable batches

1. **State/accessibility contract:** inventory semantics, toggles, synchronized
   RCON status, forms, dialogs. Tests: E2E + unit. Commit:
   `fix(panel): make operator state and actions explicit`.
2. **Request and recovery contract:** timeout, initiator-only pending state,
   request generations, persistent errors, explicit unknown values. Tests: E2E
   failure/pending/state sequences. Commit:
   `fix(panel): make asynchronous operations recoverable`.
3. **Operator visual system:** tokens, identity slate, density, responsive rules,
   factual footer, remove ornamental motion. Tests: desktop/mobile screenshots,
   focus, overflow, reduced motion. Commit:
   `refactor(panel): consolidate the operator interface theme`.
4. **Documentation/browser matrix:** docs and screenshot manifest; add browsers
   only in a separately approved tooling batch. Commit:
   `docs(panel): record frontend contracts and validation`.

Do not combine a manage partial split, browser expansion, or client-entry
refactor with the current behavioral work.

## Final validation checklist

- [x] Product, audience, routes, roles, and journeys mapped
- [x] Keyboard focus and modal focus contract implemented
- [x] Semantic labels, live feedback, native constraints implemented
- [x] Unknown/error/loading/empty states implemented or preserved
- [x] Destructive target/consequence explicit
- [x] Desktop and narrow responsive rules present
- [x] Reduced motion does not gate content
- [x] Format, lint, typecheck, build, and unit/integration tests pass locally
- [x] Final Chromium E2E passes after the last implementation change
- [x] All routes checked at 1536, 900, and 390 px after the last change
- [x] Static token contrast sampled
- [x] Skip-link and mobile navigation keyboard behavior checked
- [ ] Screen-reader smoke test completed
- [ ] Firefox/WebKit verified
- [ ] Docker and production-like RCON gates completed

Unchecked applicable items must be closed or accepted as alpha limitations.
Fixture tests do not prove a live CS2 deployment.

### Local evidence, 2026-07-23

- The host exposed Node `26.5.0` / npm `11.17.0`, outside the package's Node 22
  contract. The checks below passed, but the runtime mismatch remains explicit.
- `npm run format:check`, `npm run lint`, `npm run typecheck`, and
  `npm run build`: passed.
- `npm test`: 314 passed, 0 failed or skipped.
- `npm run test:e2e`: 20 Chromium tests passed, 0 failed.
- `npm run screenshots`: passed all six routes at 1536 × 1024, 900 × 1024, and
  390 × 844, including horizontal overflow, navigation-brand clipping,
  skip-link, mobile-menu Escape, reduced-motion, and browser-console checks. All
  six 1536 × 1024 route images and the tablet/mobile manage images were
  regenerated.
- `npm run validate`: passed with Docker explicitly skipped because the daemon
  is inaccessible.
- `git diff --check`: passed.
- Static token contrast against white: text 14.86:1, muted 4.97:1, blue 5.91:1,
  green 4.97:1, and coral 5.18:1. White against the graphite navigation is
  17.98:1.
- Current built frontend assets are 36,023 bytes `panel.css` and 35,230 bytes
  minified `console.js`; the obsolete second stylesheet was removed and no
  production dependency was added.

The in-app browser runtime had no available binding, so rendered validation used
the repository's installed Playwright 1.59.1 and Chromium revision 1217. Docker,
live CS2/RCON, a screen reader, Firefox, and WebKit were unavailable or are not
configured release gates. `npm ci` reported one low-severity dependency advisory;
it was not changed as part of this dependency-free frontend task.
