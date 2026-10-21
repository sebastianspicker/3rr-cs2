# 3RR Server Bootstrap

`server-bootstrap` contains configuration that runs inside the CS2 server,
scripts for creating private administrator files, and the CS2 startup wrapper.
You can use it independently of the control plane and host updater.

It includes:

- `assets/cfg/`: shipped game-mode CFG files
- `assets/cfg/server-provided/`: server-local reference CFGs that are not
  installed automatically
- `capabilities.json`: lists the CFG assets and their plugin requirements. The
  gate (`scripts/verify.sh`) fails when it differs from the files in
  `assets/cfg/` or from the list in `scripts/server-start.sh`. Each
  `shippedCfg` entry may carry an optional `requiresPlugins` array of plugin
  IDs that CFG needs; an entry without it has no plugin requirement that could
  be established from the CFG's content. The top-level `requiredPluginIds`
  lists only the plugins the panel itself needs (`schemaVersion` stays 1).
- an atomic, mode-`0600` writer for CounterStrikeSharp administrator files
- a startup wrapper that validates runtime values and removes the RCON and GSLT
  credentials from the launched process environment. It still writes them to
  `game/csgo/cfg/3rr-secrets.cfg` (mode `0600`) on the persistent runtime
  volume; that file remains readable by the game process and its plugins and is
  included in volume backups, so treat such backups as secrets

These files do not install CS2, SteamCMD, Metamod, CounterStrikeSharp, plugins,
maps, or systemd units. The CFG files configure server rules, but any plugins
they depend on must already be installed.

## Usage

From the repository root, create a private environment file and a new staging
directory for the CounterStrikeSharp administrator files:

```bash
cp -n server-bootstrap/env/server.env.example deploy/compose/server.env
chmod 0600 deploy/compose/server.env
BOOTSTRAP_DIR=deploy/compose/bootstrap
test ! -e "$BOOTSTRAP_DIR" || { echo "Bootstrap directory already exists" >&2; exit 1; }
server-bootstrap/scripts/bootstrap-admins.sh "$BOOTSTRAP_DIR"
```

The script writes files with mode `0600`. Usage is
`bootstrap-admins.sh [--force] [OUT_DIR]`; `OUT_DIR` defaults to `./output`. It
refuses, with exit status 1, when `admins.json` or `admin_groups.json` already
exists in `OUT_DIR`, so a re-run cannot discard your edits. Pass `--force` to
replace them atomically. In the generated
`admins.json`, rename the `admin` entry if you like and replace
`REPLACE_WITH_STEAMID64` with the administrator's SteamID64 before deployment.
Group names in both files must keep their leading `#`, or CounterStrikeSharp
ignores them. Keep the generated files outside version control.

Start from `deploy/compose/server-runtime.compose.yaml`. It mounts
`server-bootstrap/scripts/server-start.sh` and the shipped CFG bundle read-only.
When `CS2_CFG_BUNDLE_DIR` is set, the wrapper links only the CFG paths listed in
`capabilities.json`. Other paths in the bundle are ignored. The optional
`server-provided/live.cfg` is not installed automatically. If you use MatchZy,
review it and install it separately as the server's local `live.cfg`.

The wrapper requires `RCON_PASSWORD`. `CS2_GSLT` is optional. Both may contain
only printable ASCII characters other than `"` and `\`, because CFG files have
no escape sequences; the wrapper refuses to start otherwise. It accepts ports
from 1 through 65535 and player limits from 1 through 64.
