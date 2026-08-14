# Release Status

Evidence cutoff: 2026-07-23

Verdict: local freeze candidate tagged `v1.1.0-alpha.1`. Not published to
GitHub. Full production-like and Docker matrix remains incomplete.

## Candidate Identity

- Freeze tag (local): `v1.1.0-alpha.1`
- Product freeze commit: `90e3d6a` (`release: freeze v1.1.0-alpha.1 Night Desk operate panel`)
- Docs/screenshot pins: subsequent commits included in the tagged candidate
- Canonical GitHub repository: `sebastianspicker/3rr`
- Proposed umbrella tag: `v1.1.0-alpha.1`
- Panel package: private, version `1.1.0-alpha.1`
- Updater: version `1.9.0-alpha.1`

The product and canonical GitHub repository both use the 3RR identity.

## Current Local Addendum (2026-08-14)

The July freeze record below is historical evidence, not proof for the current
dirty worktree. In the live checkout:

- shared shell, formatting, YAML, JSON, and documentation-link checks passed;
- the updater passed lint, 66 stubbed behavior tests, and its secret and
  dependency-manifest guards;
- the provision module's bootstrap-output and startup-wrapper safety suites
  passed; and
- the full root verifier stopped before panel validation because the host is not
  on Node 22 and the Docker daemon required for its Node 22 fallback is not
  reachable.

Panel dependencies are not installed in the checkout, so current format, lint,
type, unit, coverage, Playwright, build, container, and HTTP-surface evidence was
not reproduced. No live Linux, systemd, SteamCMD, Redis, CS2, or RCON environment
was exercised. The repository has no GitHub Pages artifact or workflow; its
fixture screenshot tour is not a hosted or operational product demo.

This freeze captures the Night Desk Instrument UI, modular CSS build, dual-theme
tokens with Settings appearance toggle, manage truth rail, and the eight-view
screenshot tour. Before publication, confirm the tagged history contains the
intended mainline changes.

## Alpha Scope

The proposed alpha contains three independent modules:

- static provisioning examples and bootstrap writers;
- a Linux, systemd, and SteamCMD updater; and
- an authenticated Express panel with SQLite persistence, production Redis
  session and rate-limit storage, and RCON-backed operations.

Alpha status means configuration names, default paths, API details, and SQLite
migrations may change. The repository does not claim production suitability,
hosted operation, automatic host provisioning, or general Pterodactyl runtime
compatibility.

## Verified Local Evidence (Node 22.23.1)

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed for server and browser TypeScript projects.
- `npm test`: passed, 314 of 314 tests.
- `npm run test:e2e`: passed, 20 of 20 Chromium tests.
- `npm run build`: passed (includes `build:css` single-file panel bundle).
- `npm run screenshots`: captured all eight screenshot-manifest views
  (`01`–`08`) on the freeze tree with Node 22.23.1, Playwright 1.59.1, and
  Chromium. Desktop overflow gates passed; Settings includes Appearance theme
  controls. Captures use the default Night Desk theme.

## Blocked Or Incomplete Evidence

- `npm run validate -- --require-docker` / full `./scripts/verify.sh` Docker
  lane may still fail if the Docker daemon is inaccessible.
- No production-like CS2/RCON deployment, supervised updater run, migration,
  backup restore, graceful shutdown, or rollback was exercised in this freeze.
- Tag exists locally only until an owner publishes the GitHub prerelease.
- The tagged history must still be checked against `main` before remote publish.

## Required Before Public GitHub Alpha

1. Confirm the candidate contains the intended `main` history; re-tag any
   changed candidate only with explicit owner approval.
2. Run `./scripts/verify.sh` end to end with Node 22 and Docker when available.
3. Review every tracked env example through an approved secret-safe process.
4. Exercise one production-like CS2/RCON deployment and updater dry-run.
5. Build release artifacts from the exact tagged commit; record checksums, SBOM,
   platforms, limitations, rollback.
6. Push tag and create GitHub prerelease only after owner approval.

## Acceptable Alpha Limitations

- The updater supports Linux hosts with systemd, SteamCMD, and GNU `timeout`.
- The panel operates an existing server over RCON and does not provision hosts
  or run SteamCMD.
- Plugin-backed game modes require separately installed server plugins, maps,
  and CFG files.
- Pterodactyl material is migration guidance only.
- The panel package is private and is not an npm publication artifact.
- Theme preference is browser-local (`localStorage` key `3rr.theme`); it is not
  a server-side account setting.
