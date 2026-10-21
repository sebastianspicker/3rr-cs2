# 3RR Host Updater

The host updater compares the installed Counter-Strike 2 build with the current
public build, then stops the server only when an update is available. It runs on
a Linux host where systemd manages CS2 and SteamCMD is installed locally.

When migrating from `cs2-auto-update.timer`, disable that timer before enabling
`3rr-update.timer`. Never run both timers for the same server.

If SteamCMD cannot determine the current public build, the updater exits with a
non-zero status and leaves the server running.

## Capabilities

- Compares local and public build IDs through SteamCMD.
- Leaves the server running when the public build ID is unavailable.
- Retries each service stop, service start and status check, and the SteamCMD
  update step, up to `MAX_ATTEMPTS` times with `SLEEP_SECS` between attempts.
  A SteamCMD timeout is not retried, and a service start is never repeated as
  part of the SteamCMD retry.
- Limits the duration of SteamCMD and systemd calls, and attempts to restore the
  service after a failure or interruption.
- Confirms that the service is active before reporting success.
- Removes stale lock directories for dead processes while preserving locks that
  may still belong to a running process.
- Checks free disk space before updating.
- Logs to a root-owned file under `/var/lib/3rr` and to standard output for
  journald or cron.

## Update decision flow

1. Load and validate the configuration.
2. Create an atomic lock directory so only one updater can run at a time
   (`--status` skips the lock).
3. Read the local CS2 appmanifest build ID.
4. Ask SteamCMD for the remote public-branch build ID.
5. Exit without changing the service when the build is up to date or when the
   public build is unknown. Only when an update is needed, check free space,
   then exit for `--dry-run`.
6. Stop the service only when local and remote build IDs are known and different.
7. Run `steamcmd +app_update` (retried up to `MAX_ATTEMPTS` times on failure),
   read the new local build ID, restart the service
   if this run stopped it, and confirm that it is active.

The updater only restores service state that it changed itself. A service that
was already stopped (for example, on purpose) is never started, including on
up-to-date runs and after an update.

`--dry-run` never stops, updates, or starts the service and never modifies the CS2
installation. It still takes the lock, appends to the log, and lets SteamCMD
refresh its own app-info cache for the build check.

## Lock

The lock is the directory `/run/3rr-update.lock` (`LOCKDIR`), which only root can
create. The updater writes its PID to a temporary file inside the lock directory
and renames it, so the PID file is never partial. Recovery rules:

- A PID file naming a dead process is stale and is removed.
- A PID file naming a live process is trusted only if the recorded process start
  time and script path still match, which guards against PID reuse. Otherwise the
  updater stops and asks for manual cleanup.
- A lock directory with no PID file that is older than 60 seconds (a crash
  between `mkdir` and the PID rename) is stale and is recovered. A younger one
  may belong to a run that is still starting, so the updater stops.

Recovery removes only the updater's own `pid`, `meta`, and `pid.tmp.*` files and
then the directory with `rmdir`. A lock directory with any other content is left
for manual cleanup.

## Status check and exit codes

`--status` is read-only. It does not take the lock and never starts, stops, or
updates the service, so it is safe to run while an update is in progress (the
result may then be stale). Its exit status is:

| Exit status | Meaning                                        |
| ----------- | ---------------------------------------------- |
| `0`         | Up to date                                     |
| `10`        | Update available                               |
| other       | Error, or the local or public build is unknown |

Without `--status`, exit status `0` means the run succeeded or another updater is
already running, and a non-zero status means an error.

## Configuration

The configuration file accepts only the documented `KEY=value` settings. The
updater rejects unknown keys, duplicate active keys, empty values for
safety-critical settings, malformed non-comment lines, and unterminated quoted
values. Removed legacy keys produce a warning and are otherwise ignored, which
makes them visible during migration without preventing an update.

A configuration file passed with `--config=PATH` or `-c PATH` must exist and be
readable. An empty path, a missing file, or an unreadable file stops the run with
an error and a non-zero exit status. Without `--config`, the optional
`3rr-update.conf` next to the script is used when present, and defaults apply
otherwise.

`REQUIRED_SPACE` (in KB) defaults to `30000000` (about 30 GB), which is enough
for a CS2 update with `validate`. Lower it only if you know the install fits.

`MAX_ATTEMPTS` and `SLEEP_SECS` control every retried step: `systemctl stop` and
`start`, the post-start `is-active` checks, and the SteamCMD update. The SteamCMD
build-ID query is not retried.

Each SteamCMD call is limited by `STEAMCMD_TIMEOUT_SECS` (default: `1800`). Each
`systemctl stop`, `start`, and `is-active` call is limited by
`SYSTEMCTL_TIMEOUT_SECS` (default: `90`). Both use GNU `timeout` with
`--foreground --kill-after=10`.

The example systemd unit sets `TimeoutStartSec=240min`. Recalculate it whenever
`STEAMCMD_TIMEOUT_SECS`, `SYSTEMCTL_TIMEOUT_SECS`, `MAX_ATTEMPTS`, or
`SLEEP_SECS` changes. Use the following conservative upper bound. It includes
the build query, every SteamCMD update attempt, all normal service retries, a start whose status checks
fail, the cleanup attempt to restore the service, each ten-second kill grace,
and the retry delays:

