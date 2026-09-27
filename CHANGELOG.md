# Changelog

## Unreleased

### Changed

- Redesigned the control-plane interface as a strict VGUI system: raised
  elements can be pressed, sunken elements show what the server reported, and
  dashed outlines show requested values that are not yet true. Barlow Semi
  Condensed and Barlow Condensed replace system fonts (Inter and Syne, which
  were unused, are removed). The olive texture is gone, and gold is limited to
  the commit action and the current selection. Tool tabs moved to the top of
  the server page, with the session steps inside Setup. Routes, IDs,
  `data-*` attributes, and behavior are unchanged.

- Reorganized the repository around `control-plane`, `host-updater`,
  `server-bootstrap`, and `deploy` without changing the HTTP API,
  environment settings, SQLite v3 schema, `enc:v1` credential format, RCON
  behavior, updater commands and configuration, or installed updater paths.
- The control plane now requires Node 26 (`>=26 <27`) and `better-sqlite3`
  13. The container image is pinned to `node:26.9.0-bookworm-slim` by digest.
- RCON code is reached only through `src/integrations/rcon/index.ts`, and its
  SQLite access moved to `src/infrastructure/sqlite`. SQL in the control plane
  now lives only in feature `repository.ts` modules and that directory; the
  architecture check enforces both rules.
- CI runs the verifier's sections as parallel jobs behind one `verify` check.
  `scripts/verify.sh` gained `--only`, `--quick`, and `--help`, needs Bash 4,
  and fails when tracked file modes drift from `scripts/executable-files.txt`.
- The GitHub repository is now `3rr-cs2`; the Pages demo moved to
  <https://sebastianspicker.github.io/3rr-cs2/> and includes a screenshot tour.

### Added

- Dependabot updates for npm, GitHub Actions, and the Docker base image.
- CodeQL analysis for TypeScript/JavaScript and workflows.
- HTTP-level integration tests for servers, users, workshop favorites, auth,
  and health.

### Fixed

- Keep the host updater in its fail-closed unknown state when the public Steam
  branch has no build ID, even if another branch does, and reject malformed
  digest-pinned image names in the deployment preflight.
- Pin patched transitive releases for request query parsing and the ESLint
  filesystem helper.

## [1.1.0-alpha.1] - 2026-07-23

### Changed

- Renamed the project and public identifiers to `3RR`.
- Changed the default SQLite filename and session cookie to `3rr.db` and
  `3rr.sid`.
- Added Redis to the control-plane deployment example and bound its
  published port to `127.0.0.1` by default.
- Renamed the updater, configuration, systemd units, lock path, and log path.
  Existing installations must disable `cs2-auto-update.timer` before enabling
  `3rr-update.timer`.

### Security

- Revalidate RCON hostnames before initial connections and reconnects.
- Serialize same-server RCON commands to prevent shared-connection races.
- Return a generic authentication failure when an add-server request conflicts
  with another user's server.
- Use Redis-backed add-server rate limiting when Redis is configured.

### Fixed

- Keep the CS2 service running when the updater cannot determine the remote
  build, and reject updates reported as successful when the build ID did not change.
- Validate stale-lock process identity, configuration syntax, disk-space
  output, startup values, and database/proxy defaults consistently.
- Run CFG commands before map changes during game setup, and stop the
  production process on unhandled promise rejections.

## [1.0.0] - 2026-04-19

- Combined the existing control-plane and updater projects with the initial
  server-bootstrap assets, deployment examples, and shared documentation.
