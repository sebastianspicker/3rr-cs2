# 3RR Maintain Updater

When upgrading from the pre-3RR updater, disable `cs2-auto-update.timer` before
installing and enabling `3rr-update.timer`; both timers must never run together.

The updater compares local and remote Counter-Strike 2 build IDs and stops the
server service only when an update is confirmed.

If the remote build status cannot be determined, the updater exits non-zero and leaves the service running instead of forcing speculative downtime.

## Capabilities

- SteamCMD build-ID comparison
- unknown-remote handling that exits without stopping the service
- stop/update/start lifecycle with retries
- bounded SteamCMD calls and automatic service restoration on failure or interruption
- post-start active checks before reporting update success
- dead-PID stale-lock recovery with fail-closed handling for unverifiable live locks
- disk-space checks
- root-owned file logging under `/var/log/3rr` plus stdout for journald/cron

## Update decision flow

1. Load environment/config values, then trim and validate them.
2. Acquire an atomic lock directory so only one updater runs at a time.
3. Check free space and read the local CS2 appmanifest build ID.
4. Ask SteamCMD for the remote public-branch build ID.
5. Exit before touching systemd when `--status`, `--dry-run`, or unknown remote status applies.
6. Stop the service only when local and remote build IDs are known and different.
7. Run `steamcmd +app_update`, read the post-update build ID, restart the service, verify it is active, then report the result.

## Configuration

Config files accept only the documented `KEY=value` settings. Unknown keys,
duplicate active keys, and explicit empty critical values fail fast; removed
legacy keys are ignored with a warning so older configs are visible during
migration.

Malformed non-comment lines and unterminated quoted values also fail fast. Each
SteamCMD invocation is bounded by `STEAMCMD_TIMEOUT_SECS` (default: 1800).

The example systemd unit caps the complete updater run at 65 minutes, covering
both default SteamCMD budgets plus normal lifecycle overhead. That unit deadline
takes precedence: if you raise `STEAMCMD_TIMEOUT_SECS`, also raise
`TimeoutStartSec` above twice that value plus the configured stop/start retry
budget.

When run as root, the configured log directory and existing log file must be
root-owned and must not be group- or world-writable. Keep `LOGFILE` outside the
`steam` account's writable home directory.

`ALLOW_NONROOT` and `NO_SLEEP` are environment-only test harness controls, not
supported config-file keys.

## Requirements

- Linux host with systemd
- CS2 installed under a service account named `steam`
- SteamCMD available on the host
- GNU coreutils `timeout`

## Installation

Run the following commands from the repository root:

```bash
cd apps/maintain/updater
sudo install -d /opt/3rr/apps/maintain/updater
sudo install -m 0755 3rr-update.sh /opt/3rr/apps/maintain/updater/3rr-update.sh
sudo install -d /opt/3rr/apps/maintain/updater/lib
sudo install -m 0644 lib/*.sh /opt/3rr/apps/maintain/updater/lib/
sudo install -m 0600 3rr-update.conf.example /opt/3rr/apps/maintain/updater/3rr-update.conf
sudo nano /opt/3rr/apps/maintain/updater/3rr-update.conf
sudo install -m 0644 ../../../configs/examples/systemd/3rr-update.service /etc/systemd/system/
sudo install -m 0644 ../../../configs/examples/systemd/3rr-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

The systemd examples assume the
`/opt/3rr/apps/maintain/updater/` layout. Before enabling the timer, run:

```bash
sudo /opt/3rr/apps/maintain/updater/3rr-update.sh \
  --config=/opt/3rr/apps/maintain/updater/3rr-update.conf \
  --dry-run
sudo /opt/3rr/apps/maintain/updater/3rr-update.sh \
  --config=/opt/3rr/apps/maintain/updater/3rr-update.conf
sudo systemctl enable --now 3rr-update.timer
```

Run the second command while monitoring the CS2 service and updater log. Enable
the timer only after both commands succeed.

## Validation

```bash
make ci
```

## Limitations

- this module does not provide a web UI
- this module can be used without the panel
- shared documentation and repository verification live at the repository root
