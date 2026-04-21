# Changelog

## Unreleased

### Security

- **Panel RCON DNS revalidation** — initial startup now runs persisted servers through the same `isResolvedHostAllowed` hostname guard used for reconnects, preventing private-range bypass on first connect (finding #19)
- **RCON command serialisation** — same-server RCON calls are now queued via `enqueueServerTask`, eliminating shared-connection races that could corrupt in-flight commands (finding #20)
- **Server-existence information leak** — `add-server` now returns a generic "Unable to authenticate" message instead of confirming whether an IP:port is already registered by another user (finding #22)
- **Add-server rate limiter** — limiter now uses `RateLimitRedisStore` when Redis is configured, preventing per-instance bypass in multi-replica deployments (finding #23)

### Fixed

- **Panel test suite** — `npm test` now runs `build:client` before compiling and executing tests; static asset paths resolved correctly from both `dist/` and repo root (findings #1, #27)
- **Panel test fixture** — `validate.sh --require-docker` test now stubs all prerequisite binaries (`shellcheck`, `shfmt`, `jq`, `ruby`) so the compose-cleanup path under test is actually reached
- **Compose DB volume** — shared panel compose example mounts volume at `/home/container/data` to match the panel's default DB path (finding #4)
- **Compose placeholder credentials** — example compose files no longer reference `.env.example` directly; secrets are supplied via variable substitution only (finding #5)
- **Env contract wired** — `server-start.sh` now passes `CS2_HOSTNAME`, `CS2_GSLT`, `CS2_CFG_FILE`, `CSS_ADMINS_FILE`, and `CSS_GROUPS_FILE` through to the CS2 process (finding #6)
- **Bootstrap assets connected** — runtime compose example mounts bootstrap-generated admin/plugin outputs and invokes the startup wrapper (finding #7)
- **Systemd/README path alignment** — updater systemd unit and README quick-start now reference the same `/opt/cs2-server-ops/…` layout (finding #8)
- **Panel compose hardening** — shared compose example now includes `read_only`, `tmpfs`, `no-new-privileges`, and memory/CPU limits (finding #9)
- **Startup wrapper robustness** — `server-start.sh` uses `SCRIPT_DIR` for path independence and validates `CS2_PORT`/`CS2_MAXPLAYERS` via `require_integer_in_range` (finding #10)
- **Updater false-success** — `determine_post_update_state` compares build ID before and after `steamcmd`; a zero exit with unchanged build ID no longer triggers a restart or success webhook (finding #11)
- **Remote lookup failure handling** — transient SteamCMD/network failures now exit non-zero and leave the service running rather than triggering a full stop/update/start cycle (finding #12)
- **Stale lock PID reuse** — lock file now records `process_start_time` metadata; stale-lock detection validates both PID and process start time (finding #13)
- **Status/dry-run portability** — `--status` and `--dry-run` exit before any `systemctl` call, making read-only checks work on non-systemd hosts (finding #14)
- **Config comment stripping** — `strip_unquoted_comment` tracks single- and double-quote state; `#` inside quoted values is preserved (finding #15)
- **Status mode ambiguity** — unknown build ID is now reported as `unknown` with `exit 1`, distinct from a confirmed update-available state (finding #16)
- **Disk-space parsing** — `df -Pk` (POSIX portable) used instead of platform-specific flags (finding #17)
- **Updater test coverage** — test harness covers false-success updates, remote lookup failure in `--status`, PID-reuse stale-lock, and stop/start retry failures (finding #18)
- **setup-game ordering** — cfg name is validated and applied before `changelevel`; half-applied state on cfg failure is eliminated (finding #21)
- **Login form minlength** — removed client-side `minlength="12"` that blocked login for existing accounts with shorter passwords (finding #24)
- **Unhandled rejection behaviour** — production mode now calls `process.exit(1)` on unhandled promise rejections instead of logging and continuing (finding #25)
- **RCON_SECRET_KEY docs** — panel README updated to reflect that the key is mandatory in production (finding #26)
- **CI action pinning** — GitHub Actions workflows pinned to immutable commit SHAs (finding #3)
- **YAML safe-load** — CI validation uses `YAML.safe_load_file` instead of the unsafe `YAML.load_file` family (finding #2)
- **Panel .gitignore** — added `tmp-entry-cs2-panel-*/` pattern to cover temp dirs created by `entrypoint.test.ts`

### Added

- Initial umbrella scaffold for `cs2-server-ops`
- Imported `operate` from the existing CS2 panel as a module subtree
- Imported `maintain` from `cs2-auto-update`
- Added public-facing `provision` bootstrap assets, shared docs, and root verification
