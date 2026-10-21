# Provision a CS2 server

Run these commands from the repository root.

1. Copy the environment reference to an ignored local file:

   ```bash
   cp -n server-bootstrap/env/server.env.example deploy/compose/server.env
   chmod 0600 deploy/compose/server.env
   ```

2. Set `RCON_PASSWORD` and the required `CS2_*` values in that local file.
   Also set `CS2_RCON_BIND_ADDRESS` to the private interface address the panel
   uses to reach RCON, and firewall the RCON TCP port (`CS2_PORT`) so only the
   panel's host can connect. The default, `0.0.0.0`, publishes it on every
   interface. The image selected by `CS2_IMAGE` must already contain CS2 at
   `CS2_INSTALL_DIR`, or the volume must be pre-populated; otherwise the
   wrapper exits with "CS2 binary not found". The mounted `./bootstrap` files
   have mode `0600` and must be owned by, or readable to, the container's user
   ID. See [environment variables](../reference/env.md).
3. Create the CounterStrikeSharp administrator files in a local directory that
   is not tracked by Git:

   ```bash
   BOOTSTRAP_DIR=deploy/compose/bootstrap
   test ! -e "$BOOTSTRAP_DIR" || { echo "Bootstrap directory already exists" >&2; exit 1; }
   server-bootstrap/scripts/bootstrap-admins.sh "$BOOTSTRAP_DIR"
   ```

   Usage is `bootstrap-admins.sh [--force] [OUT_DIR]`. The script refuses to
   overwrite an existing `admins.json` or `admin_groups.json` unless you pass
   `--force`.

4. In `admins.json`, replace `REPLACE_WITH_STEAMID64` with the administrator's SteamID64.
   Review `admin_groups.json`, `server-bootstrap/capabilities.json`, and the
   rendered Compose configuration:

   ```bash
   jq . server-bootstrap/capabilities.json
   docker compose --env-file deploy/compose/server.env \
     -f deploy/compose/server-runtime.compose.yaml config
   ```

5. Adapt the storage, network, and image settings to the host, then start the
   runtime:

   ```bash
   docker compose --env-file deploy/compose/server.env \
     -f deploy/compose/server-runtime.compose.yaml up -d
   ```

6. Confirm server startup, the configured map, and RCON authentication before
   connecting the control plane.

The startup wrapper writes `game/csgo/cfg/3rr-secrets.cfg` with mode `0600`. It
removes `RCON_PASSWORD` and `CS2_GSLT` from the environment before launching
CS2, but the file stays on the persistent runtime volume. It is readable by the
game process and its plugins (same user) and is included in volume backups, so
treat those backups as secrets (see [recovery](../recovery.md)). The bootstrap files do not install plugins, maps, SteamCMD, or host
services.
