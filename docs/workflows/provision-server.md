# Provision a CS2 server

Run these commands from the repository root.

1. Copy the environment reference to an ignored local file:

   ```bash
   cp -n server-bootstrap/env/server.env.example deploy/compose/server.env
   chmod 0600 deploy/compose/server.env
   ```

2. Set `RCON_PASSWORD` and the required `CS2_*` values in that local file.
3. Create the CounterStrikeSharp administrator files in a local directory that
   is not tracked by Git:

   ```bash
   BOOTSTRAP_DIR=deploy/compose/bootstrap
   test ! -e "$BOOTSTRAP_DIR" || { echo "Bootstrap directory already exists" >&2; exit 1; }
   server-bootstrap/scripts/bootstrap-admins.sh "$BOOTSTRAP_DIR"
   ```

4. In `admins.json`, replace the example SteamID64 and `replace-me` identity.
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
CS2. The bootstrap files do not install plugins, maps, SteamCMD, or host
services.
