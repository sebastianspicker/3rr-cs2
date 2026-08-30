# 3RR Server Bootstrap

`server-bootstrap` owns server-executed configuration, private administrator
bootstrap output, and the CS2 startup wrapper. It can be used independently of
the control plane and host updater.

It includes:

- `assets/cfg/`: shipped game-mode CFG files
- `assets/cfg/server-provided/`: server-local reference CFGs that are not
  installed automatically
- `capabilities.json`: the enforced inventory of CFG assets and plugin
  requirements
- an atomic, mode-`0600` writer for CounterStrikeSharp administrator files
- a startup wrapper that validates runtime values and keeps RCON and GSLT
  credentials out of the launched process environment

It does not install CS2, SteamCMD, Metamod, CounterStrikeSharp, plugins, maps,
or systemd units. CFG files establish server rules; they do not install their
required plugins.

## Usage

Copy `env/server.env.example` to an untracked operator environment file and
write the private CounterStrikeSharp administrator files:

```bash
server-bootstrap/scripts/bootstrap-admins.sh deploy/compose/bootstrap
```

The writer creates mode-`0600` files and replaces existing regular files
atomically. Review the generated administrator identifiers before deploying.

Start from `deploy/compose/server-runtime.compose.yaml`. It mounts
`server-bootstrap/scripts/server-start.sh` and the shipped CFG bundle read-only.
When `CS2_CFG_BUNDLE_DIR` is set, the wrapper links only the CFG paths listed in
`capabilities.json`; it does not copy arbitrary bundle paths. The optional
`server-provided/live.cfg` is intentionally excluded from that automatic
installation and must be reviewed and installed as a server-local `live.cfg`
when MatchZy is used.

The wrapper requires `RCON_PASSWORD`. `CS2_GSLT` is optional. It accepts ports
from 1 through 65535 and player limits from 1 through 64.

## Validation

```bash
bash server-bootstrap/tests/bootstrap-output-safety.test.sh
bash server-bootstrap/tests/startup-wrapper-safety.test.sh
bash server-bootstrap/tests/capabilities-contract.test.sh
```