```text
(1 + MAX_ATTEMPTS) * (STEAMCMD_TIMEOUT_SECS + 10)
+ (1 + 5 * MAX_ATTEMPTS) * (SYSTEMCTL_TIMEOUT_SECS + 10)
+ (6 * (MAX_ATTEMPTS - 1) + 1) * SLEEP_SECS
```

With the defaults, this is 13,585 seconds (226 minutes 25 seconds), leaving 13
minutes 35 seconds before the unit timeout. `TimeoutStopSec=20min` gives systemd
time to finish one in-progress systemctl timeout and a full attempt to restart
and check the service. Calculate that recovery limit with:

```text
(1 + 2 * MAX_ATTEMPTS) * (SYSTEMCTL_TIMEOUT_SECS + 10)
+ 2 * (MAX_ATTEMPTS - 1) * SLEEP_SECS
```

With the defaults, this is 1,140 seconds (19 minutes). The systemd deadlines
take precedence over the updater's internal timeouts.

When run as root, the configured log directory and existing log file must be
root-owned and must not be group- or world-writable. Keep `LOGFILE` outside the
`steam` account's writable home directory.

The default log is `/var/lib/3rr/update.log`, not a directory under `/var/log`. On Ubuntu,
`/var/log` is `root:syslog` with mode `0775`, and the ancestor check rejects
group-writable directories. `/var/lib` is `root:root` `0755`, so the updater can
create `/var/lib/3rr` (mode `0750`) itself. Setting `LOGFILE` below `/var/log`
works only on hosts where `/var/log` is not group- or world-writable.

`ALLOW_NONROOT`, `NO_SLEEP`, and `THREERR_TEST_MODE` are test-only environment
variables. Do not add them to the configuration file or to the systemd unit.

- `ALLOW_NONROOT=1` lets a non-root user run the whole script, with SteamCMD
  running as that user. It has no effect when the script runs as root: SteamCMD
  always runs as `steam`, and the updater logs a warning.
- `NO_SLEEP=1` skips retry delays only when `THREERR_TEST_MODE=1` is also set.
  Without it, `NO_SLEEP` is ignored with a warning.

SteamCMD runs as the `steam` account with that account's `HOME`, `USER`, and
`LOGNAME`. The updater reads the home directory from `getent passwd steam` and
stops with an error if the account or its home directory is missing, so SteamCMD
cannot write `~/.steam` into root's home when started by systemd.

## systemd hardening

`deploy/systemd/3rr-update.service` sets `PrivateTmp`, `ProtectSystem=full`,
`ProtectKernelTunables`, `ProtectKernelModules`, `ProtectControlGroups`,
`RestrictRealtime`, `RestrictSUIDSGID`, `LockPersonality`, and `NoNewPrivileges`.
`ProtectSystem=full` makes only `/usr`, `/boot`, `/efi`, and `/etc` read-only, so
the log in `/var/lib/3rr`, the lock in `/run`, and the CS2 install directory stay
writable. This hardening has not been verified on a real systemd host. Run the
supervised update from the installation steps and check `journalctl -u
3rr-update.service` before relying on the timer.

## Requirements

- Linux host with systemd
- CS2 installed under a service account named `steam`
- SteamCMD available on the host
- GNU coreutils `timeout` (the updater validates `timeout --version`)
- `getent` (part of glibc; used to find the `steam` home directory)

## Installation

Run the following commands from the repository root:

```bash
cd host-updater
sudo install -d /opt/3rr/apps/maintain/updater
sudo install -m 0755 3rr-update.sh /opt/3rr/apps/maintain/updater/3rr-update.sh
sudo install -d /opt/3rr/apps/maintain/updater/lib
sudo install -m 0644 lib/*.sh /opt/3rr/apps/maintain/updater/lib/
if ! sudo test -e /opt/3rr/apps/maintain/updater/3rr-update.conf; then
  sudo install -m 0600 3rr-update.conf.example /opt/3rr/apps/maintain/updater/3rr-update.conf
fi
sudo nano /opt/3rr/apps/maintain/updater/3rr-update.conf
sudo install -m 0644 ../deploy/systemd/3rr-update.service /etc/systemd/system/
sudo install -m 0644 ../deploy/systemd/3rr-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

The systemd unit expects the complete updater at
`/opt/3rr/apps/maintain/updater/`. Install the script, every file in `lib/`, and
the configuration there. Before enabling the timer, run:

```bash
sudo /opt/3rr/apps/maintain/updater/3rr-update.sh \
  --config=/opt/3rr/apps/maintain/updater/3rr-update.conf \
  --dry-run
sudo /opt/3rr/apps/maintain/updater/3rr-update.sh \
  --config=/opt/3rr/apps/maintain/updater/3rr-update.conf
sudo systemctl enable --now 3rr-update.timer
```

Monitor the CS2 service and updater log while the second command runs. Enable
the timer only after the dry run and supervised update both succeed.

## Development checks

Run the updater checks from `host-updater/`:

```bash
make ci
```

The updater has no web interface and does not require the control plane. Run the
repository-wide checks from the repository root when preparing a release.
