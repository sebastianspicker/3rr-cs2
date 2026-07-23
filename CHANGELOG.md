# Changelog

## [1.1.0-alpha.1] - 2026-07-23

Local freeze candidate for the umbrella public-alpha identity. Tag `v1.1.0-alpha.1` is created locally on the freeze commit; GitHub release/push is separate.

### Added

- Public-alpha release guidance, issue and pull-request templates, CODEOWNERS,
  screenshot requirements, and an explicit validation status.

### Changed

- Rebranded the product to `3RR` while retaining
  `sebastianspicker/cs2-server-ops` as the canonical GitHub repository.
- Renamed npm/Docker identifiers, install paths, updater/config/systemd files, the default
  SQLite filename, session cookie, generated secret cfg, and test fixtures to the new identity.
- Set the private panel package to `1.1.0-alpha.1` and the updater to
  `1.9.0-alpha.1` for the proposed umbrella candidate.
- Added a Redis service to the maintained panel Compose deployments and bound
  the published panel port to `127.0.0.1` by default.
- Moved screenshot-capture state and an E2E boundary fixture to isolated
  operating-system temporary directories. Playwright run state remains under
  the ignored `.e2e/` directory.
- Existing pre-rebrand installations must rename their database file before using the new
  default path, disable the previous updater timer, and install the new unit files.

### Removed

- Superseded audit, plan, remediation-ledger, migration-ledger, dry-run report,
  obsolete screenshots, and tracked local CodeGraph and Serena metadata from
  the public repository surface.

### Security in 1.0.0

- RCON connections now use validated, pinned DNS answers and deletion waits
  for both managed and still-authenticating sockets to close.
- Updater logging, lock recovery, SteamCMD timeouts, and interrupted service
  restoration fail closed at their privilege and availability boundaries.
- Provisioning and startup writers atomically replace file symlinks, reject
  directory destinations, keep secret files private, and remove RCON/GSLT
  values from the launched CS2 process environment.
- The panel Compose examples no longer trust proxy headers or publish to every
  host interface by default.

### Fixed in 1.0.0

- Panel shutdown, heartbeat recovery, command timeouts, server/access
  transactions, user/orphan cleanup, and deterministic owner migration.
- Configurable CS2 ports are published consistently for both TCP and UDP.
- Updater config parsing, timeout handling, service recovery, and log-file
  ownership validation.

## [1.0.0] - 2026-04-19

### Security

- **Panel RCON DNS revalidation** - initial startup now runs persisted servers through the same `isResolvedHostAllowed` hostname guard used for reconnects, preventing private-range bypass on first connect
- **RCON command serialisation** - same-server RCON calls are now queued via `enqueueServerTask`, eliminating shared-connection races that could corrupt in-flight commands
- **Server-existence information leak** - `add-server` now returns a generic "Unable to authenticate" message instead of confirming whether an IP:port is already registered by another user
- **Add-server rate limiter** - limiter now uses `RateLimitRedisStore` when Redis is configured, preventing per-instance bypass in multi-replica deployments

### Fixed

- **Panel test suite** - `npm test` now runs `build:client` before compiling and executing tests; static asset paths resolved correctly from both `dist/` and repo root
- **Panel test fixture** - `validate.sh --require-docker` test now stubs all prerequisite binaries (`shellcheck`, `shfmt`, `jq`, `ruby`) so the compose-cleanup path under test is actually reached
- **Compose DB volume** - shared panel compose example mounts volume at `/home/container/data` to match the panel's default DB path
- **Compose placeholder credentials** - example compose files no longer reference `.env.example` directly; secrets are supplied via variable substitution only
- **Env contract wired** - `server-start.sh` now passes `CS2_HOSTNAME`, `CS2_GSLT`, `CS2_CFG_FILE`, `CSS_ADMINS_FILE`, and `CSS_GROUPS_FILE` through to the CS2 process
- **Bootstrap assets connected** - runtime compose example mounts bootstrap-generated admin/plugin outputs and invokes the startup wrapper
- **Systemd/README path alignment** - updater systemd unit and README quick-start now reference the same `/opt/cs2-server-ops/…` layout
- **Panel compose hardening** - shared compose example now includes `read_only`, `tmpfs`, `no-new-privileges`, and memory/CPU limits
- **Startup wrapper robustness** - `server-start.sh` uses `SCRIPT_DIR` for path independence and validates `CS2_PORT`/`CS2_MAXPLAYERS` via `require_integer_in_range`
- **Updater false-success** - `determine_post_update_state` compares build ID before and after `steamcmd`; a zero exit with unchanged build ID no longer triggers a restart or success webhook
- **Remote lookup failure handling** - transient SteamCMD/network failures now exit non-zero and leave the service running rather than triggering a full stop/update/start cycle
- **Stale lock PID reuse** - lock file now records `process_start_time` metadata; stale-lock detection validates both PID and process start time
- **Status/dry-run portability** - `--status` and `--dry-run` exit before any `systemctl` call, making read-only checks work on non-systemd hosts
- **Config comment stripping** - `strip_unquoted_comment` tracks single- and double-quote state; `#` inside quoted values is preserved
- **Status mode ambiguity** - unknown build ID is now reported as `unknown` with `exit 1`, distinct from a confirmed update-available state
- **Disk-space parsing** - `df -Pk` (POSIX portable) used instead of platform-specific flags
- **Updater test coverage** - test harness covers false-success updates, remote lookup failure in `--status`, PID-reuse stale-lock, and stop/start retry failures
- **setup-game ordering** - cfg name is validated and applied before `changelevel`; half-applied state on cfg failure is eliminated
- **Login form minlength** - removed client-side `minlength="12"` that blocked login for existing accounts with shorter passwords
- **Unhandled rejection behaviour** - production mode now calls `process.exit(1)` on unhandled promise rejections instead of logging and continuing
- **RCON_SECRET_KEY docs** - panel README updated to reflect that the key is mandatory in production
- **CI action pinning** - GitHub Actions workflows pinned to immutable commit SHAs
- **YAML safe-load** - CI validation uses `YAML.safe_load_file` instead of the unsafe `YAML.load_file` family
- **Panel .gitignore** - added `tmp-entry-cs2-server-ops-*/` pattern to cover temp dirs created by `entrypoint.test.ts`

### Added in 1.0.0

- Initial umbrella scaffold for `cs2-server-ops`
- Imported `operate` from the existing standalone operator panel as a module subtree
- Imported `maintain` from `cs2-auto-update`
- Added public-facing `provision` bootstrap assets, shared docs, and root verification
