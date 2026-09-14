# Changelog

Release history for the host updater. Older entries retain the names and
paths used by those releases.

## [1.9.0-alpha.1] - Unreleased

### Changed

- Renamed the updater script, configuration, systemd units, installation
  paths, lock path, and log path to use `3rr-update`. Disable the previous `cs2-auto-update.timer`
  before installing and enabling the renamed units.
- Set the updater version output to `1.9.0-alpha.1` for the next 3RR alpha
  release.

### Security

- Moved the default log to a root-owned path. The updater checks the log file
  and each parent directory before use and no longer passes a writable log
  descriptor to SteamCMD.
- The updater now stops if it cannot verify a live lock or a lock directory
  lacks ownership metadata. It no longer removes these locks automatically.

### Added

- Added `STEAMCMD_TIMEOUT_SECS` to limit each SteamCMD call through GNU
  `timeout`.
- Added `SYSTEMCTL_TIMEOUT_SECS` to limit each service operation and status
  check through GNU `timeout`.

### Fixed

- Restore and confirm the CS2 service after update failure, timeout, partial
  stop failure, or termination while stopping.
- Reject malformed config lines and unterminated quoted values.
- Recalculate and test the example systemd start and stop deadlines to allow
  for both SteamCMD calls, systemctl retries, and service restoration after
  failure.

### Removed

- Removed optional webhook and RCON player notifications. The updater warns
  when it ignores their old configuration keys.
- Removed unused `LOG_LEVEL=verbose`; supported values are `quiet` and `normal`.

## [1.8.0] - 2026-04-19

### Security

- Compare build IDs before and after `steamcmd`. A zero exit code with an
  unchanged build ID no longer triggers a restart or success webhook.
- A failed remote lookup (`steamcmd +app_info_print`) now returns a non-zero
  exit code and leaves the service running.

### Fixed

- Record `process_start_time` in the lock file. Recovery checks both the PID
  and process start time so a reused PID is not mistaken for the original
  process.
- `--status` and `--dry-run` now exit before any `systemctl` call, restoring portability on non-systemd hosts.
- Preserve `#` inside quoted configuration values. `strip_unquoted_comment`
  now tracks both single and double quotes.
- Report an unknown build ID as `unknown` with `exit 1` in `--status`, rather
  than reporting an available update.
- `df -Pk` (POSIX portable) replaces platform-specific flags.
- Systemd unit and README quick-start now reference the same `/opt/cs2-server-ops/…` install layout.

### Tests

- Added tests for unchanged build IDs after reported success, failed remote
  lookups in `--status`, reused PIDs in stale locks, and stop/start retry
  failures.

### Added

- 19 new test cases (40 total): `--help`, `--version`, `--status`, `-c FILE`, validation edge cases, disk space, webhook, config file parsing, stale lock without PID file.
- Configurable `df` mock (`DF_AVAILABLE`) and `curl` mock for webhook tests.
- Test counter and summary output.
- `make help` and `make clean` Makefile targets.
- Pinned shfmt SHA-256 checksums in `ci-tools-versions.env`.

### Changed

- Trap now handles `SIGTERM`, `SIGINT`, `SIGHUP` in addition to `EXIT`.
- Treat an empty lock directory without a PID file as a stale lock that can
  be recovered, rather than reporting "already running".
- Webhook JSON escaping handles backslashes, newlines, carriage returns, and tabs.
- Logfile created with mode `0640` and log directory with `0750` (not world-readable).
- `run_as_steam()` removes redundant `return $?` and trims trailing space in `su` command string.
- Reset all environment variables in `run_validation_test()` so one test
  cannot affect the next.
- `CONTRIBUTING.md` expanded with local setup, formatting style, and CODEOWNERS info.
- README config table now includes `DRY_RUN`, `ALLOW_NONROOT`, `NO_SLEEP`; documents all CLI flag forms.

### Additional fixes

- Removed the unreachable `REQUIRED_SPACE -lt 0` check; the regular expression
  already rejects negative values.
- Moved the top-level trimming loop into `trim_config_vars()` to keep its
  variables local.
- `read_buildid()` no longer silently masks awk errors; logs warning on failure.
- Service restart failure after failed SteamCMD update is now logged instead of silently suppressed.

### Additional security changes

- Pinned shfmt checksums locally instead of downloading them alongside the
  release being checked.
- Signal handling: cleanup trap covers SIGTERM/SIGINT/SIGHUP to prevent lock leaks on kill.
- File permissions: new logfiles are not world-readable.

## [1.6.1] - 2026-03-01

### Changed

- Check lock ownership, record PID metadata, and recover stale locks.
- Reject unknown CLI options and unexpected positional arguments immediately.
- `--dry-run` now has explicit precedence over config values.
- Updated the README flowcharts to show failure paths and the resulting
  service state.

