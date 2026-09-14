# 3RR Server Bootstrap

`server-bootstrap` contains configuration that runs inside the CS2 server,
scripts for creating private administrator files, and the CS2 startup wrapper.
You can use it independently of the control plane and host updater.

It includes:

- `assets/cfg/`: shipped game-mode CFG files
- `assets/cfg/server-provided/`: server-local reference CFGs that are not
  installed automatically
- `capabilities.json`: lists the CFG assets and their plugin requirements; the
  test suite keeps this list in sync with the shipped files
- an atomic, mode-`0600` writer for CounterStrikeSharp administrator files
- a startup wrapper that validates runtime values and keeps RCON and GSLT
  credentials out of the launched process environment

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

The script writes files with mode `0600`. It can replace existing regular files
atomically, so use a new staging directory as shown above. In the generated
`admins.json`, replace the example SteamID64 and the `replace-me` identity with
the intended administrator before deployment. Keep the generated files outside
version control.

Start from `deploy/compose/server-runtime.compose.yaml`. It mounts
`server-bootstrap/scripts/server-start.sh` and the shipped CFG bundle read-only.
When `CS2_CFG_BUNDLE_DIR` is set, the wrapper links only the CFG paths listed in
`capabilities.json`. Other paths in the bundle are ignored. The optional
`server-provided/live.cfg` is not installed automatically. If you use MatchZy,
review it and install it separately as the server's local `live.cfg`.

The wrapper requires `RCON_PASSWORD`. `CS2_GSLT` is optional. It accepts ports
from 1 through 65535 and player limits from 1 through 64.

## Development checks

Run these checks from the repository root:

```bash
bash server-bootstrap/tests/bootstrap-output-safety.test.sh
bash server-bootstrap/tests/startup-wrapper-safety.test.sh
bash server-bootstrap/tests/capabilities-contract.test.sh
```
