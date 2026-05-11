# Maintain: Updater

This module is the `maintain` surface of `cs2-server-ops`.

It keeps a Counter-Strike 2 dedicated server updated by comparing local and remote build IDs and
only stopping the service when a real update is available.

If the remote build status cannot be determined, the updater exits non-zero and leaves the service running instead of forcing speculative downtime.

## What It Does

- safe update detection via SteamCMD build IDs
- unknown-remote detection that preserves availability instead of forcing a stop/update/start cycle
- stop/update/start lifecycle with retries
- stale-lock recovery
- disk-space checks

## Update Decision Flow

1. Load environment/config values, then trim and validate them.
2. Acquire an atomic lock directory so only one updater runs at a time.
3. Check free space and read the local CS2 appmanifest build ID.
4. Ask SteamCMD for the remote public-branch build ID.
5. Exit before touching systemd when `--status`, `--dry-run`, or unknown remote status applies.
6. Stop the service only when local and remote build IDs are known and different.
7. Run `steamcmd +app_update`, restart the service, then verify the post-update build ID.

## Requirements

- Linux host with systemd
- CS2 installed under a service account such as `steam`
- SteamCMD available on the host

## Quick Start

```bash
sudo install -d /opt/cs2-server-ops/apps/maintain/updater
sudo install -m 0755 update_cs2.sh /opt/cs2-server-ops/apps/maintain/updater/update_cs2.sh
sudo install -m 0644 cs2-auto-update.conf.example /opt/cs2-server-ops/apps/maintain/updater/cs2-auto-update.conf
sudo nano /opt/cs2-server-ops/apps/maintain/updater/cs2-auto-update.conf
```

The shared systemd unit examples in `../../../configs/examples/systemd/` assume that same `/opt/cs2-server-ops/apps/maintain/updater/` layout.

## Validation

```bash
make ci
```

## Scope Boundary

- this module does not provide a web UI
- this module can be used without the panel
- shared publication, docs, and CI live at repo root
