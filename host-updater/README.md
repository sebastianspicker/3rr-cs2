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
- Retries the stop, update, and start sequence.
- Limits the duration of SteamCMD and systemd calls, and attempts to restore the
  service after a failure or interruption.
- Confirms that the service is active before reporting success.
- Removes stale lock directories for dead processes while preserving locks that
  may still belong to a running process.
- Checks free disk space before updating.
- Logs to a root-owned file under `/var/log/3rr` and to standard output for
  journald or cron.

## Update decision flow

1. Load and validate the configuration.
2. Create an atomic lock directory so only one updater can run at a time.
3. Check free space and read the local CS2 appmanifest build ID.
4. Ask SteamCMD for the remote public-branch build ID.
5. Exit without changing the service for `--status`, `--dry-run`, or an unknown
   public build.
6. Stop the service only when local and remote build IDs are known and different.
7. Run `steamcmd +app_update`, read the new local build ID, restart the service,
   and confirm that it is active.

## Configuration

The configuration file accepts only the documented `KEY=value` settings. The
updater rejects unknown keys, duplicate active keys, empty values for
safety-critical settings, malformed non-comment lines, and unterminated quoted
values. Removed legacy keys produce a warning and are otherwise ignored, which
makes them visible during migration without preventing an update.

Each SteamCMD call is limited by `STEAMCMD_TIMEOUT_SECS` (default: `1800`). Each
`systemctl stop`, `start`, and `is-active` call is limited by
`SYSTEMCTL_TIMEOUT_SECS` (default: `90`). Both use GNU `timeout` with
`--foreground --kill-after=10`.

The example systemd unit sets `TimeoutStartSec=120min`. Recalculate it whenever
`STEAMCMD_TIMEOUT_SECS`, `SYSTEMCTL_TIMEOUT_SECS`, `MAX_ATTEMPTS`, or
`SLEEP_SECS` changes. Use the following conservative upper bound. It includes
both SteamCMD calls, all normal service retries, a start whose status checks
fail, the cleanup attempt to restore the service, each ten-second kill grace,
and the retry delays:

```text
2 * (STEAMCMD_TIMEOUT_SECS + 10)
+ (1 + 5 * MAX_ATTEMPTS) * (SYSTEMCTL_TIMEOUT_SECS + 10)
+ (5 * (MAX_ATTEMPTS - 1) + 1) * SLEEP_SECS
```

With the defaults, this is 6,325 seconds (105 minutes 25 seconds), leaving 14
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

`ALLOW_NONROOT` and `NO_SLEEP` are reserved for the test suite. Do not add them
to the configuration file.

## Requirements

- Linux host with systemd
- CS2 installed under a service account named `steam`
- SteamCMD available on the host
- GNU coreutils `timeout` (the updater validates `timeout --version`)

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
