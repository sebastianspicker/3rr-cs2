# 3RR Provision Assets

This module provides bootstrap files and a startup wrapper for self-hosted CS2
servers.

It includes:

- an environment-variable reference
- an atomic writer for CounterStrikeSharp admin files
- an atomic writer for plugin environment and list files
- a startup wrapper that validates runtime values and keeps tokens and RCON
  credentials out of the launched process environment

It does not install CS2, SteamCMD, Metamod, CounterStrikeSharp, plugins, maps, or
systemd units.

## Requirements

- Bash
- an existing CS2 installation or a reviewed container image
- local values for the required server credentials

## Usage

Copy `env/server.env.example` to an untracked file and set the values required
by your runtime. Write the bootstrap files:

```bash
cd apps/provision/bootstrap
scripts/bootstrap-admins.sh ../../../configs/examples/compose/bootstrap
scripts/bootstrap-plugins.sh ../../../configs/examples/compose/bootstrap
```

The writers create files with mode `0600` and replace existing regular files
atomically. Review their reference contents before using them on a server.

Start from
`../../../configs/examples/compose/server-runtime.compose.yaml` or
`../../../configs/examples/startup/server-start.sh`. The Compose example uses
the external `cm2network/cs2` image and mounts
`../../../configs/examples/compose/bootstrap` read-only at `/bootstrap`.

The startup wrapper requires `RCON_PASSWORD`. `CS2_GSLT` is optional. It accepts
ports from 1 through 65535 and player limits from 1 through 64.

## Validation

From the repository root:

```bash
bash apps/provision/bootstrap/tests/bootstrap-output-safety.test.sh
bash apps/provision/bootstrap/tests/startup-wrapper-safety.test.sh
./scripts/verify.sh
```
