# Changelog

## [1.1.0-alpha.1] - Unreleased

### Changed

- Rebranded the operator surface to `3RR` and the package/image prefix to
  `3rr`.
- Changed the default database filename to `3rr.db` and the default session cookie to
  `3rr.sid`. Existing deployments must rename the database file or keep an explicit
  `DB_PATH`; existing browser sessions will be signed out.
- Marked the package private and aligned its version with the proposed umbrella
  alpha tag. The package is not intended for npm publication.
- Added Redis to the maintained Compose deployment and bound the published
  panel port to `127.0.0.1` by default.

### Security

- Pin each validated RCON hostname to the literal DNS answer used for the
  connection and reject mixed allowed/blocked answer sets.
- Close and await authenticating sockets when a server is removed, preventing
  a late authentication from recreating state for a deleted server.

### Fixed

- Bound command, authentication, heartbeat, disconnect, and application
  shutdown paths; report unconfirmed socket cleanup instead of claiming a
  clean exit.
- Keep heartbeat recovery scheduled after immediate reconnect failure and
  clear completed timeout timers.
- Make server/access persistence, server deletion, and user/orphan-server
  deletion atomic at the SQLite boundary, with explicit partial RCON-cleanup
  responses.
- Assign migrated server owners deterministically and move static assets ahead
  of session middleware.

## [1.0.0] - 2026-04-19

- imported the standalone panel into `cs2-server-ops` as the `operate` module
- aligned package metadata, docs, and validation with the umbrella repo
