# Changelog

## [1.1.0-alpha.1] - 2026-07-23

Local freeze candidate for the umbrella public-alpha identity. Tag `v1.1.0-alpha.1` is created locally on the freeze commit; GitHub release/push is separate.

### Added

- Public-alpha release guidance, issue and pull-request templates, CODEOWNERS,
  screenshot requirements, and an explicit validation status.

### Changed

- Rebranded the product and canonical GitHub repository to `3RR`.
- Renamed npm/Docker identifiers, install paths, updater/config/systemd files, the default
  SQLite filename, session cookie, runtime secret CFG, and test fixtures to the new identity.
- Set the private panel package to `1.1.0-alpha.1` and the updater to
  `1.9.0-alpha.1` for the proposed umbrella candidate.
- Added a Redis service to the maintained panel Compose deployments and bound
  the published panel port to `127.0.0.1` by default.
- Moved screenshot-capture state to an isolated operating-system temporary
  directory. Playwright run state remains under the ignored `.e2e/` directory.
- Existing pre-rebrand installations must rename their database file before using the new
  default path, disable the previous updater timer, and install the new unit files.

## [1.0.0] - 2026-04-19

### Security

- Panel RCON DNS revalidation: initial startup now runs persisted servers through the same `isResolvedHostAllowed` hostname guard used for reconnects, preventing private-range bypass on first connect
- RCON command serialization: same-server RCON calls are now queued via `enqueueServerTask`, eliminating shared-connection races that could corrupt in-flight commands
- Server-existence information leak: `add-server` now returns a generic "Unable to authenticate" message instead of confirming whether an IP:port is already registered by another user
- Add-server rate limiter: the limiter now uses `RateLimitRedisStore` when Redis is configured, preventing per-instance bypass in multi-replica deployments

### Fixed

- Panel test suite: `npm test` now runs `build:client` before compiling and executing tests; static asset paths resolve correctly from both `dist/` and the repository root
- Panel test fixture: the Docker-required validation test stubs all prerequisite binaries so the Compose cleanup path under test is reached
- Compose DB volume: the shared panel Compose example mounts its volume at `/home/container/data` to match the panel's default DB path
- Compose placeholder credentials: example Compose files no longer reference `.env.example` directly; secrets are supplied through variable substitution
- Environment contract: `server-start.sh` passes `CS2_HOSTNAME`, `CS2_GSLT`, `CS2_CFG_FILE`, `CSS_ADMINS_FILE`, and `CSS_GROUPS_FILE` to the CS2 process
- Bootstrap assets: the runtime Compose example mounts bootstrap administrator and plugin output and invokes the startup wrapper
- Systemd and README paths: the updater unit and README use the same `/opt/cs2-server-ops/…` layout
- Panel Compose hardening: the shared example includes `read_only`, `tmpfs`, `no-new-privileges`, and memory and CPU limits
- Startup wrapper validation: `server-start.sh` uses `SCRIPT_DIR` for path independence and validates `CS2_PORT` and `CS2_MAXPLAYERS`
- Updater false success: post-update build ID comparison prevents restart or success reporting when SteamCMD exits zero without changing the build
- Remote lookup failure handling: transient SteamCMD or network failures exit nonzero and leave the service running
- Stale-lock PID reuse: stale-lock detection validates both PID and process start time
- Status and dry-run portability: `--status` and `--dry-run` exit before any `systemctl` call
- Config comment stripping: `#` inside single- or double-quoted values is preserved
- Status ambiguity: an unknown build ID is distinct from a confirmed available update
- Disk-space parsing: `df -Pk` replaces platform-specific flags
- Updater test coverage: the harness covers false-success updates, lookup failure, PID reuse, and stop and start retry failures
- Setup-game ordering: the CFG is validated and applied before `changelevel`
- Login form validation: existing accounts with passwords shorter than the bootstrap minimum can sign in
- Unhandled rejections: production exits instead of logging and continuing
- RCON key documentation: the panel README identifies `RCON_SECRET_KEY` as required in production
- CI action pinning: GitHub Actions workflows use immutable commit SHAs
- YAML parsing: CI uses safe YAML loading
- Panel temporary files: the ignore rules cover entrypoint test directories

### Added in 1.0.0

- Initial umbrella scaffold for `cs2-server-ops`
- Imported `operate` from the existing standalone operator panel as a module subtree
- Imported `maintain` from `cs2-auto-update`
- Added public-facing `provision` bootstrap assets, shared docs, and root verification
