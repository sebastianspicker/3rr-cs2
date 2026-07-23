# Release Status

Evidence cutoff: 2026-07-23

Verdict: local freeze candidate tagged `v1.1.0-alpha.1`. Not published to
GitHub. Full production-like and Docker matrix remains incomplete.

## Candidate Identity

- Working branch: `remediation/codacy-verification-closure`
- Freeze tag (local): `v1.1.0-alpha.1` (annotated tag on this branch tip)
- Product freeze commit: `90e3d6a` (`release: freeze v1.1.0-alpha.1 Night Desk operate panel`)
- Docs/screenshot pins: commits after product freeze on the same tag tip
- Canonical GitHub repository: `sebastianspicker/cs2-server-ops`
- Proposed umbrella tag: `v1.1.0-alpha.1`
- Panel package: private, version `1.1.0-alpha.1`
- Updater: version `1.9.0-alpha.1`

The product name is 3RR. The existing GitHub repository name remains
`cs2-server-ops`; a repository rename is not part of this candidate.

This freeze captures the Night Desk Instrument UI, modular CSS build, dual-theme
tokens with Settings appearance toggle, manage truth rail, and the eight-view
screenshot tour. Upstream divergence with `main`/`origin` may still exist at
freeze time; reconcile before public GitHub release.

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
- `npm run screenshots`: regenerated all eight screenshot-manifest views
  (`01`–`08`) on the freeze tree with Node 22.23.1, Playwright 1.59.1, and
  Chromium. Desktop overflow gates passed; Settings includes Appearance theme
  controls. Captures use the default Night Desk theme.

## Blocked Or Incomplete Evidence

- `npm run validate -- --require-docker` / full `./scripts/verify.sh` Docker
  lane may still fail if the Docker daemon is inaccessible.
- No production-like CS2/RCON deployment, supervised updater run, migration,
  backup restore, graceful shutdown, or rollback was exercised in this freeze.
- Tag exists locally only until an owner publishes the GitHub prerelease.
- Branch may still need reconcile with `main` before remote publish.

## Required Before Public GitHub Alpha

1. Reconcile freeze branch with `main` if still divergent; keep freeze commit
   identity or re-tag after reconcile with explicit owner approval.
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
