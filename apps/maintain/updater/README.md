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
- optional in-game RCON player notification before server stop
- optional webhook notification

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

## Pre-update Player Notification

Set `NOTIFY_PLAYERS_MESSAGE` in the conf file to broadcast a message to in-game players
via RCON before the server stops for an update. This requires an RCON CLI tool on the
system path (default: `rcon-cli` from [gorcon/rcon-cli](https://github.com/gorcon/rcon-cli)).

```ini
NOTIFY_PLAYERS_MESSAGE=Server is restarting for an update in 30 seconds
RCON_CLI=rcon-cli
RCON_HOST=127.0.0.1
RCON_PORT=27015
RCON_PASSWORD=your_rcon_password
```

The notification is **non-fatal**: if the RCON binary is missing or the command fails,
a warning is logged and the update continues normally. Leave `NOTIFY_PLAYERS_MESSAGE`
empty (the default) to disable the feature entirely.
