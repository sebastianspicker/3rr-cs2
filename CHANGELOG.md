# Changelog

## Unreleased

### Changed

- Reorganized the repository around `control-plane`, `host-updater`,
  `server-bootstrap`, and `deploy` while retaining the public HTTP,
  environment, SQLite v3, `enc:v1`, RCON, updater CLI/configuration, and
  installed updater-path contracts.

## [1.1.0-alpha.1] - 2026-07-23

### Changed

- Renamed the project and public identifiers to `3RR`.
- Changed the default SQLite filename and session cookie to `3rr.db` and
  `3rr.sid`.
- Added Redis to the maintained control-plane deployment and bound its
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
  build, and reject false-success updates whose build ID did not change.
- Validate stale-lock process identity, configuration syntax, disk-space
  output, startup values, and database/proxy defaults consistently.
- Preserve CFG-before-map ordering during game setup and fail production on
  unhandled promise rejections.

## [1.0.0] - 2026-04-19

- Combined the existing control-plane and updater projects with the initial
  server-bootstrap assets, deployment examples, and shared documentation.
