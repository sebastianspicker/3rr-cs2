# Maintain: Updater

This module is the `maintain` surface of `cs2-server-ops`.

It keeps a Counter-Strike 2 dedicated server updated by comparing local and remote build IDs and
only stopping the service when a real update is available.

## What It Does

- safe update detection via SteamCMD build IDs
- stop/update/start lifecycle with retries
- stale-lock recovery
- disk-space checks
- optional webhook notification

## Requirements

- Linux host with systemd
- CS2 installed under a service account such as `steam`
- SteamCMD available on the host

## Quick Start

```bash
sudo cp update_cs2.sh /home/steam/update_cs2.sh
sudo chmod +x /home/steam/update_cs2.sh
sudo cp cs2-auto-update.conf.example /home/steam/cs2-auto-update.conf
sudo nano /home/steam/cs2-auto-update.conf
```

Systemd unit examples live in `../../../configs/examples/systemd/`.

## Validation

```bash
make ci
```

## Scope Boundary

- this module does not provide a web UI
- this module can be used without the panel
- shared publication, docs, and CI live at repo root