### Fixed

- Config parsing now works on older Bash variants (including `/bin/bash` 3.2).
- Return an error when lock creation fails, rather than reporting a successful
  "already running" result.
- Secret scan now reports scanner errors correctly instead of treating them as clean runs.
- Create temporary files under `${TMPDIR:-/tmp}` rather than in the current
  working directory.

## [1.6.0] - 2026-02-28

### Added

- CLI option `--config=FILE` or `-c FILE` to set config file path (alternative to `CONFIG_FILE` env).
- CLI option `--status`: print up-to-date or update available (local/remote buildid), then exit; no service stop/update/start.
- Example config file `cs2-auto-update.conf.example`; README Quick start and config file reference.
- Run duration in completion log (e.g. "Update process completed (12s)").
- Log level prefixes `[INFO]`, `[WARN]`, `[ERROR]` in log output for parsing.

### Changed

- Moved configuration loading into `load_config_file()`.
  `CONFIG_AND_TRIM_VARS` lists the permitted keys and values to trim.
- Moved defaults into `apply_defaults()`, called after loading configuration
  and again after trimming values.
- Tests: removed redundant `tests/bin/df` (inline mock in `run.sh` only); added `run_validation_test()` helper for validation tests.
- Documented that the Makefile `ci` target runs checks in the same order as
  the CI workflow.

## [1.5.0] - 2026-02-19

### Added

- CLI options: `--help`, `--version`, `--dry-run` (lock + disk + buildid check only; no update).
- `LOG_LEVEL=quiet|normal|verbose` (quiet: only ERROR/WARNING).
- Optional config file: `CONFIG_FILE` or `cs2-auto-update.conf` next to script; same keys as env.
- Optional webhook notification on successful update: `NOTIFY_WEBHOOK_URL` (e.g. Discord/Slack).
- Added `scripts/shell-files.env` as the shared file list for `lint.sh` and
  `fmt.sh`.
- LOGFILE path validation (no `..`).

### Changed

- `.gitignore`: added `.cursor/`; slimmer (Bash-only repo).
- README: exit codes, config file, webhook, and repository structure (`shell-files.env`).

## [1.4.0] - 2026-01-31

### Added

- Remote buildid check via `steamcmd +app_info_print` to avoid unnecessary service restarts when up-to-date.
- Added `tests/run.sh` with command stubs for testing control flow without
  Steam or systemd.
- Added `CS2_APP_ID` and `SLEEP_SECS` settings, plus `ALLOW_NONROOT` and
  `NO_SLEEP` for tests.

### Changed

- Running SteamCMD as `steam` no longer requires `sudo` specifically; the script uses `runuser`/`su`/`sudo` (best-effort).
- Preserve existing `PATH` (append `/usr/games`) instead of overwriting it.

## [1.3.0] - 2026-01-31

### Added

- Local/CI lint tooling via `scripts/lint.sh` and GitHub Actions.
- `shfmt` auto-format helper via `scripts/fmt.sh`.
- Optional buildid-based update detection via `steamapps/appmanifest_730.acf`.

### Changed

- Switched lockfile to an atomic lock directory (`LOCKDIR`) to avoid startup races.
- Enabled `set -euo pipefail` and added explicit dependency checks.
- Write logs to both stdout and `LOGFILE` for use with cron and journald.

## [1.2.0] - 2025-04-18

### Added

- Precise update detection: the pattern matches both `up-to-date` variants and `download complete`.
- Service health check: `ensure_service_running()` confirms service status when no update is applied.

### Changed

- Improved logging messages for better clarity in success and error cases.
- Changed `cleanup()` to remove the lockfile only when the current run
  created it.

## [1.1.0] - 2025-04-02

### Added

- Split the script into functions, including `init_lock()`, `check_space()`,
  and `stop_service()`.
- Trap cleanup: `trap cleanup EXIT` removes the lock after an unexpected exit.
- Added configurable retries for service stop and start operations.

### Changed

- Moved configuration variables to top of script for easier customization.
- Switched disk-check command to `df --output=avail` for more reliable parsing.

## [1.0.0] - 2025-03-15

### Added

- Initial release of `update_cs2.sh`.
  - Lockfile mechanism to prevent overlapping runs.
  - Disk-space check (default 5 GB).
  - Stops CS2 service (`cs2.service`) before update.
  - Performs SteamCMD update with `+app_update 730 validate`.
  - Parses SteamCMD output for “already up-to-date.”
  - Restarts service only when update applied.
  - Detailed timestamped logging.
  - Designed for execution via root cron with logrotate support.

## [0.1.0] - DEPRECATED

This version was an experimental prototype and is no longer supported.
